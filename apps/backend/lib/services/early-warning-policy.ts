import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { parseAcademicWarningPolicyDefinition } from "./academic-warning-policy";

/** The same policy selection is used by configuration, previews and persisted runs. */
export async function findEarlyWarningPolicy(client: Pick<typeof prisma, "academicWarningPolicy"> = prisma) {
  const candidates = await client.academicWarningPolicy.findMany({ where: { status: "draft" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }] });
  for (const policy of candidates) {
    try {
      const definition = parseAcademicWarningPolicyDefinition(policy.policyDefinition);
      if (definition.evaluationProfile === "QD600_ARTICLE_18") return { policy, definition };
    } catch { /* Invalid or unrelated definitions cannot become the monitoring policy. */ }
  }
  throw new ApiError("Chưa có chính sách theo dõi sớm dựa trên QĐ600 được cấu hình.", "QD600_POLICY_NOT_FOUND", 422);
}
