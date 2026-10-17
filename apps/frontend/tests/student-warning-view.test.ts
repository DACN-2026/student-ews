import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWarningReasons, warningRegulatoryAssessment, warningSupportSuggestions } from "../lib/student-warning-view";
import { isMainConductTerm, numericWarningValue, warningReasonSummary, warningRuleResults, warningSemesterHistory, warningThresholdLabel, type ProfileWarningReason, type ProfileWarningScan } from "../lib/student-warning-view";
import { getHumanUnEvaluatedExplanation, getLegalInfo } from "../lib/warning-rule-details";
import { warningPendingDebtCourses, warningCurriculumReviewCourses } from "../lib/student-warning-view";
import { termGpaWarningGroup } from "../lib/student-warning-view";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WarningTermGpaCard from "../components/warnings/WarningTermGpaCard";
import { warningPendingProgressCourses } from "../lib/student-warning-view";
import { academicExplanation } from "../lib/academic-explanation";

test("saved academic explanations use familiar terms while preserving measurements and course names", () => {
  const reason: ProfileWarningReason = { reasonCode: "EXAM_ABSENCE_RECORDED", severity: "medium", title: null, details: { ruleCode: "EARLY_EXAM_ABSENCE", observedValue: 5, absenceCredits: 16, explanation: "Kết quả đạt/không đạt dùng isPass của API Trường; VT không phải F/0." } };
  const before = JSON.stringify(reason);
  const summary = warningReasonSummary(reason);
  assert.match(summary, /5 lượt vắng thi \(VT\), tổng cộng 16 tín chỉ/);
  assert.match(summary, /thi bổ sung hoặc học lại theo quy định/);
  assert.doesNotMatch(summary, /API|isPass|F\/0/);
  assert.equal(JSON.stringify(reason), before);
  const saved = "Đang chờ kết quả học phần theo API Trường: Xây dựng Web API (3 TC).";
  const readable = academicExplanation(saved);
  assert.match(readable, /theo kết quả do Trường ghi nhận/);
  assert.match(readable, /Xây dựng Web API \(3 TC\)/);
  assert.equal(getHumanUnEvaluatedExplanation({ ruleCode: "OTHER", explanation: saved }), readable);
});

test("a breached failed-credit ratio replaces its duplicate early signal while VT stays visible", () => {
  const regulatory: ProfileWarningReason = { reasonCode: "FAILED_CREDIT_RATIO_THRESHOLD_BREACHED", severity: "high", title: null, details: { ruleCode: "QD600_FAILED_CREDIT_RATIO", sourceType: "REGULATORY", evaluationStatus: "EVALUATED", observedValue: 1, thresholdValue: 0.5, isThresholdBreached: true } };
  const early: ProfileWarningReason = { reasonCode: "EARLY_FAILED_CREDIT_RATIO", severity: "medium", title: null, details: { observedValue: 1, thresholdValue: 0.3 } };
  const vt: ProfileWarningReason = { reasonCode: "EXAM_ABSENCE_RECORDED", severity: "medium", title: null, details: { ruleCode: "EARLY_EXAM_ABSENCE", observedValue: 5 } };
  const reasons = [early, vt, regulatory];
  const before = JSON.stringify(reasons);
  assert.deepEqual(visibleWarningReasons(reasons), [vt, regulatory]);
  assert.equal(JSON.stringify(reasons), before);

  // Below or exactly at the regulatory boundary, the early signal still matters.
  for (const observedValue of [0.3, 0.5]) {
    const academic = { ...regulatory, details: { ...regulatory.details, observedValue, isThresholdBreached: false } };
    const advisory = { ...early, details: { ...early.details, observedValue } };
    assert.deepEqual(visibleWarningReasons([academic, advisory]), [academic, advisory]);
  }
  assert.deepEqual(visibleWarningReasons([early, vt]), [early, vt]);
});

test("unevaluated or conflicting ratio evidence does not hide the early signal", () => {
  const early: ProfileWarningReason = { reasonCode: "EARLY_FAILED_CREDIT_RATIO", severity: "medium", title: null, details: { observedValue: 1 } };
  for (const details of [
    { observedValue: 1, evaluationStatus: "NOT_EVALUATED" },
    { observedValue: null, evaluationStatus: "EVALUATED" },
    { observedValue: 0.6, evaluationStatus: "EVALUATED" },
  ]) {
    const regulatory: ProfileWarningReason = { reasonCode: "QD600_FAILED_CREDIT_RATIO", severity: "high", title: null, details: { sourceType: "REGULATORY", isThresholdBreached: true, ...details } };
    assert.deepEqual(visibleWarningReasons([regulatory, early]), [regulatory, early]);
  }
});

test("progress pending context preserves improvement, retake and unconfirmed results in stored formats", () => {
  const courses = [
    { courseCode: "A", courseName: "Môn A", credits: 3, context: "IMPROVEMENT" },
    { courseCode: "B", courseName: "Môn B", credits: 4, context: "RETAKE" },
    { courseCode: "C", courseName: "Môn C", credits: 2, context: "AWAITING_RESULT" },
  ];
  const rules = [{ ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT", pendingProgressCourses: [...courses, { ...courses[0], context: "UNKNOWN" }, { ...courses[0], credits: null }] }];
  assert.deepEqual(warningPendingProgressCourses(rules), courses);
  assert.deepEqual(warningPendingProgressCourses({ rules }), courses);
  assert.deepEqual(warningPendingProgressCourses(null), []);
});

test("one semester GPA card retains both thresholds and gives an academic breach priority", () => {
  const regulatory: ProfileWarningReason = { reasonCode: "QD600_TERM_GPA", severity: "high", title: "Điểm trung bình học kỳ thấp", details: { ruleCode: "QD600_TERM_GPA", observedValue: 0.63, thresholdValue: 1, sourceType: "REGULATORY", isThresholdBreached: true } };
  const early: ProfileWarningReason = { reasonCode: "EARLY_LOW_TERM_GPA", severity: "medium", title: "GPA dưới ngưỡng sớm", details: { ruleCode: "EARLY_LOW_TERM_GPA", observedValue: 0.63, thresholdValue: 2 } };
  const drop: ProfileWarningReason = { reasonCode: "EARLY_TERM_GPA_DROP", severity: "medium", title: "GPA suy giảm", details: { observedValue: 1.2, thresholdValue: 0.5 } };
  const reasons = [early, drop, regulatory];
  const before = JSON.stringify(reasons);
  const group = termGpaWarningGroup(reasons, []);
  assert.ok(group);
  assert.equal(group.observedValue, 0.63);
  assert.equal(group.regulatoryThreshold, 1);
  assert.equal(group.earlyThreshold, 2);
  assert.equal(group.regulatoryBreached, true);
  assert.deepEqual(reasons.filter(reason => !group.reasons.includes(reason)), [drop]);
  const html = renderToStaticMarkup(createElement(WarningTermGpaCard, { group }, createElement("span", { "data-evidence": "term" }, "Bảng điểm")));
  assert.equal((html.match(/<article/g) || []).length, 1);
  assert.equal((html.match(/data-evidence="term"/g) || []).length, 1);
  assert.match(html, /Dưới ngưỡng học vụ/);
  assert.match(html, /&lt; 1\.00/);
  assert.match(html, /&lt; 2\.00/);
  assert.match(html, /không thay thế quyết định/);
  assert.equal(JSON.stringify(reasons), before);
});

test("an early-only GPA still shows the evaluated non-breached academic threshold from the stored run", () => {
  const early: ProfileWarningReason = { reasonCode: "EARLY_LOW_TERM_GPA", severity: "medium", title: null, details: { observedValue: 1.5, thresholdValue: 2 } };
  for (const rules of [[{ ruleCode: "QD600_TERM_GPA", observedValue: 1.5, thresholdValue: 1, evaluationStatus: "EVALUATED", isThresholdBreached: false }], { rules: [{ ruleCode: "QD600_TERM_GPA", observedValue: 1.5, thresholdValue: 1, evaluationStatus: "EVALUATED", isThresholdBreached: false }] }]) {
    const group = termGpaWarningGroup([early], rules)!;
    assert.equal(group.regulatoryThreshold, 1);
    assert.equal(group.regulatoryBreached, false);
    const html = renderToStaticMarkup(createElement(WarningTermGpaCard, { group }));
    assert.match(html, /Cần chú ý/);
    assert.doesNotMatch(html, /Dưới ngưỡng học vụ/);
  }
});

test("GPA grouping preserves first-semester thresholds, disabled early signals and unknown measurements", () => {
  const reason: ProfileWarningReason = { reasonCode: "QD600_TERM_GPA_FIRST_TERM", severity: "high", title: null, details: { observedValue: null, thresholdValue: 0.8, isThresholdBreached: true, evaluationStatus: "NOT_EVALUATED" } };
  const group = termGpaWarningGroup([reason], [])!;
  assert.equal(group.observedValue, null);
  assert.equal(group.regulatoryThreshold, 0.8);
  assert.equal(group.earlyThreshold, null);
  assert.equal(group.regulatoryBreached, false);
  const html = renderToStaticMarkup(createElement(WarningTermGpaCard, { group }));
  assert.match(html, /Chưa có GPA hợp lệ/);
  assert.doesNotMatch(html, /GPA học kỳ 0\.00|Dưới ngưỡng học vụ/);
  assert.equal(termGpaWarningGroup([], []), null);
  assert.equal(termGpaWarningGroup([{ ...reason, reasonCode: "EARLY_TERM_GPA_DROP" }], []), null);
});

test("conflicting saved GPA values stay separate for verification rather than hiding one measurement", () => {
  const reason: ProfileWarningReason = { reasonCode: "QD600_TERM_GPA", severity: "high", title: null, details: { observedValue: 0.63, thresholdValue: 1 } };
  assert.equal(termGpaWarningGroup([reason, { ...reason, reasonCode: "EARLY_LOW_TERM_GPA", details: { observedValue: 1.5, thresholdValue: 2 } }], []), null);
});
test("known base-catalog courses have a distinct curriculum review with validated metadata", () => {
  const course = {courseCode:"20CT3112D",courseName:"Môn nâng cao",credits:3,catalogProgramCode:"CQ22CT",outcome:"pending",academicYear:"2024-2025",termCode:"HK02"};
  const rule={ruleCode:"QD600_ACCUMULATED_DEBT_CREDITS",reasonCode:"CURRICULUM_SCOPE_REQUIRES_VERIFICATION",explanation:"Môn có trong CTĐT chung; chờ xác nhận phạm vi.",curriculumReviewCourses:[course,{...course,credits:null},{...course,outcome:"INVALID"}]};
  assert.deepEqual(warningCurriculumReviewCourses([rule]),[course]);
  assert.deepEqual(warningCurriculumReviewCourses({rules:[rule]}),[course]);
  assert.deepEqual(warningCurriculumReviewCourses([]),[]);
  assert.equal(getHumanUnEvaluatedExplanation(rule),rule.explanation);
});
test("VT guidance and pending debt data distinguish verification from confirmed F debt", () => {
  assert.equal(warningThresholdLabel({ reasonCode: "EARLY_EXAM_ABSENCE", severity: "medium", title: null, details: {thresholdValue:1} }), "Có lượt vắng thi trong kỳ");
  assert.ok(warningSupportSuggestions(["EARLY_EXAM_ABSENCE"]).some(text => text.includes("kết quả đạt hoặc không đạt do Trường ghi nhận")));
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
  assert.equal(warningRegulatoryAssessment(rules), "Chưa đánh giá đủ các tiêu chí QĐ600");
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
