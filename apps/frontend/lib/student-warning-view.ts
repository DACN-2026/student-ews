export type ProfileWarningReason = {
  id?: string; reasonCode: string; severity: string; title: string | null;
  sourceType?: string | null; details: Record<string, unknown>;
};
export type ProfileWarningScan = {
  id: string; academicTermId?: string | null; termCode: string | null; academicYear: string | null;
  businessStatus: string; reasonCount: number; termGpa4: number | null; createdAt: string;
  runMode?: string; isSummer?: boolean;
};
export const WARNING_STATE_LABELS: Record<string, string> = {
  HIGH_RISK: "Nguy cơ cao", VERIFY_REQUIRED: "Cần xác minh", MONITORING: "Cần theo dõi",
  INSUFFICIENT_DATA: "Chưa đủ dữ liệu", NORMAL: "Chưa ghi nhận nguy cơ", PARTIAL_NO_RISK: "Chưa ghi nhận nguy cơ",
};
export const studentWarningEndpoint = (studentId: string) => `/api/v1/academic-warnings/students/${encodeURIComponent(studentId)}`;
export function warningRuleResults(value: unknown): Array<Record<string, unknown>> {
  const rules = Array.isArray(value) ? value : value && typeof value === "object" && "rules" in value ? value.rules : [];
  return Array.isArray(rules) ? rules.filter((rule): rule is Record<string, unknown> => Boolean(rule && typeof rule === "object")) : [];
}
export function isMainConductTerm(record: { termCode: string | null; isSummer: boolean }) {
  return !record.isSummer && !/^HK0?3$/i.test(String(record.termCode || "").trim());
}
export function warningRuleCode(reason: ProfileWarningReason) {
  return String(reason.details.ruleCode || reason.reasonCode);
}
export function numericWarningValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function warningReasonSummary(reason: ProfileWarningReason) {
  const details = reason.details;
  const code = warningRuleCode(reason);
  const observed = numericWarningValue(details.observedValue);
  const missing = Array.isArray(details.missingRequiredCourses) ? details.missingRequiredCourses.length : 0;
  if (code.includes("PROGRESS") && observed === 0 && missing > 0) {
    return `Đã đủ tổng tín chỉ theo lộ trình, nhưng còn ${missing} học phần bắt buộc đến hạn chưa hoàn thành (${numericWarningValue(details.missingRequiredCredits) ?? "—"} TC).`;
  }
  return typeof details.explanation === "string" ? details.explanation : "Xem số liệu và bằng chứng của tiêu chí này để xác nhận nguyên nhân.";
}
export function warningThresholdLabel(reason: ProfileWarningReason) {
  const value = numericWarningValue(reason.details.thresholdValue);
  if (value == null) return "Chưa có ngưỡng";
  const code = warningRuleCode(reason);
  if (code.includes("CREDIT_RATIO")) return `> ${Math.round(value * 100)}%`;
  if (code.includes("GPA")) return `< ${value.toFixed(2)}`;
  if (code.includes("PROGRESS") || code === "ACCUMULATED_DEBT_CREDIT_RISK") return `từ ${value} tín chỉ`;
  return `> ${value} tín chỉ`;
}
// A rerun is not an additional semester of warning. Show one official result per term in academic order.
export function warningSemesterHistory(scans: ProfileWarningScan[]) {
  const byTerm = new Map<string, ProfileWarningScan>();
  for (const scan of scans) {
    if (scan.isSummer || scan.runMode && scan.runMode !== "OFFICIAL") continue;
    const key = scan.academicTermId || `${scan.academicYear}:${scan.termCode}`;
    const existing = byTerm.get(key);
    if (!existing || Date.parse(scan.createdAt) > Date.parse(existing.createdAt)) byTerm.set(key, scan);
  }
  return [...byTerm.values()].sort((a, b) => String(b.academicYear).localeCompare(String(a.academicYear))
    || Number(String(b.termCode).replace(/\D/g, "")) - Number(String(a.termCode).replace(/\D/g, "")));
}
