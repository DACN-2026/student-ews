import assert from "node:assert/strict";
import test from "node:test";
import { createAcademicWarningCapabilitySnapshot, createQd600StudentCapabilityData } from "../lib/services/academic-warning-capabilities";
import { createQd600PolicyDefinition } from "../lib/services/academic-warning-policy";
import { evaluateQd600Article18 } from "../lib/services/academic-warning-qd600-rules";
import { projectQd600EvaluationForPersistence } from "../lib/services/academic-warnings";

function evaluateDebt(credits: number, dataStatus: "COMPLETE" | "PARTIAL" = "COMPLETE") {
  return evaluateQd600Article18({
    policyDefinition: createQd600PolicyDefinition(),
    capabilities: createAcademicWarningCapabilitySnapshot({ debtVerified: true }),
    capabilityData: createQd600StudentCapabilityData({
      assessmentTermId: "term", cumulativeCredits: 70, isFirstMainSemester: false,
      attempts: [{ offeringId: "passed", academicTermId: "term", credits: 20, scoreStatus: "graded", hasFinalGrade: true, isPass: true }],
      debt: { accumulatedDebtCredits: credits, dataStatus, reasonCode: dataStatus === "PARTIAL" ? "UNRESOLVED_HISTORICAL_ATTEMPTS" : null, outstandingCourses: [] },
    }),
    termGpa4: 3, cumulativeGpa4: 3, termKind: "MAIN",
    trainingProgress: { creditDeficit: 0, dataStatus: "COMPLETE", reasonCode: null, runId: "progress" },
  });
}

test("internal debt thresholds include exactly 19, separately from QĐ600's exclusive 24-credit boundary", () => {
  for (const [credits, status, risk] of [
    [0, "NORMAL", "GREEN"], [12, "NORMAL", "GREEN"],
    [13, "MONITORING", "YELLOW"], [18, "MONITORING", "YELLOW"],
    [19, "HIGH_RISK", "RED"], [20, "HIGH_RISK", "RED"],
    [24, "HIGH_RISK", "RED"], [25, "HIGH_RISK", "RED"],
  ] as const) {
    const result = evaluateDebt(credits);
    assert.equal(result.businessStatus, status, `${credits} credits`);
    const advisory = result.rules.find(rule => rule.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK")!;
    assert.equal(advisory.riskLevel, risk);
    assert.equal(advisory.sourceType, "ADVISORY");
    assert.equal(advisory.regulatorySource, null);
    assert.equal(advisory.articleRef, null);
    assert.equal(advisory.thresholdValue, risk === "RED" ? 19 : 13);
    assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS")!.isThresholdBreached, credits > 24);
    assert.deepEqual(result.regulatoryCoverage, { status: "FULL", evaluatedRules: 4, totalRules: 4, notEvaluatedRuleCodes: [] });
  }
});

test("the saved reason has the debt title, severity and internal provenance", () => {
  for (const [credits, severity] of [[13, "medium"], [19, "high"]] as const) {
    const saved = projectQd600EvaluationForPersistence(evaluateDebt(credits));
    assert.equal(saved.reasons.length, 1);
    assert.equal(saved.reasons[0].severity, severity);
    assert.equal(saved.reasons[0].title, `Nợ tín chỉ tích lũy ${credits} tín chỉ`);
    assert.equal(saved.reasons[0].sourceType, "ADVISORY");
    assert.match(saved.reasons[0].details.explanation, /ngưỡng theo dõi của hệ thống/);
  }
});

test("a regulatory debt breach keeps both evaluations but produces one debt reason", () => {
  const result = evaluateDebt(25);
  assert.equal(result.rules.filter(rule => rule.ruleCode.includes("ACCUMULATED_DEBT") && rule.isThresholdBreached).length, 2);
  const saved = projectQd600EvaluationForPersistence(result);
  assert.equal(saved.reasons.length, 1);
  assert.equal(saved.reasons[0].sourceType, "REGULATORY");
  assert.equal(saved.reasons[0].details.thresholdValue, 24);
});

test("partial debt history cannot be classified using the internal thresholds", () => {
  const result = evaluateDebt(19, "PARTIAL");
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS")?.evaluationStatus, "NOT_EVALUATED");
  assert.equal(result.rules.some(rule => rule.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK"), false);
  assert.equal(projectQd600EvaluationForPersistence(result).reasons.length, 0);
});
