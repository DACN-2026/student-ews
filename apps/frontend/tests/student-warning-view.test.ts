import assert from "node:assert/strict";
import { test } from "node:test";
import { isMainConductTerm, numericWarningValue, warningReasonSummary, warningRuleResults, warningSemesterHistory, warningThresholdLabel, type ProfileWarningReason, type ProfileWarningScan } from "../lib/student-warning-view";
import { getHumanUnEvaluatedExplanation, getLegalInfo } from "../lib/warning-rule-details";

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
test("progress basis explains mandatory courses even when total credits satisfy the plan", () => {
  assert.match(getLegalInfo({ details: { ruleCode: "TRAINING_PROGRESS_CREDIT_DEFICIT" } }).summary, /Đủ tổng tín chỉ nhưng còn học phần bắt buộc/);
  assert.match(getLegalInfo({ details: { ruleCode: "QD600_FAILED_CREDIT_RATIO" } }).title, /Điều 18/);
});
