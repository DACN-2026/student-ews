import type { EarlyWarningSettings } from "./early-warning-settings";
import type { Qd600RuleEvaluation } from "./academic-warning-qd600-rules";

export type EarlyWarningSources = {
  examAbsences?: Array<{ offeringId: string; courseCode: string; courseName: string; credits: number; conditional: boolean; isPass?: boolean | null }>;
  previousTermId: string | null;
  previousTermGpa4: number | null;
  previousCumulativeGpa4: number | null;
  conduct: { id: string; score: number | null; statusId: string | null } | null;
  previousConduct: { id: string; score: number | null; statusId: string | null } | null;
  repeatedFailedCourses: Array<{ courseCode: string; courseName: string; failedAttempts: number }> | null;
};

export const EMPTY_EARLY_WARNING_SOURCES: EarlyWarningSources = {
  previousTermId: null, previousTermGpa4: null, previousCumulativeGpa4: null,
  conduct: null, previousConduct: null, repeatedFailedCourses: null,
};

export function evaluateEarlyWarningSignals(input: {
  settings: EarlyWarningSettings;
  sources?: EarlyWarningSources;
  termGpa4: number | null;
  cumulativeGpa4: number | null;
  failedCreditRatio: number | null;
  provisional?: boolean;
}): Qd600RuleEvaluation[] {
  const source = input.sources || EMPTY_EARLY_WARNING_SOURCES;
  const settings = input.settings;
  const result: Qd600RuleEvaluation[] = [];
  const absences = source.examAbsences || [];
  if (absences.length) result.push({
    ruleCode: "EARLY_EXAM_ABSENCE", sourceType: "ADVISORY", evaluationStatus: "EVALUATED", dataStatus: "COMPLETE",
    observedValue: absences.length, thresholdValue: 1, margin: null,
    isNearThreshold: true, isThresholdBreached: false, capabilityStatus: null, reasonCode: "EXAM_ABSENCE_RECORDED",
    explanation: `Kỳ xét ghi nhận ${absences.length} lượt vắng thi VT (${absences.reduce((sum, course) => sum + course.credits, 0)} tín chỉ). Kết quả đạt/không đạt dùng isPass của API Trường; VT là thông tin vắng thi, không phải dấu hiệu thiếu dữ liệu. Theo dõi việc thi bổ sung hoặc học lại theo kết quả nguồn; không tự đổi VT thành điểm F/0 hoặc tính lại GPA.`,
    regulatorySource: null, articleRef: null, riskLevel: "YELLOW",
    absenceCourseCount: absences.length, absenceCredits: absences.reduce((sum, course) => sum + course.credits, 0), absenceCourses: absences,
  });
  function signal(code: Qd600RuleEvaluation["ruleCode"], threshold: number | null, observed: number | null,
    comparison: "BELOW" | "FROM", explanation: string, missing: string, extra?: Record<string, unknown>) {
    if (threshold === null) return;
    const available = observed !== null && Number.isFinite(observed);
    const missingExplanation = code === "EARLY_LOW_TERM_GPA" ? "Nguồn chưa cung cấp GPA học kỳ hệ 4 hợp lệ tại kỳ xét; không tự tính GPA bằng 0 từ VT."
      : code === "EARLY_LOW_CUMULATIVE_GPA" ? "Nguồn chưa cung cấp GPA tích lũy hệ 4 hợp lệ tại kỳ xét."
        : code === "EARLY_TERM_GPA_DROP" || code === "EARLY_CUMULATIVE_GPA_DROP"
          ? extra?.currentValue == null && extra?.previousValue == null ? "Thiếu GPA hợp lệ của cả kỳ xét và kỳ chính liền trước để tính mức suy giảm."
            : extra?.currentValue == null ? "Thiếu GPA hợp lệ của kỳ xét để so sánh với kỳ chính liền trước."
              : "Thiếu GPA hợp lệ của kỳ chính liền trước; không thay bằng GPA kỳ hè hoặc kỳ không liền kề."
          : code === "EARLY_FAILED_CREDIT_RATIO" ? "Chưa có tỷ lệ tín chỉ không đạt hợp lệ: kiểm tra đăng ký học thuật và kết quả còn chờ hoặc chưa xác định. VT đã có kết quả đạt/không đạt không chặn phép tính."
            : "Chưa đủ dữ liệu hợp lệ để đánh giá tín hiệu này.";
    const triggered = available && (comparison === "BELOW" ? observed < threshold : observed + 1e-9 >= threshold);
    result.push({
      ruleCode: code, sourceType: "ADVISORY", evaluationStatus: available ? "EVALUATED" : "NOT_EVALUATED",
      dataStatus: available ? input.provisional ? "PARTIAL" : "COMPLETE" : "INSUFFICIENT",
      observedValue: available ? observed : null, thresholdValue: threshold, margin: null,
      isNearThreshold: triggered, isThresholdBreached: false, capabilityStatus: null,
      reasonCode: triggered ? code : available ? null : missing,
      explanation: available ? explanation : missingExplanation,
      regulatorySource: null, articleRef: null, riskLevel: triggered ? "YELLOW" : "GREEN", ...extra,
    });
  }
  signal("EARLY_LOW_TERM_GPA", settings.termGpaBelow, input.termGpa4, "BELOW",
    `GPA học kỳ ${input.termGpa4} được so với ngưỡng theo dõi nội bộ ${settings.termGpaBelow}.`, "TERM_GPA_MISSING");
  signal("EARLY_LOW_CUMULATIVE_GPA", settings.cumulativeGpaBelow, input.cumulativeGpa4, "BELOW",
    `GPA tích lũy ${input.cumulativeGpa4} được so với ngưỡng theo dõi nội bộ ${settings.cumulativeGpaBelow}.`, "CUMULATIVE_GPA_MISSING");
  const drop = (current: number | null, previous: number | null) => current === null || previous === null ? null : Math.round((previous - current) * 10000) / 10000;
  signal("EARLY_TERM_GPA_DROP", settings.termGpaDrop, drop(input.termGpa4, source.previousTermGpa4), "FROM",
    `GPA học kỳ giảm từ ${source.previousTermGpa4} xuống ${input.termGpa4} so với kỳ chính liền trước.`, "PREVIOUS_MAIN_TERM_GPA_MISSING",
    { previousValue: source.previousTermGpa4, previousTermId: source.previousTermId, currentValue: input.termGpa4 });
  signal("EARLY_CUMULATIVE_GPA_DROP", settings.cumulativeGpaDrop, drop(input.cumulativeGpa4, source.previousCumulativeGpa4), "FROM",
    `GPA tích lũy giảm từ ${source.previousCumulativeGpa4} xuống ${input.cumulativeGpa4} so với kỳ chính liền trước.`, "PREVIOUS_CUMULATIVE_GPA_MISSING",
    { previousValue: source.previousCumulativeGpa4, previousTermId: source.previousTermId, currentValue: input.cumulativeGpa4 });
  signal("EARLY_FAILED_CREDIT_RATIO", settings.failedCreditRatioFrom, input.failedCreditRatio, "FROM",
    `Tỷ lệ tín chỉ không đạt ${input.failedCreditRatio === null ? "—" : Math.round(input.failedCreditRatio * 100) + "%"}; ngưỡng theo dõi sớm là ${Math.round((settings.failedCreditRatioFrom || 0) * 100)}%, trước mốc QĐ600 trên 50%.`, "FAILED_CREDIT_RATIO_INCOMPLETE");
  const repeated = (source.repeatedFailedCourses || []).filter(course => course.failedAttempts >= (settings.repeatedFailuresFrom || Infinity));
  signal("EARLY_REPEATED_COURSE_FAILURE", settings.repeatedFailuresFrom,
    source.repeatedFailedCourses ? Math.max(0, ...source.repeatedFailedCourses.map(course => course.failedAttempts)) : null, "FROM",
    repeated.length ? `${repeated.length} học phần còn nợ đã không đạt nhiều lần: ${repeated.map(course => `${course.courseCode} (${course.failedAttempts} lần)`).join(", ")}. Cần lập kế hoạch học lại.` : "Chưa ghi nhận học phần còn nợ không đạt nhiều lần đến ngưỡng theo dõi.",
    "COURSE_HISTORY_MISSING", { affectedCourses: repeated });
  const recognized = (conduct: EarlyWarningSources["conduct"]) => conduct?.statusId && settings.recognizedConductStatusIds.includes(conduct.statusId)
    && conduct.score !== null && Number.isFinite(conduct.score) && conduct.score >= 0 && conduct.score <= 100 ? conduct.score : null;
  const currentConduct = recognized(source.conduct);
  const previousConduct = recognized(source.previousConduct);
  signal("EARLY_LOW_CONDUCT_SCORE", settings.conductScoreBelow, currentConduct, "BELOW",
    `Điểm rèn luyện đã công nhận ${currentConduct} được so với ngưỡng theo dõi ${settings.conductScoreBelow}. Đây là tín hiệu hỗ trợ, không phải điều kiện học vụ QĐ600.`, "RECOGNIZED_CONDUCT_SCORE_MISSING",
    { sourceId: source.conduct?.id, approvalStatus: "recognized" });
  signal("EARLY_CONDUCT_SCORE_DROP", settings.conductScoreDrop, drop(currentConduct, previousConduct), "FROM",
    `Điểm rèn luyện đã công nhận giảm từ ${previousConduct} xuống ${currentConduct} so với kỳ chính liền trước.`, "RECOGNIZED_CONDUCT_HISTORY_MISSING",
    { sourceId: source.conduct?.id, previousValue: previousConduct, currentValue: currentConduct, previousTermId: source.previousTermId });
  return result;
}
