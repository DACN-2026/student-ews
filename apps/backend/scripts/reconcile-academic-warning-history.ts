import { prisma } from "../lib/prisma";
import { AcademicWarningAutomationService } from "../lib/services/academic-warning-automation";
import { ReportsService } from "../lib/services/reports";

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Pass --apply to reconcile and persist historical academic-warning results.");
  }
  const actor = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!actor) throw new Error("No system user is available for the reconciliation audit trail.");

  const result = await AcademicWarningAutomationService.reconcilePastTermsWithGrades({
    actorId: actor.id,
    facultyCode: null,
  });
  const runIds = result.results.flatMap((item) => item.evaluation.results.flatMap((scope) => (
    scope.runId ? [scope.runId] : []
  )));
  const persistedStatuses = runIds.length
    ? await prisma.academicWarningStudentResult.groupBy({
        by: ["businessStatus"],
        where: { runId: { in: runIds } },
        _count: { _all: true },
      })
    : [];
  const report = await ReportsService.academicWarningStudents({ page: 1, pageSize: 1 });
  const latestRuleRows = report.mode.runIds.length
    ? await prisma.academicWarningStudentResult.findMany({
        where: { runId: { in: report.mode.runIds } },
        select: { ruleResults: true },
      })
    : [];
  const latestRuleSignals: Record<string, {
    breached: number;
    near: number;
    notEvaluated: number;
    reasonCodes: Record<string, number>;
  }> = {};
  for (const row of latestRuleRows) {
    if (!Array.isArray(row.ruleResults)) continue;
    for (const value of row.ruleResults) {
      if (!value || Array.isArray(value) || typeof value !== "object") continue;
      const ruleCode = typeof value.ruleCode === "string" ? value.ruleCode : "UNKNOWN";
      const counts = latestRuleSignals[ruleCode] || { breached: 0, near: 0, notEvaluated: 0, reasonCodes: {} };
      if (value.isThresholdBreached === true) counts.breached += 1;
      if (value.isNearThreshold === true) counts.near += 1;
      if (value.evaluationStatus === "NOT_EVALUATED") {
        counts.notEvaluated += 1;
        const reasonCode = typeof value.reasonCode === "string" ? value.reasonCode : "UNSPECIFIED";
        counts.reasonCodes[reasonCode] = (counts.reasonCodes[reasonCode] || 0) + 1;
      }
      latestRuleSignals[ruleCode] = counts;
    }
  }
  const interventionCaseCount = await prisma.warningAction.count({
    where: { caseType: "EARLY_WARNING_CASE" },
  });
  console.log(JSON.stringify({
    eligibleTermCount: result.eligibleTermCount,
    processedTermCount: result.processedTermCount,
    completedScopeCount: result.completedScopeCount,
    skippedScopeCount: result.skippedScopeCount,
    failedScopeCount: result.failedScopeCount,
    persistedStudentResultCount: persistedStatuses.reduce((sum, item) => sum + item._count._all, 0),
    persistedStatuses: Object.fromEntries(
      persistedStatuses.map((item) => [item.businessStatus, item._count._all]),
    ),
    reportVerification: {
      hasCompletedOfficialRun: report.hasCompletedOfficialRun,
      latestPeriod: report.latestPeriod?.label || null,
      total: report.total,
      persistedResultCount: report.evaluationState.persistedResultCount,
      persistedStatuses: report.counts.businessStatus,
      ruleSignals: latestRuleSignals,
      interventionCaseCount,
    },
    terms: result.results.map((item) => ({
      term: `${item.termCode} ${item.academicYearCode}`,
      summaries: item.summaryCount,
      autoFinalized: item.autoFinalized,
      scopes: item.evaluation.scopeCount,
      completed: item.evaluation.completed,
      skipped: item.evaluation.skipped,
      failed: item.evaluation.failed,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
