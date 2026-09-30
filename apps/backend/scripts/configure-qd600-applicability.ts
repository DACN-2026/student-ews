import { prisma } from "../lib/prisma";
import {
  AcademicWarningsService,
} from "../lib/services/academic-warnings";
import {
  parseAcademicWarningPolicyDefinition,
  type Qd600PolicyDefinition,
} from "../lib/services/academic-warning-policy";

const APPLY = process.argv.includes("--apply");
const QD600_APPLICABLE_FROM_COHORT = 45;
const QD600_POLICY_NAME = "QĐ 600/QĐ-ĐHĐL — Điều 18";

function qd600CohortNumber(code: string) {
  const match = /^K(\d+)$/i.exec(code.trim());
  return match ? Number(match[1]) : null;
}

async function main() {
  const [cohorts, policies] = await Promise.all([
    prisma.cohort.findMany({
      where: { deletedAt: null },
      orderBy: { sCohortCode: "asc" },
      select: { id: true, sCohortCode: true, sCohortName: true },
    }),
    prisma.academicWarningPolicy.findMany({ orderBy: [{ version: "desc" }, { createdAt: "desc" }] }),
  ]);
  const qd600Policies = policies.flatMap((policy) => {
    try {
      const definition = parseAcademicWarningPolicyDefinition(policy.policyDefinition);
      return definition.evaluationProfile === "QD600_ARTICLE_18" ? [{ policy, definition }] : [];
    } catch {
      return [];
    }
  });
  if (qd600Policies.length !== 1) {
    throw new Error(`Expected exactly one QĐ600 policy definition; found ${qd600Policies.length}`);
  }

  const { policy, definition } = qd600Policies[0];
  if (policy.status !== "draft") {
    throw new Error(`QĐ600 policy ${policy.id} must be draft; current status is ${policy.status}`);
  }
  const completedOfficialRunCount = await prisma.academicWarningRun.count({
    where: { policyId: policy.id, status: "completed", runMode: "OFFICIAL" },
  });
  if (completedOfficialRunCount > 0) {
    throw new Error(`QĐ600 policy ${policy.id} is immutable; create a new revision instead`);
  }

  const applicableCohorts = cohorts.filter((cohort) => {
    const cohortNumber = qd600CohortNumber(cohort.sCohortCode);
    return cohortNumber !== null && cohortNumber >= QD600_APPLICABLE_FROM_COHORT;
  });
  const applicableCohortIds = applicableCohorts.map((cohort) => cohort.id);
  const updatedDefinition: Qd600PolicyDefinition = {
    ...definition,
    regulatory: { ...definition.regulatory, applicableCohortIds },
  };

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    policyId: policy.id,
    policyVersion: policy.version,
    policyStatus: policy.status,
    completedOfficialRunCount,
    applicableCohorts,
    applicableCohortIds,
  };
  if (!APPLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const updated = await AcademicWarningsService.updatePolicy(policy.id, {
    name: QD600_POLICY_NAME,
    policyDefinition: updatedDefinition,
    status: "draft",
  });
  console.log(JSON.stringify({ ...report, updatedPolicy: updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
