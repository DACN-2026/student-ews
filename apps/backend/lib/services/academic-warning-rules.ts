import {
  LEGACY_SIGNAL_SOURCE_TYPES,
  type LegacySignalSourceType,
} from "@/lib/services/academic-warning-qd600-rules";

export type WarningDataStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT";

export interface WarningStudentSource {
  id: string;
  classId: string | null;
  cohortId: string | null;
  code: string;
  name: string;
  classCode: string;
  className: string;
  programCode: string;
}

export interface WarningProgressSource {
  status: string;
  runId: string;
}

export interface WarningCompletionSource {
  scheduleStatus: string;
  runId: string;
  creditDeficit?: number | null;
  dataStatus?: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  reasonCode?: string | null;
}

export interface WarningSummarySource {
  termSummaryId: string;
  cumulativeSummaryId: string | null;
  registered: number | null;
  termGPA4: number | null;
  termGPA10: number | null;
  cumulativeGPA4: number | null;
  cumulativeGPA10: number | null;
}

export interface WarningDecisionSource {
  id: string;
  number: string;
  name: string;
  fullText: string;
  signDate: Date | null;
}

export interface WarningConductSource {
  id: string;
  score: number;
  statusId: string;
}

export interface SummerMonitoringSource {
  offeringCount: number;
  registeredCredits: number;
  pendingResults: number;
  failedCourses: number;
}

export interface WarningReasonData {
  reasonCode: string;
  severity: string;
  title: string;
  details: Record<string, unknown>;
  sourceType: string | null;
  sourceId: string | null;
}

export interface WarningEvaluationResult {
  termRegisteredCredits: number | null;
  termGPA4: number | null;
  termGPA10: number | null;
  cumulativeGPA4: number | null;
  cumulativeGPA10: number | null;
  registrationStatus: string;
  scheduleStatus: string;
  academicWarningDecisions: number;
  maxSeverity: string;
  reasonCount: number;
  dataStatus: WarningDataStatus;
  dataError: string | null;
  reasons: WarningReasonData[];
}

export interface AcademicWarningEvaluationInput {
  student: WarningStudentSource;
  progress?: WarningProgressSource | null;
  completion?: WarningCompletionSource | null;
  summary?: WarningSummarySource | null;
  decisions?: WarningDecisionSource[];
  conduct?: WarningConductSource | null;
  policy: {
    termGpaThreshold: number;
    cumulativeGpaThreshold: number;
    conductScoreThreshold?: number;
  };
}

function summaryDataStatus(summary?: WarningSummarySource | null): {
  dataStatus: WarningDataStatus;
  dataError: string | null;
} {
  if (!summary) {
    return { dataStatus: "INSUFFICIENT", dataError: "missing_student_term_summary" };
  }
  const missing: string[] = [];
  if (summary.termGPA4 == null) missing.push("missing_term_gpa");
  if (summary.cumulativeGPA4 == null) missing.push("missing_cumulative_gpa");
  if (!missing.length) return { dataStatus: "COMPLETE", dataError: null };
  return {
    dataStatus: missing.length === 2 ? "INSUFFICIENT" : "PARTIAL",
    dataError: missing.join(","),
  };
}

/**
 * Deterministic warning evaluation. This module must stay free of database and
 * request-context dependencies so OFFICIAL and PREVIEW flows share one rule set.
 */
export function evaluateAcademicWarning(input: AcademicWarningEvaluationInput): WarningEvaluationResult {
  const { progress, completion, summary, decisions = [], conduct, policy } = input;
  const completeness = summaryDataStatus(summary);
  const result: WarningEvaluationResult = {
    termRegisteredCredits: summary?.registered ?? null,
    termGPA4: summary?.termGPA4 ?? null,
    termGPA10: summary?.termGPA10 ?? null,
    cumulativeGPA4: summary?.cumulativeGPA4 ?? null,
    cumulativeGPA10: summary?.cumulativeGPA10 ?? null,
    registrationStatus: progress?.status ?? "unavailable",
    scheduleStatus: completion?.scheduleStatus ?? "unavailable",
    academicWarningDecisions: decisions.length,
    maxSeverity: "none",
    reasonCount: 0,
    dataStatus: completeness.dataStatus,
    dataError: completeness.dataError,
    reasons: [],
  };

  const addReason = (
    reasonCode: string,
    severity: string,
    title: string,
    details: Record<string, unknown>,
    sourceType: string | null,
    sourceId: string | null,
    semanticSourceType: LegacySignalSourceType,
  ) => {
    result.reasons.push({
      reasonCode,
      severity,
      title,
      details: { ...details, semanticSourceType },
      sourceType,
      sourceId,
    });
    result.reasonCount += 1;
    if (severity === "high" || result.maxSeverity === "none") result.maxSeverity = severity;
  };

  if (progress?.status === "fail") {
    addReason(
      "REGISTRATION_BEHIND",
      "medium",
      "Đăng ký chưa đủ theo kế hoạch",
      { status: progress.status },
      "training_progress_calculation_run",
      progress.runId,
      LEGACY_SIGNAL_SOURCE_TYPES.REGISTRATION_BEHIND,
    );
  }

  if (completion?.scheduleStatus === "behind_schedule") {
    addReason(
      "PROGRAM_PROGRESS_BEHIND",
      "high",
      "Chậm tiến độ toàn khóa",
      { scheduleStatus: completion.scheduleStatus },
      "training_progress_completion_run",
      completion.runId,
      LEGACY_SIGNAL_SOURCE_TYPES.PROGRAM_PROGRESS_BEHIND,
    );
  }

  if (summary?.termGPA4 != null && summary.termGPA4 < policy.termGpaThreshold) {
    addReason(
      "LOW_TERM_GPA",
      "medium",
      "GPA học kỳ thấp",
      { gpa4: summary.termGPA4, threshold: policy.termGpaThreshold },
      "student_term_summary",
      summary.termSummaryId,
      LEGACY_SIGNAL_SOURCE_TYPES.LOW_TERM_GPA,
    );
  }

  if (summary?.cumulativeGPA4 != null && summary.cumulativeGPA4 < policy.cumulativeGpaThreshold) {
    addReason(
      "LOW_CUMULATIVE_GPA",
      "high",
      "GPA tích lũy thấp",
      { gpa4: summary.cumulativeGPA4, threshold: policy.cumulativeGpaThreshold },
      summary.cumulativeSummaryId ? "student_cumulative_summary" : "student_term_summary",
      summary.cumulativeSummaryId || summary.termSummaryId,
      LEGACY_SIGNAL_SOURCE_TYPES.LOW_CUMULATIVE_GPA,
    );
  }

  if (
    conduct?.statusId === "1" &&
    policy.conductScoreThreshold != null &&
    conduct.score < policy.conductScoreThreshold
  ) {
    addReason(
      "LOW_CONDUCT_SCORE",
      "medium",
      "Điểm rèn luyện dưới ngưỡng theo dõi",
      { score: conduct.score, threshold: policy.conductScoreThreshold, approvalStatus: "approved" },
      "student_conduct_record",
      conduct.id,
      LEGACY_SIGNAL_SOURCE_TYPES.LOW_CONDUCT_SCORE,
    );
  }

  if (decisions.length) {
    addReason(
      "ACADEMIC_WARNING_DECISION",
      "high",
      "Có quyết định cảnh báo học vụ",
      {
        count: decisions.length,
        decisions: decisions.map((decision) => ({
          id: decision.id,
          decisionNumber: decision.number,
          decisionName: decision.name,
          fullText: decision.fullText,
          signDate: decision.signDate,
        })),
      },
      "student_decisions",
      null,
      LEGACY_SIGNAL_SOURCE_TYPES.ACADEMIC_WARNING_DECISION,
    );
  }

  if (result.maxSeverity === "none" && result.reasonCount > 0) result.maxSeverity = "medium";
  return result;
}

export function evaluateSummerMonitoring(input: {
  student: WarningStudentSource;
  summary?: WarningSummarySource | null;
  monitoring?: SummerMonitoringSource | null;
}): WarningEvaluationResult {
  const { summary, monitoring } = input;
  const result: WarningEvaluationResult = {
    termRegisteredCredits: monitoring?.registeredCredits ?? summary?.registered ?? null,
    termGPA4: summary?.termGPA4 ?? null,
    termGPA10: summary?.termGPA10 ?? null,
    cumulativeGPA4: summary?.cumulativeGPA4 ?? null,
    cumulativeGPA10: summary?.cumulativeGPA10 ?? null,
    registrationStatus: monitoring ? "participating" : "not_participating",
    scheduleStatus: "not_assessed",
    academicWarningDecisions: 0,
    maxSeverity: "none",
    reasonCount: 0,
    dataStatus: monitoring ? (monitoring.pendingResults > 0 ? "PARTIAL" : "COMPLETE") : "INSUFFICIENT",
    dataError: monitoring ? (monitoring.pendingResults > 0 ? "summer_results_pending" : null) : "missing_summer_monitoring_data",
    reasons: [],
  };

  const addReason = (reasonCode: string, title: string, count: number) => {
    result.reasons.push({
      reasonCode,
      severity: "medium",
      title,
      details: { count, monitoringOnly: true, semanticSourceType: "OPERATIONAL_SIGNAL" },
      sourceType: "summer_monitoring",
      sourceId: null,
    });
    result.reasonCount += 1;
    result.maxSeverity = "medium";
  };

  if (monitoring?.pendingResults) addReason("SUMMER_RESULT_PENDING", "Kết quả học phần hè đang chờ", monitoring.pendingResults);
  if (monitoring?.failedCourses) addReason("SUMMER_COURSE_NOT_PASSED", "Học phần hè chưa đạt", monitoring.failedCourses);
  return result;
}

export function warningDataStatusFromStored(dataError: string | null): WarningDataStatus {
  if (!dataError) return "COMPLETE";
  return dataError.includes("missing_term_gpa") && dataError.includes("missing_cumulative_gpa") ||
    dataError === "missing_student_term_summary" ||
    dataError === "missing student term summary" ||
    dataError === "missing_summer_monitoring_data" ||
    dataError === "qd600_regulatory_coverage_insufficient"
    ? "INSUFFICIENT"
    : "PARTIAL";
}

export function warningPresentationState(input: {
  maxSeverity: string;
  reasonCount: number;
  dataStatus: WarningDataStatus;
}) {
  if (input.maxSeverity === "high") return "HIGH_RISK" as const;
  if (input.maxSeverity === "medium" || input.reasonCount > 0) return "MONITORING" as const;
  if (input.dataStatus !== "COMPLETE") return "INSUFFICIENT_DATA" as const;
  return "NORMAL" as const;
}
