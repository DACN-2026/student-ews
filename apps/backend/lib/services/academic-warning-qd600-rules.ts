import type {
  AcademicWarningCapabilitySnapshot,
  AcademicWarningCapabilityStatus,
  FailedCreditCalculation,
  Qd600YearLevelClassification,
} from "@/lib/services/academic-warning-capabilities";
import {
  createAcademicWarningPolicySnapshot,
  type Qd600PolicyDefinition,
} from "@/lib/services/academic-warning-policy";

export const QD600_EXECUTION_PROFILE = "QD600_PARTIAL_REGULATORY" as const;
export const QD600_RULE_ENGINE_VERSION = "academic-warning-qd600-article18-and-progress-v12" as const;

export type Qd600RuleCode =
  | "QD600_FAILED_CREDIT_RATIO"
  | "QD600_CUMULATIVE_GPA_BY_YEAR"
  | "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD"
  | "QD600_TERM_GPA"
  | "QD600_ACCUMULATED_DEBT_CREDITS"
  | "ACCUMULATED_DEBT_CREDIT_RISK"
  | "TRAINING_PROGRESS_CREDIT_DEFICIT";

export type Qd600RuleSourceType = "REGULATORY" | "ADVISORY" | "OPERATIONAL";
export type Qd600RuleEvaluationStatus = "EVALUATED" | "NOT_EVALUATED" | "NOT_APPLICABLE";
export type Qd600RuleDataStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "UNVERIFIED";
export type Qd600BusinessStatus = "NORMAL" | "MONITORING" | "HIGH_RISK" | "VERIFY_REQUIRED" | "INSUFFICIENT_DATA";
export type Qd600CoverageStatus = "FULL" | "PARTIAL" | "INSUFFICIENT";
export type LegacySignalSourceType = "ADVISORY" | "OPERATIONAL_SIGNAL" | "OFFICIAL_CONTEXT";

export const LEGACY_SIGNAL_SOURCE_TYPES = {
  REGISTRATION_BEHIND: "OPERATIONAL_SIGNAL",
  PROGRAM_PROGRESS_BEHIND: "OPERATIONAL_SIGNAL",
  LOW_TERM_GPA: "ADVISORY",
  LOW_CUMULATIVE_GPA: "ADVISORY",
  LOW_CONDUCT_SCORE: "ADVISORY",
  ACADEMIC_WARNING_DECISION: "OFFICIAL_CONTEXT",
} as const satisfies Record<string, LegacySignalSourceType>;

export type LegacySignalCode = keyof typeof LEGACY_SIGNAL_SOURCE_TYPES;

export type Qd600RuleEvaluation = {
  ruleCode: Qd600RuleCode;
  sourceType: Qd600RuleSourceType;
  evaluationStatus: Qd600RuleEvaluationStatus;
  dataStatus: Qd600RuleDataStatus;
  observedValue: number | null;
  thresholdValue: number | null;
  margin: number | null;
  isNearThreshold: boolean;
  isThresholdBreached: boolean;
  capabilityStatus: AcademicWarningCapabilityStatus | null;
  reasonCode: string | null;
  explanation: string;
  regulatorySource: string | null;
  articleRef: string | null;
  riskLevel?: "GREEN" | "YELLOW" | "RED";
  expectedCredits?: number | null;
  earnedCredits?: number | null;
  latestCompletedSemester?: number;
  progressStatus?: "ON_TRACK" | "BEHIND" | "UNKNOWN";
  missingRequiredCredits?: number;
  missingRequiredCourses?: Array<{ courseCode: string; courseName: string; credits: number; semesterNo: number }>;
};

export type Qd600NormalizedCapabilityData = {
  firstTermClassification: {
    isFirstMainSemester: boolean | null;
    dataStatus: "COMPLETE" | "INSUFFICIENT";
    reasonCode: string | null;
  };
  yearLevelClassification: Qd600YearLevelClassification;
  failedCreditCalculation: FailedCreditCalculation;
  accumulatedDebtCreditCalculation: {
    accumulatedDebtCredits: number | null;
    dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "UNVERIFIED";
    reasonCode: string | null;
  };
};

export type Qd600EvaluationInput = {
  policyDefinition: Qd600PolicyDefinition;
  capabilities: AcademicWarningCapabilitySnapshot;
  capabilityData: Qd600NormalizedCapabilityData;
  termGpa4: number | null;
  cumulativeGpa4: number | null;
  termKind: "MAIN" | "SUMMER";
  trainingProgress?: {
    creditDeficit: number | null;
    dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
    reasonCode: string | null;
    runId: string;
    expectedCreditsToDate?: number | null;
    earnedCreditsToDate?: number | null;
    latestCompletedSemester?: number;
    progressStatus?: "ON_TRACK" | "BEHIND" | "UNKNOWN";
    missingRequiredCredits?: number;
    missingRequiredCourses?: Array<{ courseCode: string; courseName: string; credits: number; semesterNo: number }>;
  } | null;
  legacySignalCodes?: LegacySignalCode[];
};

export type Qd600EvaluationResult = {
  engineVersion: typeof QD600_RULE_ENGINE_VERSION;
  executionProfile: typeof QD600_EXECUTION_PROFILE;
  evaluationProfile: "QD600_ARTICLE_18";
  businessStatus: Qd600BusinessStatus;
  regulatoryCoverage: {
    status: Qd600CoverageStatus;
    evaluatedRules: number;
    totalRules: number;
    notEvaluatedRuleCodes: Qd600RuleCode[];
  };
  rules: Qd600RuleEvaluation[];
  legacySignalContext: Array<{
    reasonCode: LegacySignalCode;
    sourceType: LegacySignalSourceType;
  }>;
};

export type Qd600PolicyApplicability = {
  status: "APPLICABLE" | "NOT_APPLICABLE" | "UNRESOLVED";
  reasonCode: null | "REGULATORY_POLICY_NOT_APPLICABLE" | "REGULATORY_POLICY_COHORT_UNRESOLVED";
};

export function resolveQd600PolicyApplicability(
  policyDefinition: Qd600PolicyDefinition,
  cohortId: string | null,
): Qd600PolicyApplicability {
  if (!cohortId) {
    return { status: "UNRESOLVED", reasonCode: "REGULATORY_POLICY_COHORT_UNRESOLVED" };
  }
  if (!policyDefinition.regulatory.applicableCohortIds.includes(cohortId)) {
    return { status: "NOT_APPLICABLE", reasonCode: "REGULATORY_POLICY_NOT_APPLICABLE" };
  }
  return { status: "APPLICABLE", reasonCode: null };
}

function policyProvenance(policy: Qd600PolicyDefinition) {
  return {
    regulatorySource: policy.regulatory.sourceCode,
    articleRef: policy.regulatory.articleRefs.find((article) => article === "Điều 18") || "Điều 18",
  };
}

function unavailableRule(input: {
  ruleCode: Qd600RuleCode;
  sourceType?: Qd600RuleSourceType;
  dataStatus: Qd600RuleDataStatus;
  capabilityStatus?: AcademicWarningCapabilityStatus | null;
  reasonCode: string;
  explanation: string;
  thresholdValue?: number | null;
  margin?: number | null;
  policy: Qd600PolicyDefinition;
}): Qd600RuleEvaluation {
  return {
    ruleCode: input.ruleCode,
    sourceType: input.sourceType || "REGULATORY",
    evaluationStatus: "NOT_EVALUATED",
    dataStatus: input.dataStatus,
    observedValue: null,
    thresholdValue: input.thresholdValue ?? null,
    margin: input.margin ?? null,
    isNearThreshold: false,
    isThresholdBreached: false,
    capabilityStatus: input.capabilityStatus ?? null,
    reasonCode: input.reasonCode,
    explanation: input.explanation,
    ...(input.sourceType === "REGULATORY"
      ? policyProvenance(input.policy)
      : { regulatorySource: null, articleRef: null }),
  };
}

function summerGate(
  ruleCode: Qd600RuleCode,
  sourceType: Qd600RuleSourceType,
  input: Qd600EvaluationInput,
  thresholdValue: number | null = null,
  margin: number | null = null,
) {
  if (input.termKind !== "SUMMER") return null;
  const capability = input.capabilities.SUMMER_MAIN_TERM_MERGE_VERIFIED;
  if (capability.status !== "AVAILABLE") {
    return unavailableRule({
      ruleCode,
      sourceType,
      dataStatus: "UNVERIFIED",
      capabilityStatus: capability.status,
      reasonCode: "SUMMER_MAIN_TERM_MERGE_UNVERIFIED",
      explanation: "Kỳ hè không được hợp nhất hoặc coi là kỳ chính khi semantics nguồn chưa được xác minh.",
      thresholdValue,
      margin,
      policy: input.policyDefinition,
    });
  }
  return {
    ruleCode,
    sourceType,
    evaluationStatus: "NOT_APPLICABLE",
    dataStatus: "COMPLETE",
    observedValue: null,
    thresholdValue,
    margin,
    isNearThreshold: false,
    isThresholdBreached: false,
    capabilityStatus: capability.status,
    reasonCode: "SUMMER_TERM_IS_NOT_MAIN_TERM",
    explanation: "Rule Điều 18 này áp dụng cho kỳ chính; kỳ hè không được tạo thành một kỳ chính mới.",
    ...(sourceType === "REGULATORY"
      ? policyProvenance(input.policyDefinition)
      : { regulatorySource: null, articleRef: null }),
  } satisfies Qd600RuleEvaluation;
}

export function evaluateTrainingProgressCreditDeficit(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const summerResult = summerGate("TRAINING_PROGRESS_CREDIT_DEFICIT", "OPERATIONAL", input, 4, 12);
  if (summerResult) return summerResult;
  const progress = input.trainingProgress;
  if (!progress) {
    return unavailableRule({
      ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT",
      sourceType: "OPERATIONAL",
      dataStatus: "INSUFFICIENT",
      reasonCode: "TRAINING_PROGRESS_SNAPSHOT_MISSING",
      explanation: "Chưa có kết quả Tiến độ đào tạo đã lưu cho đúng khóa, CTĐT và học kỳ đánh giá.",
      thresholdValue: 4,
      margin: 12,
      policy: input.policyDefinition,
    });
  }
  if (progress.dataStatus === "INSUFFICIENT" || progress.creditDeficit == null || !Number.isFinite(progress.creditDeficit)) {
    return unavailableRule({
      ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT",
      sourceType: "OPERATIONAL",
      dataStatus: progress.dataStatus,
      reasonCode: progress.reasonCode || "TRAINING_PROGRESS_DATA_INCOMPLETE",
      explanation: "Không phân loại tiến độ khi kết quả CTĐT còn lỗi hoặc còn học phần chưa có kết quả chính thức.",
      thresholdValue: 4,
      margin: 12,
      policy: input.policyDefinition,
    });
  }

  const gap = Math.max(0, progress.creditDeficit);
  const missingRequiredCredits = progress.missingRequiredCredits ?? 0;
  const missingRequiredCount = progress.missingRequiredCourses?.length ?? 0;
  const riskLevel = Math.max(gap, missingRequiredCredits) >= 12 ? "RED"
    : gap >= 4 || missingRequiredCount > 0 ? "YELLOW" : "GREEN";
  return {
    ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT",
    sourceType: "OPERATIONAL",
    evaluationStatus: "EVALUATED",
    dataStatus: progress.dataStatus,
    observedValue: gap,
    thresholdValue: riskLevel === "RED" ? 12 : 4,
    margin: riskLevel === "RED" ? 12 : 4,
    isNearThreshold: riskLevel === "YELLOW",
    isThresholdBreached: riskLevel === "RED",
    capabilityStatus: null,
    reasonCode: riskLevel === "RED"
      ? "TRAINING_PROGRESS_DEFICIT_RED"
      : riskLevel === "YELLOW"
        ? "TRAINING_PROGRESS_DEFICIT_YELLOW"
        : null,
    explanation: `Thiếu ${gap} tín chỉ so với kế hoạch${progress.latestCompletedSemester != null ? ` đến hết học kỳ ${progress.latestCompletedSemester}` : " đến mốc"}.`
      + (missingRequiredCount > 0 ? ` Còn ${missingRequiredCount} học phần bắt buộc chưa hoàn thành (${missingRequiredCredits} TC); tín chỉ tự chọn dư không thay thế các học phần này.` : "")
      + (progress.dataStatus === "PARTIAL" ? " Số liệu nhóm tự chọn chưa hoàn chỉnh; các tiêu chí chưa đủ dữ liệu được ghi rõ trong chi tiết đánh giá." : ""),
    regulatorySource: null,
    articleRef: null,
    riskLevel,
    expectedCredits: progress.expectedCreditsToDate ?? null,
    earnedCredits: progress.earnedCreditsToDate ?? null,
    latestCompletedSemester: progress.latestCompletedSemester,
    progressStatus: progress.progressStatus,
    missingRequiredCredits,
    missingRequiredCourses: progress.missingRequiredCourses,
  };
}

function evaluateFailedCreditRatio(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const threshold = input.policyDefinition.thresholds.failedCreditRatio.value;
  const summerResult = summerGate("QD600_FAILED_CREDIT_RATIO", "REGULATORY", input, threshold);
  if (summerResult) return summerResult;

  const capability = input.capabilities.FAILED_CREDIT_CALCULATION;
  if (capability.status !== "AVAILABLE") {
    return unavailableRule({
      ruleCode: "QD600_FAILED_CREDIT_RATIO",
      dataStatus: capability.status === "UNVERIFIED" ? "UNVERIFIED" : "INSUFFICIENT",
      capabilityStatus: capability.status,
      reasonCode: capability.reasonCode,
      explanation: capability.description,
      thresholdValue: threshold,
      policy: input.policyDefinition,
    });
  }

  const data = input.capabilityData.failedCreditCalculation;
  if (data.dataStatus !== "COMPLETE" || data.registeredCredits <= 0 || data.failedCreditRatio == null) {
    const reasonCode = data.registeredCredits <= 0
      ? "NO_REGISTERED_CREDITS"
      : data.dataStatus === "PARTIAL"
        ? "FAILED_CREDIT_DATA_PARTIAL"
        : "FAILED_CREDIT_DATA_INSUFFICIENT";
    return unavailableRule({
      ruleCode: "QD600_FAILED_CREDIT_RATIO",
      dataStatus: data.dataStatus,
      capabilityStatus: capability.status,
      reasonCode,
      explanation: "Tỷ lệ tín chỉ không đạt không được đánh giá khi dữ liệu kết quả học phần chưa đầy đủ hoặc mẫu số bằng 0.",
      thresholdValue: threshold,
      policy: input.policyDefinition,
    });
  }

  const breached = data.failedCreditRatio > threshold;
  return {
    ruleCode: "QD600_FAILED_CREDIT_RATIO",
    sourceType: "REGULATORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: data.failedCreditRatio,
    thresholdValue: threshold,
    margin: null,
    isNearThreshold: false,
    isThresholdBreached: breached,
    capabilityStatus: capability.status,
    reasonCode: breached ? "FAILED_CREDIT_RATIO_THRESHOLD_BREACHED" : null,
    explanation: breached
      ? `${Math.round(data.failedCreditRatio * 100)}% số tín chỉ đã đăng ký trong học kỳ chưa đạt. Mức cảnh báo theo quy định là trên 50%.`
      : `Tỷ lệ tín chỉ không đạt trong học kỳ (${Math.round(data.failedCreditRatio * 100)}%) không vượt quá ngưỡng quy định 50%.`,
    ...policyProvenance(input.policyDefinition),
  };
}

function cumulativeRuleContext(input: Qd600EvaluationInput) {
  const summerResult = summerGate("QD600_CUMULATIVE_GPA_BY_YEAR", "REGULATORY", input);
  if (summerResult) return { unavailable: summerResult, threshold: null };

  const capability = input.capabilities.YEAR_LEVEL_CLASSIFICATION;
  const classification = input.capabilityData.yearLevelClassification;
  if (capability.status !== "AVAILABLE") {
    return {
      unavailable: unavailableRule({
        ruleCode: "QD600_CUMULATIVE_GPA_BY_YEAR",
        dataStatus: capability.status === "UNVERIFIED" ? "UNVERIFIED" : "INSUFFICIENT",
        capabilityStatus: capability.status,
        reasonCode: capability.reasonCode,
        explanation: capability.description,
        policy: input.policyDefinition,
      }),
      threshold: null,
    };
  }
  if (classification.dataStatus !== "COMPLETE" || classification.yearLevel == null) {
    return {
      unavailable: unavailableRule({
        ruleCode: "QD600_CUMULATIVE_GPA_BY_YEAR",
        dataStatus: "INSUFFICIENT",
        capabilityStatus: capability.status,
        reasonCode: classification.reasonCode || "YEAR_LEVEL_DATA_INSUFFICIENT",
        explanation: "Không đủ tín chỉ tích lũy hợp lệ để xác định trình độ năm học theo QĐ600.",
        policy: input.policyDefinition,
      }),
      threshold: null,
    };
  }
  const threshold = input.policyDefinition.thresholds.cumulativeGpaByYear
    .find((item) => item.yearLevel === classification.yearLevel)?.gpa4Below ?? null;
  if (threshold == null) {
    return {
      unavailable: unavailableRule({
        ruleCode: "QD600_CUMULATIVE_GPA_BY_YEAR",
        dataStatus: "INSUFFICIENT",
        capabilityStatus: capability.status,
        reasonCode: "CUMULATIVE_GPA_YEAR_THRESHOLD_MISSING",
        explanation: `Policy không có ngưỡng GPA tích lũy cho năm ${classification.yearLevel}.`,
        policy: input.policyDefinition,
      }),
      threshold: null,
    };
  }
  if (input.cumulativeGpa4 == null || !Number.isFinite(input.cumulativeGpa4)) {
    return {
      unavailable: unavailableRule({
        ruleCode: "QD600_CUMULATIVE_GPA_BY_YEAR",
        dataStatus: "INSUFFICIENT",
        capabilityStatus: capability.status,
        reasonCode: "CUMULATIVE_GPA_MISSING",
        explanation: "Không có GPA tích lũy hệ 4 hợp lệ để đánh giá ngưỡng theo năm học.",
        thresholdValue: threshold,
        policy: input.policyDefinition,
      }),
      threshold,
    };
  }
  return { unavailable: null, threshold };
}

function evaluateCumulativeGpa(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const context = cumulativeRuleContext(input);
  if (context.unavailable) return context.unavailable;
  const threshold = context.threshold!;
  const observed = input.cumulativeGpa4!;
  const breached = observed < threshold;
  return {
    ruleCode: "QD600_CUMULATIVE_GPA_BY_YEAR",
    sourceType: "REGULATORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: observed,
    thresholdValue: threshold,
    margin: null,
    isNearThreshold: false,
    isThresholdBreached: breached,
    capabilityStatus: input.capabilities.YEAR_LEVEL_CLASSIFICATION.status,
    reasonCode: breached ? "CUMULATIVE_GPA_THRESHOLD_BREACHED" : null,
    explanation: breached
      ? `GPA tích lũy ${observed} thấp hơn ngưỡng ${threshold} của năm học đã phân loại.`
      : `GPA tích lũy ${observed} không thấp hơn ngưỡng ${threshold} của năm học đã phân loại.`,
    ...policyProvenance(input.policyDefinition),
  };
}

function evaluateCumulativeGpaAdvisory(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const margin = input.policyDefinition.advisory.earlyWarningMarginGpa4;
  const summerResult = summerGate("QD600_CUMULATIVE_GPA_NEAR_THRESHOLD", "ADVISORY", input, null, margin);
  if (summerResult) return summerResult;

  const regulatory = evaluateCumulativeGpa(input);
  if (regulatory.evaluationStatus !== "EVALUATED") {
    return unavailableRule({
      ruleCode: "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD",
      sourceType: "ADVISORY",
      dataStatus: regulatory.dataStatus,
      capabilityStatus: regulatory.capabilityStatus,
      reasonCode: regulatory.reasonCode || "CUMULATIVE_GPA_RULE_NOT_EVALUATED",
      explanation: "Advisory near-threshold không thể đánh giá khi rule GPA tích lũy nền chưa được đánh giá.",
      thresholdValue: regulatory.thresholdValue,
      margin,
      policy: input.policyDefinition,
    });
  }

  if (regulatory.isThresholdBreached) {
    return {
      ruleCode: "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD",
      sourceType: "ADVISORY",
      evaluationStatus: "NOT_APPLICABLE",
      dataStatus: "COMPLETE",
      observedValue: regulatory.observedValue,
      thresholdValue: regulatory.thresholdValue,
      margin,
      isNearThreshold: false,
      isThresholdBreached: false,
      capabilityStatus: regulatory.capabilityStatus,
      reasonCode: "REGULATORY_THRESHOLD_ALREADY_BREACHED",
      explanation: "Khoảng cảnh báo sớm không áp dụng vì GPA đã thấp hơn ngưỡng quy chế.",
      regulatorySource: null,
      articleRef: null,
    };
  }

  const observed = regulatory.observedValue!;
  const threshold = regulatory.thresholdValue!;
  const isNearThreshold = observed >= threshold && observed < threshold + margin;
  return {
    ruleCode: "QD600_CUMULATIVE_GPA_NEAR_THRESHOLD",
    sourceType: "ADVISORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: observed,
    thresholdValue: threshold,
    margin,
    isNearThreshold,
    isThresholdBreached: false,
    capabilityStatus: regulatory.capabilityStatus,
    reasonCode: isNearThreshold ? "CUMULATIVE_GPA_NEAR_THRESHOLD" : null,
    explanation: isNearThreshold
      ? `GPA tích lũy nằm trong khoảng cảnh báo sớm [${threshold}, ${threshold + margin}); đây là advisory, không phải ngưỡng QĐ600.`
      : "GPA tích lũy nằm ngoài khoảng cảnh báo sớm advisory.",
    regulatorySource: null,
    articleRef: null,
  };
}

function evaluateTermGpa(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const summerResult = summerGate("QD600_TERM_GPA", "REGULATORY", input);
  if (summerResult) return summerResult;
  const capability = input.capabilities.FIRST_TERM_DETECTION;
  const classification = input.capabilityData.firstTermClassification;
  if (capability.status !== "AVAILABLE" || classification.dataStatus !== "COMPLETE" || classification.isFirstMainSemester == null) {
    return unavailableRule({
      ruleCode: "QD600_TERM_GPA",
      dataStatus: capability.status === "UNVERIFIED" ? "UNVERIFIED" : "INSUFFICIENT",
      capabilityStatus: capability.status,
      reasonCode: classification.reasonCode || capability.reasonCode || "FIRST_TERM_CLASSIFICATION_MISSING",
      explanation: "Không thể chọn ngưỡng học kỳ đầu hay học kỳ tiếp theo nếu chưa xác định được học kỳ chính đầu tiên có dữ liệu điểm.",
      policy: input.policyDefinition,
    });
  }
  const threshold = classification.isFirstMainSemester
    ? input.policyDefinition.thresholds.termGpa.firstSemesterBelow
    : input.policyDefinition.thresholds.termGpa.subsequentSemesterBelow;
  if (input.termGpa4 == null || !Number.isFinite(input.termGpa4)) {
    return unavailableRule({
      ruleCode: "QD600_TERM_GPA",
      dataStatus: "INSUFFICIENT",
      capabilityStatus: capability.status,
      reasonCode: "TERM_GPA_MISSING",
      explanation: "Chưa có điểm GPA học kỳ chính thức từ bảng điểm (toàn bộ học phần đăng ký ghi nhận vắng thi hoặc chưa có điểm số quy đổi hệ 4).",
      thresholdValue: threshold,
      policy: input.policyDefinition,
    });
  }
  const breached = input.termGpa4 < threshold;
  return {
    ruleCode: "QD600_TERM_GPA",
    sourceType: "REGULATORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: input.termGpa4,
    thresholdValue: threshold,
    margin: null,
    isNearThreshold: false,
    isThresholdBreached: breached,
    capabilityStatus: capability.status,
    reasonCode: breached ? "TERM_GPA_THRESHOLD_BREACHED" : null,
    explanation: breached
      ? `GPA học kỳ ${input.termGpa4} thấp hơn ngưỡng ${threshold}.`
      : `GPA học kỳ ${input.termGpa4} không thấp hơn ngưỡng ${threshold}.`,
    ...policyProvenance(input.policyDefinition),
  };
}

function evaluateAccumulatedDebt(input: Qd600EvaluationInput): Qd600RuleEvaluation {
  const capability = input.capabilities.ACCUMULATED_DEBT_CREDIT_CALCULATION;
  const data = input.capabilityData.accumulatedDebtCreditCalculation;
  if (capability.status !== "AVAILABLE" || data.dataStatus !== "COMPLETE" || data.accumulatedDebtCredits == null) {
    return unavailableRule({
      ruleCode: "QD600_ACCUMULATED_DEBT_CREDITS",
      dataStatus: capability.status === "UNVERIFIED" || data.dataStatus === "UNVERIFIED"
        ? "UNVERIFIED"
        : data.dataStatus,
      capabilityStatus: capability.status,
      reasonCode: data.dataStatus === "UNVERIFIED" ? "ACCUMULATED_DEBT_SEMANTICS_UNVERIFIED" : data.reasonCode ?? "ACCUMULATED_DEBT_SEMANTICS_UNVERIFIED",
      explanation: "Cần đối chiếu lịch sử học lại môn rớt và môn tự chọn thay thế để xác định chính xác số tín chỉ F còn nợ đọng theo Điều 18.",
      thresholdValue: input.policyDefinition.thresholds.accumulatedDebtCredits.value,
      policy: input.policyDefinition,
    });
  }

  const threshold = input.policyDefinition.thresholds.accumulatedDebtCredits.value;
  const breached = data.accumulatedDebtCredits > threshold;
  return {
    ruleCode: "QD600_ACCUMULATED_DEBT_CREDITS",
    sourceType: "REGULATORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: data.accumulatedDebtCredits,
    thresholdValue: threshold,
    margin: null,
    isNearThreshold: false,
    isThresholdBreached: breached,
    capabilityStatus: capability.status,
    reasonCode: breached ? "ACCUMULATED_DEBT_THRESHOLD_BREACHED" : null,
    explanation: breached
      ? `Tín chỉ nợ đọng ${data.accumulatedDebtCredits} lớn hơn ngưỡng ${threshold}.`
      : `Tín chỉ nợ đọng ${data.accumulatedDebtCredits} không lớn hơn ngưỡng ${threshold}.`,
    ...policyProvenance(input.policyDefinition),
  };
}

function regulatoryCoverage(rules: Qd600RuleEvaluation[]) {
  const regulatoryRules = rules.filter((rule) => rule.sourceType === "REGULATORY");
  const evaluatedRules = regulatoryRules.filter((rule) => rule.evaluationStatus !== "NOT_EVALUATED").length;
  const notEvaluatedRuleCodes = regulatoryRules
    .filter((rule) => rule.evaluationStatus === "NOT_EVALUATED")
    .map((rule) => rule.ruleCode);
  const status: Qd600CoverageStatus = notEvaluatedRuleCodes.length === 0
    ? "FULL"
    : evaluatedRules === 0
      ? "INSUFFICIENT"
      : "PARTIAL";
  return { status, evaluatedRules, totalRules: regulatoryRules.length, notEvaluatedRuleCodes };
}

/** Internal monitoring thresholds; QĐ600's >24-credit rule stays separate. */
function evaluateAccumulatedDebtRisk(debt: Qd600RuleEvaluation): Qd600RuleEvaluation {
  const credits = debt.observedValue!;
  const riskLevel = credits >= 19 ? "RED" : credits >= 13 ? "YELLOW" : "GREEN";
  return {
    ruleCode: "ACCUMULATED_DEBT_CREDIT_RISK",
    sourceType: "ADVISORY",
    evaluationStatus: "EVALUATED",
    dataStatus: "COMPLETE",
    observedValue: credits,
    thresholdValue: riskLevel === "RED" ? 19 : 13,
    margin: null,
    isNearThreshold: riskLevel === "YELLOW",
    isThresholdBreached: riskLevel === "RED",
    capabilityStatus: debt.capabilityStatus,
    reasonCode: riskLevel === "RED" ? "ACCUMULATED_DEBT_RISK_RED"
      : riskLevel === "YELLOW" ? "ACCUMULATED_DEBT_RISK_YELLOW" : null,
    explanation: `Nợ tích lũy còn ${credits} tín chỉ sau đối chiếu nhóm lựa chọn của từng học kỳ, học lại và bù bằng môn tự chọn cùng khối CTĐT có tín chỉ đạt dư so với kế hoạch học kỳ. `
      + (riskLevel === "RED" ? "Nguy cơ cao từ 19 tín chỉ."
        : riskLevel === "YELLOW" ? "Cần chú ý từ 13 đến 18 tín chỉ."
          : "Chưa chạm mức theo dõi 13 tín chỉ.")
      + " Đây là ngưỡng theo dõi của hệ thống; cảnh báo theo QĐ600 áp dụng khi nợ trên 24 tín chỉ.",
    regulatorySource: null,
    articleRef: null,
    riskLevel,
  };
}

export function evaluateQd600Article18(input: Qd600EvaluationInput): Qd600EvaluationResult {
  const debt = evaluateAccumulatedDebt(input);
  const rules = [
    evaluateFailedCreditRatio(input),
    evaluateCumulativeGpa(input),
    evaluateCumulativeGpaAdvisory(input),
    evaluateTermGpa(input),
    debt,
    evaluateTrainingProgressCreditDeficit(input),
  ];
  // Do not classify advisory debt from an incomplete historical calculation.
  // The regulatory debt rule already explains why evaluation is unavailable.
  if (debt.evaluationStatus === "EVALUATED") rules.push(evaluateAccumulatedDebtRisk(debt));
  const coverage = regulatoryCoverage(rules);
  const legacySignalContext = [...new Set(input.legacySignalCodes || [])].map((reasonCode) => ({
    reasonCode,
    sourceType: LEGACY_SIGNAL_SOURCE_TYPES[reasonCode],
  }));

  const hasRegulatoryBreach = rules.some((rule) => rule.sourceType === "REGULATORY" && rule.isThresholdBreached);
  const hasRedProgressRisk = rules.some((rule) => rule.ruleCode === "TRAINING_PROGRESS_CREDIT_DEFICIT" && rule.riskLevel === "RED");
  const hasYellowProgressRisk = rules.some((rule) => rule.ruleCode === "TRAINING_PROGRESS_CREDIT_DEFICIT" && rule.riskLevel === "YELLOW");
  const hasNearThreshold = rules.some((rule) => rule.sourceType === "ADVISORY" && rule.isNearThreshold);
  const hasRedDebtRisk = rules.some((rule) => rule.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK" && rule.riskLevel === "RED");
  const businessStatus: Qd600BusinessStatus = hasRegulatoryBreach || hasRedProgressRisk || hasRedDebtRisk
    ? "HIGH_RISK"
    : hasNearThreshold || hasYellowProgressRisk
      ? "MONITORING"
        : coverage.status === "INSUFFICIENT"
          ? "INSUFFICIENT_DATA"
          : "NORMAL";

  return {
    engineVersion: QD600_RULE_ENGINE_VERSION,
    executionProfile: QD600_EXECUTION_PROFILE,
    evaluationProfile: "QD600_ARTICLE_18",
    businessStatus,
    regulatoryCoverage: coverage,
    rules,
    legacySignalContext,
  };
}

export function evaluateQd600ForCohort(input: Qd600EvaluationInput & { cohortId: string | null }) {
  const applicability = resolveQd600PolicyApplicability(input.policyDefinition, input.cohortId);
  return {
    applicability,
    result: applicability.status === "APPLICABLE" ? evaluateQd600Article18(input) : null,
  };
}

export function createQd600EvaluationSnapshot(input: {
  policyId: string;
  policyName: string;
  policyVersion: number;
  policyDefinition: Qd600PolicyDefinition;
  capabilities: AcademicWarningCapabilitySnapshot;
  result: Qd600EvaluationResult;
}) {
  return {
    schemaVersion: 1,
    engineVersion: QD600_RULE_ENGINE_VERSION,
    executionProfile: QD600_EXECUTION_PROFILE,
    globalActivation: false,
    policy: createAcademicWarningPolicySnapshot({
      id: input.policyId,
      name: input.policyName,
      policyVersion: input.policyVersion,
      definition: input.policyDefinition,
    }),
    capabilities: JSON.parse(JSON.stringify(input.capabilities)) as AcademicWarningCapabilitySnapshot,
    regulatoryCoverage: input.result.regulatoryCoverage,
    result: JSON.parse(JSON.stringify(input.result)) as Qd600EvaluationResult,
  };
}
