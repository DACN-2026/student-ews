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
  return Array.isArray(rules) ? rules.filter((rule): rule is Record<string, unknown> => Boolean(rule && typeof rule === "object") && rule.ruleCode !== "ACADEMIC_STUDY_DURATION_REVIEW") : [];
}
export function isMainConductTerm(record: { termCode: string | null; isSummer: boolean }) {
  return !record.isSummer && !/^HK0?3$/i.test(String(record.termCode || "").trim());
}
export function warningPendingDebtCourses(value: unknown) {
  const rule = warningRuleResults(value).find(rule => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS");
  if (!Array.isArray(rule?.pendingDebtCourses)) return [];
  return rule.pendingDebtCourses.flatMap(course => {
    if (!course || typeof course !== "object" || typeof course.courseCode !== "string" || typeof course.courseName !== "string"
      || typeof course.credits !== "number" || !Number.isFinite(course.credits) || course.credits < 0
      || !["PASSED", "FAILED", "NONE"].includes(course.previousOutcome)) return [];
    return [{ courseCode: course.courseCode as string, courseName: course.courseName as string, credits: course.credits as number, previousOutcome: course.previousOutcome as "PASSED" | "FAILED" | "NONE" }];
  });
}
export function warningCurriculumReviewCourses(value: unknown) {
  const rule = warningRuleResults(value).find(rule => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS");
  if (!Array.isArray(rule?.curriculumReviewCourses)) return [];
  return rule.curriculumReviewCourses.flatMap(course => {
    if (!course || typeof course !== "object" || typeof course.courseCode !== "string" || typeof course.courseName !== "string"
      || typeof course.catalogProgramCode !== "string" || typeof course.credits !== "number" || !Number.isFinite(course.credits) || course.credits < 0
      || !["passed", "failed", "pending", "unknown", "VT"].includes(course.outcome)) return [];
    return [{ courseCode: course.courseCode as string, courseName: course.courseName as string, credits: course.credits as number,
      catalogProgramCode: course.catalogProgramCode as string, outcome: course.outcome as string,
      academicYear: typeof course.academicYear === "string" ? course.academicYear : "",
      termCode: typeof course.termCode === "string" ? course.termCode : "" }];
  });
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
  const code = warningRuleCode(reason);
  if (code === "EARLY_EXAM_ABSENCE") return "Có học phần VT cần xác minh";
  if (code === "EARLY_MISSING_TERM_DATA" || code === "ACADEMIC_REPRIEVE_FOLLOWUP") return "Cần đối chiếu hồ sơ";
  const value = numericWarningValue(reason.details.thresholdValue);
  if (value == null) return "Chưa có ngưỡng";
  if (code === "EARLY_NO_REGISTRATION") return "Chưa ghi nhận đăng ký";
  if (code.includes("NO_REGISTRATION_CONSECUTIVE") || code === "ACADEMIC_WARNING_SEQUENCE_REVIEW") return `từ ${value} kỳ liên tiếp`;
  if (code.includes("CREDIT_RATIO")) return `${code.startsWith("EARLY_") ? "từ" : ">"} ${Math.round(value * 100)}%`;
  if (code.includes("DROP")) return `giảm từ ${value}${code.includes("CONDUCT") ? " điểm" : " GPA"}`;
  if (code.includes("CONDUCT")) return `< ${value} điểm`;
  if (code.includes("REPEATED")) return `từ ${value} lần`;
  if (code.includes("GPA")) return `< ${value.toFixed(2)}`;
  if (code.includes("PROGRESS") || code === "ACCUMULATED_DEBT_CREDIT_RISK") return `từ ${value} tín chỉ`;
  return `> ${value} tín chỉ`;
}
export function warningRegulatoryAssessment(value: unknown) {
  const rules = warningRuleResults(value).filter(rule => rule.sourceType === "REGULATORY");
  if (rules.some(rule => rule.evaluationStatus === "EVALUATED" && rule.isThresholdBreached === true)) return "Chạm ngưỡng QĐ600";
  return rules.length === 4 && rules.every(rule => rule.evaluationStatus === "EVALUATED") ? "Chưa chạm ngưỡng QĐ600" : "Chưa đủ dữ liệu đối chiếu QĐ600";
}
export function warningSupportSuggestions(codes: string[]) {
  const suggestions = new Set<string>();
  for (const code of codes) {
    if (code === "EARLY_EXAM_ABSENCE") suggestions.add("GVCN/CVHT liên hệ sinh viên để xác minh lý do vắng thi, phê duyệt hoãn thi và kết quả thi bổ sung; không tự kết luận cảnh báo học vụ từ mã VT.");
    if (code.includes("NO_REGISTRATION") || code === "EARLY_MISSING_TERM_DATA") suggestions.add("Liên hệ sinh viên, đối chiếu đăng ký đúng chương trình và dữ liệu nguồn. Nếu cần nghỉ học, phối hợp hoàn tất thủ tục và xác minh quyết định có hiệu lực trong kỳ; không chờ thêm một kỳ mới xử lý.");
    if (code.startsWith("ACADEMIC_") && code !== "ACADEMIC_STUDY_DURATION_REVIEW") suggestions.add("Phối hợp đơn vị phụ trách rà soát quyết định cảnh báo và cứu xét; thống nhất phương án hỗ trợ và lịch theo dõi với sinh viên.");
    if (code.includes("GPA")) suggestions.add("Trao đổi nguyên nhân kết quả học tập thấp hoặc suy giảm; thống nhất kế hoạch học và theo dõi kết quả môn tiếp theo.");
    if (code.includes("CREDIT_RATIO") || code.includes("REPEATED")) suggestions.add("Rà soát các môn không đạt, ưu tiên môn tiên quyết và lập kế hoạch học lại với CVHT.");
    if (code.includes("DEBT") || code.includes("PROGRESS")) suggestions.add("Đối chiếu học phần bắt buộc còn thiếu và khả năng mở lớp; lập lộ trình đăng ký phù hợp để giải quyết nợ, tránh chậm tiến độ thêm.");
    if (code.includes("CONDUCT")) suggestions.add("Trao đổi về khó khăn trong học tập, sinh hoạt và rèn luyện; xác nhận điểm đã công nhận và nhu cầu hỗ trợ của sinh viên.");
  }
  return [...suggestions];
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
