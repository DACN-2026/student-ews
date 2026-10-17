import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_EARLY_WARNING_SETTINGS, parseEarlyWarningSettings } from "../lib/services/early-warning-settings";
import { EMPTY_EARLY_WARNING_SOURCES, evaluateEarlyWarningSignals } from "../lib/services/early-warning-signals";
import { createQd600PolicyDefinition, parseAcademicWarningPolicyDefinition } from "../lib/services/academic-warning-policy";
import { createAcademicWarningCapabilitySnapshot, createQd600StudentCapabilityData } from "../lib/services/academic-warning-capabilities";
import { evaluateQd600Article18 } from "../lib/services/academic-warning-qd600-rules";
import { regulatoryAssessment } from "../lib/services/warning-regulatory-assessment";
import { verifiedRepeatedFailureSource, loadEarlyWarningSources } from "../lib/services/early-warning-sources";
import { previewCurrentTermMonitoring } from "../lib/services/early-warning-monitoring";
import { prisma } from "../lib/prisma";
import { assessmentTermExamAbsences } from "../lib/services/early-warning-sources";
test("VT extraction deduplicates offerings and keeps conditional courses while excluding other outcomes", () => {
  const vt={offeringId:"v",academicTermId:"t",credits:1,scoreStatus:"special",hasFinalGrade:false,isPass:false,specialCode:"VT",courseCode:"TC1001",courseName:"GDTC"};
  assert.deepEqual(assessmentTermExamAbsences([vt,vt,{...vt,offeringId:"other",specialCode:"I"}]),[
    {offeringId:"v",courseCode:"TC1001",courseName:"GDTC",credits:1,conditional:true,isPass:false},
  ]);
});

const signalInput = { termGpa4: 1.9, cumulativeGpa4: 2.1, failedCreditRatio: 0.3 };
test("curriculum review remains separate from confirmed debt and retains its evidence in the stored rule", () => {
  const review = {courseCode:"20CT3112D",courseName:"Môn nâng cao",credits:3,catalogProgramCode:"CQ22CT",outcome:"pending" as const,academicYear:"2024-2025",termCode:"HK02"};
  const result = evaluateQd600Article18({
    policyDefinition:createQd600PolicyDefinition(),capabilities:createAcademicWarningCapabilitySnapshot({debtVerified:true}),
    capabilityData:createQd600StudentCapabilityData({cumulativeCredits:70,assessmentTermId:"t",isFirstMainSemester:false,
      attempts:[{offeringId:"p",academicTermId:"t",credits:3,scoreStatus:"graded",hasFinalGrade:true,isPass:true}],
      debt:{accumulatedDebtCredits:0,dataStatus:"PARTIAL",reasonCode:"CURRICULUM_SCOPE_REQUIRES_VERIFICATION",outstandingCourses:[],curriculumReviewCourses:[review]},
    }),termGpa4:3,cumulativeGpa4:3,termKind:"MAIN",
  });
  const debt=result.rules.find(r=>r.ruleCode==="QD600_ACCUMULATED_DEBT_CREDITS")!;
  assert.equal(debt.evaluationStatus,"NOT_EVALUATED");assert.equal(debt.observedValue,null);assert.equal(debt.isThresholdBreached,false);
  assert.deepEqual(debt.curriculumReviewCourses,[review]);assert.ok(debt.explanation.includes("CTĐT chung"));
});
test("exam absences are an advisory signal with separate course and credit counts, including conditional courses", () => {
  const rules = evaluateEarlyWarningSignals({ ...signalInput, failedCreditRatio: null, settings: parseEarlyWarningSettings(undefined), sources: {
    ...EMPTY_EARLY_WARNING_SOURCES, examAbsences: [
      { offeringId: "a", courseCode: "20CT1102", courseName: "Lập trình", credits: 4, conditional: false },
      { offeringId: "b", courseCode: "TC1001", courseName: "GDTC", credits: 1, conditional: true },
    ],
  } });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].ruleCode, "EARLY_EXAM_ABSENCE");
  assert.equal(rules[0].sourceType, "ADVISORY");
  assert.equal(rules[0].absenceCourseCount, 2);
  assert.equal(rules[0].absenceCredits, 5);
  assert.equal(rules[0].isThresholdBreached, false);
  assert.equal(rules[0].regulatorySource, null);
  assert.equal(rules[0].riskLevel, "YELLOW");
});
test("new signals are disabled by default and existing credit thresholds stay intact", () => {
  assert.deepEqual(parseEarlyWarningSettings(undefined), DEFAULT_EARLY_WARNING_SETTINGS);
  assert.deepEqual(evaluateEarlyWarningSignals({ ...signalInput, settings: parseEarlyWarningSettings(undefined) }), []);
  assert.equal(parseEarlyWarningSettings(undefined).debtMonitoringFrom, 13);
  assert.equal(parseEarlyWarningSettings(undefined).debtHighRiskFrom, 19);
  assert.equal(parseEarlyWarningSettings(undefined).progressMonitoringFrom, 4);
  assert.equal(parseEarlyWarningSettings(undefined).progressHighRiskFrom, 12);
});
test("VT without a confirmed final outcome remains a concern without inventing a credit breach", () => {
  const result = evaluateQd600Article18({
    policyDefinition: createQd600PolicyDefinition(), capabilities: createAcademicWarningCapabilitySnapshot({debtVerified:true}),
    capabilityData: createQd600StudentCapabilityData({ cumulativeCredits:70,assessmentTermId:"t",isFirstMainSemester:false,
      attempts:[{offeringId:"vt",academicTermId:"t",credits:4,scoreStatus:"special",specialCode:"VT",hasFinalGrade:true,isPass:null,notScore:false}],
      debt:{accumulatedDebtCredits:0,dataStatus:"PARTIAL",reasonCode:"EXAM_ABSENCE_REQUIRES_VERIFICATION",outstandingCourses:[]},
    }),termGpa4:3,cumulativeGpa4:3,termKind:"MAIN",trainingProgress:{creditDeficit:0,dataStatus:"COMPLETE",reasonCode:null,runId:"p"},
    earlyWarningSources:{...EMPTY_EARLY_WARNING_SOURCES,examAbsences:[{offeringId:"vt",courseCode:"A",courseName:"Môn A",credits:4,conditional:false}]},
  });
  assert.equal(result.businessStatus,"MONITORING");
  assert.equal(result.rules.find(r=>r.ruleCode==="QD600_FAILED_CREDIT_RATIO")?.evaluationStatus,"NOT_EVALUATED");
  assert.equal(result.rules.filter(r=>r.sourceType==="REGULATORY").some(r=>r.isThresholdBreached),false);
  assert.equal(result.rules.find(r=>r.ruleCode==="EARLY_EXAM_ABSENCE")?.absenceCredits,4);
});

test("confirmed VT uses source IsPass for credits while GPA keeps the API aggregate", () => {
  const evaluate = (termGpa4: number | null, cumulativeGpa4: number | null) => evaluateQd600Article18({
    policyDefinition: createQd600PolicyDefinition(), capabilities: createAcademicWarningCapabilitySnapshot({ debtVerified: true }),
    capabilityData: createQd600StudentCapabilityData({ cumulativeCredits: 70, assessmentTermId: "t", isFirstMainSemester: false,
      attempts: [{ offeringId: "vt", academicTermId: "t", credits: 4, scoreStatus: "special", specialCode: "VT", notScore: false, hasFinalGrade: false, isPass: false }],
      debt: { accumulatedDebtCredits: 4, dataStatus: "COMPLETE", reasonCode: null, outstandingCourses: ["A"] },
    }), termGpa4, cumulativeGpa4, termKind: "MAIN", trainingProgress: { creditDeficit: 0, dataStatus: "COMPLETE", reasonCode: null, runId: "p" },
    earlyWarningSources: { ...EMPTY_EARLY_WARNING_SOURCES, examAbsences: [{ offeringId: "vt", courseCode: "A", courseName: "Môn A", credits: 4, conditional: false }] },
  });
  const result = evaluate(0.63, 2.16);
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_TERM_GPA")?.observedValue, 0.63);
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_CUMULATIVE_GPA_BY_YEAR")?.observedValue, 2.16);
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_FAILED_CREDIT_RATIO")?.observedValue, 1);
  assert.equal(result.rules.find(rule => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS")?.evaluationStatus, "EVALUATED");
  assert.equal(result.rules.find(rule => rule.ruleCode === "EARLY_EXAM_ABSENCE")?.absenceCredits, 4);
  const missing = evaluate(null, null);
  assert.equal(missing.rules.find(rule => rule.ruleCode === "QD600_TERM_GPA")?.reasonCode, "TERM_GPA_MISSING");
  assert.equal(missing.rules.find(rule => rule.ruleCode === "QD600_TERM_GPA")?.observedValue, null);
  assert.equal(missing.rules.find(rule => rule.ruleCode === "QD600_CUMULATIVE_GPA_BY_YEAR")?.evaluationStatus, "NOT_EVALUATED");
});

test("invalid and reversed monitoring settings cannot be applied", () => {
  for (const settings of [{ termGpaDrop: 0 }, { failedCreditRatioFrom: 0.51 }, { repeatedFailuresFrom: 1 }, { debtMonitoringFrom: 20, debtHighRiskFrom: 19 }, { progressMonitoringFrom: 12, progressHighRiskFrom: 4 }, { conductScoreBelow: 50 }]) {
    assert.throws(() => parseEarlyWarningSettings(settings));
  }
  assert.equal(parseEarlyWarningSettings({ conductScoreBelow: 50, recognizedConductStatusIds: ["recognized"] }).conductScoreBelow, 50);
});

test("GPA and failed-credit signals detect risk before a regulatory breach with exact boundaries", () => {
  const settings = parseEarlyWarningSettings({ termGpaBelow: 2, failedCreditRatioFrom: 0.3 });
  const rules = evaluateEarlyWarningSignals({ ...signalInput, settings });
  assert.equal(rules.length, 2);
  assert.equal(rules.every(rule => rule.isNearThreshold && !rule.isThresholdBreached && rule.regulatorySource === null), true);
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, termGpa4: 2 })[0].isNearThreshold, false);
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, failedCreditRatio: null })[1].evaluationStatus, "NOT_EVALUATED");
});

test("GPA trends require an adjacent main-term value, preserve zero, and tolerate decimal boundaries", () => {
  const settings = parseEarlyWarningSettings({ termGpaDrop: 0.5, cumulativeGpaDrop: 0.2 });
  const sources = { ...EMPTY_EARLY_WARNING_SOURCES, previousTermId: "previous", previousTermGpa4: 2.4, previousCumulativeGpa4: 2.3 };
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, sources }).every(rule => rule.isNearThreshold), true);
  const missing = evaluateEarlyWarningSignals({ ...signalInput, settings });
  assert.equal(missing.every(rule => rule.evaluationStatus === "NOT_EVALUATED" && rule.observedValue === null), true);
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, sources, termGpa4: 0 })[0].observedValue, 2.4);
});

test("conduct signals use only explicitly recognized source statuses in both periods", () => {
  const settings = parseEarlyWarningSettings({ conductScoreBelow: 50, conductScoreDrop: 10, recognizedConductStatusIds: ["approved"] });
  const sources = { ...EMPTY_EARLY_WARNING_SOURCES, conduct: { id: "now", score: 40, statusId: "approved" }, previousConduct: { id: "previous", score: 65, statusId: "approved" } };
  const rules = evaluateEarlyWarningSignals({ ...signalInput, settings, sources });
  assert.equal(rules.every(rule => rule.isNearThreshold && rule.sourceType === "ADVISORY"), true);
  const unapproved = evaluateEarlyWarningSignals({ ...signalInput, settings, sources: { ...sources, conduct: { ...sources.conduct, statusId: "1" } } });
  assert.equal(unapproved.every(rule => rule.evaluationStatus === "NOT_EVALUATED"), true);
  const missingPrevious = evaluateEarlyWarningSignals({ ...signalInput, settings, sources: { ...sources, previousConduct: null } });
  assert.equal(missingPrevious[0].isNearThreshold, true);
  assert.equal(missingPrevious[1].evaluationStatus, "NOT_EVALUATED");
});

test("repeated failures stop triggering after debt is settled by a valid replacement", () => {
  const sources = { ...EMPTY_EARLY_WARNING_SOURCES, repeatedFailedCourses: [{ courseCode: "CS1", courseName: "Course", failedAttempts: 3 }] };
  const debt = { accumulatedDebtCredits: 0, dataStatus: "COMPLETE" as const, reasonCode: null, outstandingCourses: [] };
  const settings = parseEarlyWarningSettings({ repeatedFailuresFrom: 2 });
  const verified = verifiedRepeatedFailureSource(sources, debt);
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, sources: verified })[0].isNearThreshold, false);
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, sources: verifiedRepeatedFailureSource(sources, { ...debt, dataStatus: "PARTIAL" }) })[0].evaluationStatus, "NOT_EVALUATED");
  assert.equal(evaluateEarlyWarningSignals({ ...signalInput, settings, sources: verifiedRepeatedFailureSource(sources, { ...debt, outstandingCourses: ["CS1"] }) })[0].isNearThreshold, true);
  assert.equal(verifiedRepeatedFailureSource({ ...sources, repeatedFailedCourses: null }, debt)?.repeatedFailedCourses, null);
});

function evaluation(earlyWarning = DEFAULT_EARLY_WARNING_SETTINGS, debtCredits = 19, provisional = false) {
  const definition = createQd600PolicyDefinition();
  definition.advisory.earlyWarning = earlyWarning;
  return evaluateQd600Article18({ policyDefinition: definition, capabilities: createAcademicWarningCapabilitySnapshot({ debtVerified: true }),
    capabilityData: createQd600StudentCapabilityData({ assessmentTermId: "term", cumulativeCredits: 70, isFirstMainSemester: false,
      attempts: [{ offeringId: "passed", academicTermId: "term", credits: 20, scoreStatus: "graded", hasFinalGrade: true, isPass: true }],
      debt: { accumulatedDebtCredits: debtCredits, dataStatus: "COMPLETE", reasonCode: null, outstandingCourses: [] } }),
    termGpa4: 1.9, cumulativeGpa4: 3, termKind: "MAIN", provisional,
    trainingProgress: { creditDeficit: 0, dataStatus: "COMPLETE", reasonCode: null, runId: "progress" } });
}

test("a high internal level does not manufacture a QD600 breach; customized settings reach the engine", () => {
  assert.equal(evaluation().businessStatus, "HIGH_RISK");
  assert.equal(regulatoryAssessment(evaluation().rules), "NOT_BREACHED");
  assert.equal(evaluation(parseEarlyWarningSettings({ debtMonitoringFrom: 20, debtHighRiskFrom: 23 })).businessStatus, "NORMAL");
  assert.equal(evaluation(parseEarlyWarningSettings({ termGpaBelow: 2 }), 0).businessStatus, "MONITORING");
  assert.equal(regulatoryAssessment(evaluation(undefined, 25).rules), "BREACHED");
  assert.equal(regulatoryAssessment(null), "UNRESOLVED");
});

test("provisional monitoring never claims a regulatory breach even when known debt exceeds 24", () => {
  const result = evaluation(undefined, 25, true);
  assert.equal(regulatoryAssessment(result.rules), "UNRESOLVED");
  assert.equal(result.rules.filter(rule => rule.sourceType === "REGULATORY").every(rule => !rule.isThresholdBreached && rule.evaluationStatus === "NOT_EVALUATED"), true);
});

test("policy round-trips advisory settings without altering QD600 thresholds or cohort scope", () => {
  const definition = createQd600PolicyDefinition({ applicableCohortIds: ["00000000-0000-4000-8000-000000000001"] });
  const updated = parseAcademicWarningPolicyDefinition({ ...definition, advisory: { ...definition.advisory, earlyWarning: parseEarlyWarningSettings({ termGpaDrop: 0.4 }) } });
  assert.equal(updated.evaluationProfile, "QD600_ARTICLE_18");
  if (updated.evaluationProfile !== "QD600_ARTICLE_18") return;
  assert.deepEqual(updated.thresholds, definition.thresholds);
  assert.deepEqual(updated.regulatory, definition.regulatory);
  assert.equal(updated.advisory.earlyWarning?.termGpaDrop, 0.4);
});

function mockMethod(target: object, key: string, replacement: (...args: never[]) => unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key]; record[key] = replacement;
  return () => { record[key] = original; };
}

test("current-term preview prioritizes missing registration while remaining read-only", async () => {
  let onlyActivities = false;
  const cohortId = "00000000-0000-4000-8000-000000000001";
  const definition = createQd600PolicyDefinition({ applicableCohortIds: [cohortId] });
  const cleanups = [
    mockMethod(prisma.student, "findFirst", async () => ({ id: "student", sStudyProgramId: "program", sClassStudentId: "class" })),
    mockMethod(prisma.academicTerm, "findMany", async () => [{ id: "current", academicYearId: "year", sTermCode: "HK01", sTermOrder: 1, sIsSummer: false }]),
    mockMethod(prisma.academicYear, "findUnique", async () => ({ sYearCode: "2026-2027" })),
    mockMethod(prisma.academicYear, "findMany", async () => [{ id: "year", sYearCode: "2026-2027" }]),
    mockMethod(prisma.class, "findFirst", async () => ({ cohortId })),
    mockMethod(prisma.cohort, "findUnique", async () => ({ sCohortCode: "K48", sCohortName: "Khóa 48 (2024-2028)" })),
    mockMethod(prisma.trainingProgram, "findFirst", async () => ({ id: "program", sProgramCode: "program", sStudyType: "Chính quy" })),
    mockMethod(prisma.studentTermSummary, "findMany", async () => []),
    mockMethod(prisma.studentCumulativeSummary, "findMany", async () => []),
    mockMethod(prisma.studentDecision, "findMany", async () => []),
    mockMethod(prisma.auditLog, "findFirst", async () => null),
    mockMethod(prisma.studentCourseGrade, "findMany", async () => []),
    mockMethod(prisma.studentCourseOffering, "findMany", async () => onlyActivities
      ? [{ id: "shcd", studentId: "student", academicTermId: "current", sCurriculumId: "SHCD-CD1", sCredits: 0 }] : []),
    mockMethod(prisma, "$transaction", () => { throw new Error("Preview must not mutate data"); }),
    mockMethod(prisma.academicWarningPolicy, "findMany", async () => [{ id: "policy", name: "Monitoring", version: 1, policyDefinition: definition }]),
  ];
  try {
    const result = await previewCurrentTermMonitoring("student");
    assert.equal(result.eligible, true);
    assert.equal(result.businessStatus, "HIGH_RISK");
    assert.ok(result.rules?.some(rule => rule.ruleCode === "EARLY_NO_REGISTRATION"));
    assert.equal(result.rules?.some(rule => rule.ruleCode === "EARLY_MISSING_TERM_DATA"), false);
    onlyActivities = true;
    const activityOnly = await previewCurrentTermMonitoring("student");
    assert.equal(activityOnly.businessStatus, "HIGH_RISK");
    assert.ok(activityOnly.rules?.some(rule => rule.ruleCode === "EARLY_NO_REGISTRATION"));
  }
  finally { cleanups.reverse().forEach(cleanup => cleanup()); }
});

test("trend loader uses the adjacent main term and excludes future and summer GPA", async () => {
  const terms = [
    { id: "previous", academicYearId: "year", sTermOrder: 1, sIsSummer: false, gradesFinalizedAt: new Date(), startDate: null },
    { id: "summer", academicYearId: "year", sTermOrder: 2, sIsSummer: true, startDate: null },
    { id: "current", academicYearId: "year", sTermOrder: 3, sIsSummer: false, startDate: null },
    { id: "future", academicYearId: "year", sTermOrder: 4, sIsSummer: false, startDate: null },
  ];
  const cleanups = [
    mockMethod(prisma.academicTerm, "findMany", async () => terms),
    mockMethod(prisma.academicYear, "findMany", async () => [{ id: "year", sYearCode: "2025-2026" }]),
    mockMethod(prisma.studentTermSummary, "findMany", async (...args: unknown[]) => {
      const query = args[0] as { where: { academicTermId: string; sProgramCode: string } };
      assert.equal(query.where.academicTermId, "previous"); assert.equal(query.where.sProgramCode, "program");
      return [{ studentId: "student", gpa4: 2.7, cumulativeGpa4: 2.5 }];
    }),
    mockMethod(prisma.studentCumulativeSummary, "findMany", async () => []),
    mockMethod(prisma.studentConductRecord, "findMany", async () => []),
    mockMethod(prisma.studentCourseOffering, "findMany", async (...args: unknown[]) => {
      const query = args[0] as { where: { academicTermId: { in: string[] } } };
      assert.deepEqual(query.where.academicTermId.in, ["previous", "summer", "current"]);
      return [];
    }),
  ];
  try {
    const sources = await loadEarlyWarningSources(["student"], "program", "current");
    assert.equal(sources.get("student")?.previousTermId, "previous");
    assert.equal(sources.get("student")?.previousCumulativeGpa4, 2.5);
  } finally { cleanups.reverse().forEach(cleanup => cleanup()); }
});
