import { warningRuleResults } from "./student-warning-view";

export type WarningAssessmentGap = {
  key: string;
  rules: Array<Record<string, unknown>>;
};

function needsResultVerification(rule: Record<string, unknown>) {
  if (rule.reasonCode === "EXAM_ABSENCE_REQUIRES_VERIFICATION"
    || rule.reasonCode === "CURRICULUM_SCOPE_REQUIRES_VERIFICATION") return true;
  // Older saved ratios use a general PARTIAL reason, but their explanation
  // explicitly records VT. Keep that evidence and the unevaluated status;
  // do not infer VT from a null ratio or from a different semester's absence.
  return rule.ruleCode === "QD600_FAILED_CREDIT_RATIO"
    && rule.reasonCode === "FAILED_CREDIT_DATA_PARTIAL"
    && /học phần VT/.test(String(rule.explanation || ""));
}

/** Keep the stored evaluation intact. A recorded VT needs verification; it is
 * not a missing source record and must not be silently reclassified as F. */
export function warningAssessmentGaps(value: unknown) {
  const rules = warningRuleResults(value).filter(rule => rule.evaluationStatus === "NOT_EVALUATED");
  const missingData = new Map<string, WarningAssessmentGap>();
  const verification = new Map<string, WarningAssessmentGap>();
  const pairedCodes: Record<string, string> = {
    EARLY_LOW_TERM_GPA: "QD600_TERM_GPA",
    EARLY_FAILED_CREDIT_RATIO: "QD600_FAILED_CREDIT_RATIO",
  };
  for (const rule of rules) {
    const code = String(rule.ruleCode || "UNKNOWN");
    const paired = rules.find(item => item.ruleCode === pairedCodes[code]);
    // Semester identity can be unknown even when GPA exists. Do not merge
    // that separate problem with the missing numeric GPA of an early signal.
    const canPair = paired && (code !== "EARLY_LOW_TERM_GPA" || paired.reasonCode === "TERM_GPA_MISSING");
    const key = canPair ? String(paired.ruleCode) : code;
    const needsVerification = needsResultVerification(rule)
      || Boolean(canPair && needsResultVerification(paired));
    const groups = needsVerification ? verification : missingData;
    const group = groups.get(key) || { key, rules: [] };
    group.rules.push(rule);
    groups.set(key, group);
  }
  // Prefer the regulatory explanation: the early signal often only says
  // that data is unavailable, while its paired rule describes the cause.
  for (const group of [...missingData.values(), ...verification.values()]) {
    group.rules.sort((left, right) => Number(right.sourceType === "REGULATORY") - Number(left.sourceType === "REGULATORY"));
  }
  return { missingData: [...missingData.values()], verification: [...verification.values()] };
}
