import assert from "node:assert/strict";
import test from "node:test";
import { warningAssessmentGaps } from "../lib/warning-assessment-gaps";

const unavailable = (ruleCode: string, reasonCode: string, sourceType = "REGULATORY") => ({ ruleCode, reasonCode, sourceType, evaluationStatus: "NOT_EVALUATED" });

test("recorded VT and curriculum scope need verification without becoming evaluated", () => {
  const rules = [unavailable("QD600_ACCUMULATED_DEBT_CREDITS", "EXAM_ABSENCE_REQUIRES_VERIFICATION"), unavailable("OTHER", "CURRICULUM_SCOPE_REQUIRES_VERIFICATION")];
  const before = JSON.stringify(rules);
  const gaps = warningAssessmentGaps(rules);
  assert.equal(gaps.missingData.length, 0);
  assert.equal(gaps.verification.length, 2);
  assert.equal(JSON.stringify(rules), before);
  assert.equal(gaps.verification[0].rules[0].evaluationStatus, "NOT_EVALUATED");
});

test("one missing metric is shared by early and regulatory thresholds in both stored formats", () => {
  const rules = [unavailable("EARLY_LOW_TERM_GPA", "TERM_GPA_MISSING", "ADVISORY"), unavailable("QD600_TERM_GPA", "TERM_GPA_MISSING"), unavailable("EARLY_FAILED_CREDIT_RATIO", "FAILED_CREDIT_RATIO_INCOMPLETE", "ADVISORY"), unavailable("QD600_FAILED_CREDIT_RATIO", "NO_REGISTERED_CREDITS")];
  for (const saved of [rules, { rules }]) {
    const gaps = warningAssessmentGaps(saved);
    assert.equal(gaps.missingData.length, 2);
    assert.equal(gaps.verification.length, 0);
    assert.ok(gaps.missingData.every(group => group.rules.length === 2));
    assert.ok(gaps.missingData.every(group => group.rules[0].sourceType === "REGULATORY"));
  }
});

test("actual missing outcomes, unscoped history, GPA trend and semester identity stay visible", () => {
  const rules = [unavailable("QD600_TERM_GPA", "FIRST_MAIN_SEMESTER_UNKNOWN"), unavailable("EARLY_LOW_TERM_GPA", "TERM_GPA_MISSING", "ADVISORY"), unavailable("EARLY_TERM_GPA_DROP", "PREVIOUS_MAIN_TERM_GPA_MISSING", "ADVISORY"), unavailable("QD600_ACCUMULATED_DEBT_CREDITS", "UNSCOPED_HISTORICAL_ATTEMPTS"), unavailable("QD600_FAILED_CREDIT_RATIO", "FAILED_CREDIT_DATA_PARTIAL")];
  const gaps = warningAssessmentGaps(rules);
  assert.equal(gaps.missingData.length, 5);
  assert.equal(gaps.verification.length, 0);
});

test("saved VT ratio evidence moves both thresholds to verification without implying a complete result", () => {
  const regulatory = { ...unavailable("QD600_FAILED_CREDIT_RATIO", "FAILED_CREDIT_DATA_PARTIAL"), explanation: "Có 2 học phần VT (6 tín chỉ) cần xác minh riêng; chưa đủ kết quả cuối cùng để đối chiếu tỷ lệ tín chỉ không đạt QĐ600." };
  const early = unavailable("EARLY_FAILED_CREDIT_RATIO", "FAILED_CREDIT_RATIO_INCOMPLETE", "ADVISORY");
  const gaps = warningAssessmentGaps([early, regulatory]);
  assert.equal(gaps.missingData.length, 0);
  assert.equal(gaps.verification.length, 1);
  assert.equal(gaps.verification[0].rules[0].explanation, regulatory.explanation);
  assert.deepEqual(gaps.verification[0].rules, [regulatory, early]);
  // A historical VT in the debt rule does not explain a ratio in this term.
  const unrelated = warningAssessmentGaps([early, unavailable("QD600_FAILED_CREDIT_RATIO", "FAILED_CREDIT_DATA_PARTIAL"), unavailable("QD600_ACCUMULATED_DEBT_CREDITS", "EXAM_ABSENCE_REQUIRES_VERIFICATION")]);
  assert.equal(unrelated.missingData.length, 1);
  assert.equal(unrelated.verification.length, 1);
});

test("evaluated, inapplicable and retired rules do not create assessment gaps", () => {
  assert.deepEqual(warningAssessmentGaps([{ ruleCode: "QD600_TERM_GPA", evaluationStatus: "EVALUATED" }, { ruleCode: "OTHER", evaluationStatus: "NOT_APPLICABLE" }, unavailable("ACADEMIC_STUDY_DURATION_REVIEW", "MISSING")]), { missingData: [], verification: [] });
  assert.deepEqual(warningAssessmentGaps(null), { missingData: [], verification: [] });
});
