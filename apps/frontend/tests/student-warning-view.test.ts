import assert from "node:assert/strict";
import { test } from "node:test";
import { warningRegulatoryAssessment, warningSupportSuggestions } from "../lib/student-warning-view";
import { isMainConductTerm, numericWarningValue, warningReasonSummary, warningRuleResults, warningSemesterHistory, warningThresholdLabel, type ProfileWarningReason, type ProfileWarningScan } from "../lib/student-warning-view";
import { getHumanUnEvaluatedExplanation, getLegalInfo } from "../lib/warning-rule-details";
import { warningPendingDebtCourses, warningCurriculumReviewCourses } from "../lib/student-warning-view";
test("known base-catalog courses have a distinct curriculum review with validated metadata", () => {
  const course = {courseCode:"20CT3112D",courseName:"Môn nâng cao",credits:3,catalogProgramCode:"CQ22CT",outcome:"pending",academicYear:"2024-2025",termCode:"HK02"};
  const rule={ruleCode:"QD600_ACCUMULATED_DEBT_CREDITS",reasonCode:"CURRICULUM_SCOPE_REQUIRES_VERIFICATION",explanation:"Môn có trong CTĐT chung; chờ xác nhận phạm vi.",curriculumReviewCourses:[course,{...course,credits:null},{...course,outcome:"INVALID"}]};
  assert.deepEqual(warningCurriculumReviewCourses([rule]),[course]);
  assert.deepEqual(warningCurriculumReviewCourses({rules:[rule]}),[course]);
  assert.deepEqual(warningCurriculumReviewCourses([]),[]);
  assert.equal(getHumanUnEvaluatedExplanation(rule),rule.explanation);
});
test("VT guidance and pending debt data distinguish verification from confirmed F debt", () => {
  assert.equal(warningThresholdLabel({ reasonCode: "EARLY_EXAM_ABSENCE", severity: "medium", title: null, details: {thresholdValue:1} }), "Có học phần VT cần xác minh");
  assert.ok(warningSupportSuggestions(["EARLY_EXAM_ABSENCE"]).some(text => text.includes("hoãn thi")));
  assert.equal(getHumanUnEvaluatedExplanation({ruleCode:"QD600_ACCUMULATED_DEBT_CREDITS",reasonCode:"EXAM_ABSENCE_REQUIRES_VERIFICATION",explanation:"VT cần xác minh"}), "VT cần xác minh");
  assert.deepEqual(warningPendingDebtCourses([{ruleCode:"QD600_ACCUMULATED_DEBT_CREDITS",pendingDebtCourses:[
    {courseCode:"A",courseName:"Môn A",credits:3,previousOutcome:"FAILED"}, {courseCode:"B",courseName:"Môn B",credits:null,previousOutcome:"NONE"},
  ]}]), [{courseCode:"A",courseName:"Môn A",credits:3,previousOutcome:"FAILED"}]);
});

test("standing alerts use semester units, verification guidance and scoped legal explanations", () => {
  const reason = (reasonCode: string, thresholdValue: number | null): ProfileWarningReason => ({ reasonCode, severity: "high", title: null, details: { thresholdValue } });
  assert.equal(warningThresholdLabel(reason("EARLY_MISSING_TERM_DATA", null)), "Cần đối chiếu hồ sơ");
  assert.equal(warningThresholdLabel(reason("EARLY_NO_REGISTRATION_CONSECUTIVE", 2)), "từ 2 kỳ liên tiếp");
  assert.equal(warningThresholdLabel(reason("ACADEMIC_WARNING_SEQUENCE_REVIEW", 3)), "từ 3 kỳ liên tiếp");
  assert.match(getLegalInfo(reason("EARLY_NO_REGISTRATION", 1)).summary, /HKII 2024–2025/);
  assert.ok(warningSupportSuggestions(["EARLY_MISSING_TERM_DATA"]).some(text => text.includes("quyết định")));
});

test("conduct history excludes HK3 and summer records while retaining pending main semesters", () => {
  const records = [
    { termCode: "HK01", isSummer: false, approved: true },
    { termCode: "HK02", isSummer: false, approved: false },
    { termCode: "HK03", isSummer: false, approved: false },
    { termCode: "hk3", isSummer: false, approved: false },
    { termCode: "HK02", isSummer: true, approved: true },
  ];
  const displayed = records.filter(isMainConductTerm);
  assert.deepEqual(displayed.map(record => record.termCode), ["HK01", "HK02"]);
  assert.equal(displayed.filter(record => record.approved).length, 1);
  assert.equal(displayed.filter(record => !record.approved).length, 1);
});
test("enough total credits still reports outstanding mandatory courses without inventing a deficit", () => {
  const reason: ProfileWarningReason = {
    reasonCode: "TRAINING_PROGRESS_DEFICIT_YELLOW", severity: "medium", title: "Chưa hoàn thành học phần bắt buộc",
    details: { ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT", observedValue: 0, earnedCredits: 135, expectedCredits: 132,
      thresholdValue: 4, missingRequiredCredits: 10, missingRequiredCourses: [{}, {}, {}] },
  };
  const summary = warningReasonSummary(reason);
  assert.match(summary, /Đã đủ tổng tín chỉ/);
  assert.match(summary, /3 học phần bắt buộc/);
  assert.match(summary, /10 TC/);
  assert.doesNotMatch(summary, /thiếu 4/i);
  assert.equal(warningThresholdLabel(reason), "từ 4 tín chỉ");
});
test("missing measurements remain unknown and ratio/GPA thresholds retain their units", () => {
  for (const value of [null, undefined, "", " ", false, [], "NaN"]) assert.equal(numericWarningValue(value), null);
  assert.equal(numericWarningValue(0), 0);
  const reason = { reasonCode: "QD600_FAILED_CREDIT_RATIO", severity: "high", title: null, details: { thresholdValue: 0.5 } };
  assert.equal(warningThresholdLabel(reason), "> 50%");
  assert.equal(warningThresholdLabel({ ...reason, reasonCode: "QD600_TERM_GPA", details: { thresholdValue: 1 } }), "< 1.00");
});
test("historical reruns do not create extra warning semesters or reorder academic chronology", () => {
  const scan = (id: string, termCode: string, academicYear: string, createdAt: string, overrides = {}): ProfileWarningScan => ({
    id, termCode, academicYear, createdAt, businessStatus: "MONITORING", reasonCount: 1, termGpa4: 2, runMode: "OFFICIAL", ...overrides,
  });
  const history = warningSemesterHistory([
    scan("old-duplicate", "HK02", "2025-2026", "2026-09-29"),
    scan("current", "HK02", "2025-2026", "2026-10-01"),
    scan("old-rerun", "HK01", "2024-2025", "2026-10-09"),
    scan("summer", "HK03", "2025-2026", "2026-10-09", { isSummer: true }),
    scan("preview", "HK02", "2025-2026", "2026-10-09", { runMode: "SUMMER_MONITORING" }),
  ]);
  assert.deepEqual(history.map(item => item.id), ["current", "old-rerun"]);
});
test("missing criteria and their explanations survive both stored rule formats", () => {
  const rules = [{ ruleCode: "QD600_TERM_GPA", evaluationStatus: "NOT_EVALUATED", explanation: "Không có GPA hợp lệ: chỉ có vắng thi" }, null, "bad-data"];
  for (const stored of [rules, { rules }]) {
    const rows = warningRuleResults(stored);
    assert.equal(rows.length, 1);
    assert.match(getHumanUnEvaluatedExplanation(rows[0]), /vắng thi \(VT\)/);
  }
  assert.deepEqual(warningRuleResults(null), []);
});

test("retired maximum-duration criterion is omitted from saved rule formats and support suggestions", () => {
  const retired = { ruleCode: "ACADEMIC_STUDY_DURATION_REVIEW", evaluationStatus: "NOT_EVALUATED" };
  const active = { ruleCode: "QD600_TERM_GPA", evaluationStatus: "EVALUATED" };
  for (const stored of [[retired, active], { rules: [retired, active] }]) {
    assert.deepEqual(warningRuleResults(stored), [active]);
  }
  assert.deepEqual(warningSupportSuggestions([retired.ruleCode]), []);
  assert.doesNotMatch(warningSupportSuggestions(["ACADEMIC_WARNING_SEQUENCE_REVIEW"]).join(" "), /hạn đào tạo/);
});
test("progress basis explains mandatory courses even when total credits satisfy the plan", () => {
  assert.match(getLegalInfo({ details: { ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT" } }).summary, /Đủ tổng tín chỉ nhưng còn học phần bắt buộc/);
  assert.match(getLegalInfo({ details: { ruleCode: "QD600_FAILED_CREDIT_RATIO" } }).title, /Điều 18/);
});

test("an internal debt risk does not imply an official academic threshold breach", () => {
  const rules = ["ratio", "term", "cumulative", "debt"].map(ruleCode => ({ ruleCode, sourceType: "REGULATORY", evaluationStatus: "EVALUATED", isThresholdBreached: false }));
  assert.equal(warningRegulatoryAssessment(rules), "Chưa chạm ngưỡng QĐ600");
  rules[0].evaluationStatus = "NOT_EVALUATED";
  assert.equal(warningRegulatoryAssessment(rules), "Chưa đủ dữ liệu đối chiếu QĐ600");
  rules[3].isThresholdBreached = true;
  assert.equal(warningRegulatoryAssessment(rules), "Chạm ngưỡng QĐ600");
});

test("early signals have internal provenance, correct units and support guidance", () => {
  const reason = { reasonCode: "EARLY_CONDUCT_SCORE_DROP", severity: "medium", title: null, details: { thresholdValue: 10 } };
  assert.equal(warningThresholdLabel(reason), "giảm từ 10 điểm");
  assert.match(getLegalInfo(reason).title, /theo dõi sớm/);
  assert.equal(warningThresholdLabel({ ...reason, reasonCode: "EARLY_REPEATED_COURSE_FAILURE", details: { thresholdValue: 2 } }), "từ 2 lần");
  assert.equal(warningThresholdLabel({ ...reason, reasonCode: "EARLY_FAILED_CREDIT_RATIO", details: { thresholdValue: 0.3 } }), "từ 30%");
  assert.equal(warningSupportSuggestions(["EARLY_TERM_GPA_DROP", "EARLY_CUMULATIVE_GPA_DROP"]).length, 1);
  assert.equal(warningSupportSuggestions(["EARLY_LOW_CONDUCT_SCORE"]).length, 1);
  assert.doesNotMatch(getLegalInfo({ ruleCode: "QD600_TERM_GPA" }).summary, /1[.,]10|hai học kỳ liên tiếp/);
});
