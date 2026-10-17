import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../lib/prisma";
import { buildGraduationForecast } from "../lib/services/graduation-forecast";
import { fetchDerivedRequirements } from "../lib/services/graduation-evaluations";
import { GradesService } from "../lib/services/grades";
import { loadEquivalentCourseIds } from "../lib/services/course-equivalence";
import { TrainingProgressService } from "../lib/services/training-progress";
import { loadSourceCreditRecognitions } from "../lib/services/source-credit-recognition";
function mock(context: TestContext, target: object, key: string, replacement: (...args: never[]) => unknown) {
  const record = target as Record<string, unknown>, original = record[key];
  record[key] = replacement; context.after(() => { record[key] = original; });
}
const course = { courseId: "c", courseCode: "NEW", courseName: "Same name", credits: 3, requirementType: "mandatory", semesterNo: 1 };
const forecast = (grades: Parameters<typeof buildGraduationForecast>[0]["grades"]) => buildGraduationForecast({ courses: [course], grades, requiredTotalCredits: 3, requiredElectiveCredits: 0 });

test("graduation never converts same-name or mismatched credits; an independently passed target needs no mapping", () => {
  const old = { courseCode: "OLD", courseName: "Same name", credits: 2, isPassed: true, scoreStatus: "graded" };
  assert.equal(forecast([old]).summary.completedCredits, 0);
  assert.equal(forecast([old]).curriculumComplete, null);
  assert.equal(forecast([{ ...old, courseCode: "NEW" }]).reconciliation.status, "REVIEW_REQUIRED");
  const correct = { ...old, courseCode: "NEW", credits: 3 };
  assert.equal(forecast([old, correct]).reconciliation.status, "READY");
  assert.equal(forecast([old, correct]).summary.completedCredits, 3);
});

test("pending improvement keeps earned credits; pending retake retains the failure evidence without a premature fail conclusion", () => {
  const pending = { courseCode: "NEW", isPassed: false, notScore: true, scoreStatus: "pending" };
  const pass = forecast([{ courseCode: "NEW", isPassed: true, scoreStatus: "graded" }, pending]);
  assert.equal(pass.summary.completedCredits, 3);
  const retry = forecast([{ courseCode: "NEW", isPassed: false, scoreStatus: "graded", letterGrade: "F" }, pending]);
  assert.equal(retry.noScoreCourses[0].confirmedOutcome, "FAILED");
  assert.equal(retry.summary.completedCredits, 0);
  assert.equal(retry.noScoreCourses[0].hasPendingAttempt, true);
});

test("pending cross-cohort registration is displayed separately and never grants equivalence or earned credits", () => {
  const pending = { courseCode: "OLD", courseName: "Same name", credits: 3, academicYear: "2026-2027", termCode: "HK01",
    sourcePayload: { IsPass: null, NotScore: "1" }, isPassed: false, notScore: true, scoreStatus: "pending" };
  const before = JSON.stringify(pending);
  const result = forecast([pending]);
  assert.equal(result.reconciliation.status, "READY");
  assert.equal(result.summary.completedCredits, 0);
  assert.equal(result.summary.pendingCredits, 0); // No unconfirmed allocation into curriculum credit quotas.
  assert.deepEqual(result.pendingRegistrations, [pending]);
  assert.equal(result.missingRequiredCourses[0].courseCode, "NEW");
  assert.equal(result.missingRequiredCourses[0].state, "not_completed");
  assert.equal(JSON.stringify(pending), before);
  // Once a result exists, recognition still needs evidence; a shared title never grants a pass.
  assert.equal(forecast([{ ...pending, sourcePayload: { IsPass: "x" }, notScore: false, scoreStatus: "graded" }]).reconciliation.status, "REVIEW_REQUIRED");
});

test("graduation does not read conduct records or derive a whole-course conduct condition", async context => {
  mock(context, prisma.studentGraduationRequirement, "findMany", async () => []);
  mock(context, prisma.studentConductRecord, "findMany", async () => { throw new Error("Graduation must not read conduct"); });
  mock(context, prisma.studentCourseOffering, "findMany", async () => []);
  const result = (await fetchDerivedRequirements(["s"], ["t"])).get("s")!;
  assert.equal("conductScore" in result, false);
  assert.equal("trainingStatus" in result, false);
  assert.equal("conductCount" in result, false);
  assert.equal(result.defenseStatus, "PENDING_CONFIRMATION");
  assert.equal(result.physicalStatus, "PENDING_CONFIRMATION");
  assert.equal(result.isVerified, false);
});

test("grade history includes its own ungraded attempts and does not depend on other students' grades", async context => {
  mock(context, prisma.student, "findFirst", async () => ({ id: "s" }));
  mock(context, prisma.studentCourseOffering, "findMany", async () => [{ id: "o", sCurriculumId: "NEW", sCourseName: "Own pending course", academicYearId: "y", academicTermId: "t", sCredits: 3 }]);
  mock(context, prisma.studentCourseGrade, "findMany", async () => []);
  mock(context, prisma.academicYear, "findMany", async () => [{ id: "y", sYearCode: "2025-2026" }]);
  mock(context, prisma.academicTerm, "findMany", async () => [{ id: "t", academicYearId: "y", sTermCode: "HK01", sTermOrder: 1, sIsSummer: false }]);
  mock(context, prisma, "$queryRaw", async () => { throw new Error("Global course-grade lookup must not be used"); });
  const rows = await GradesService.list("s", { view: "attempts" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].isPassed, null);
  assert.equal(rows[0].scoreStatus, "unknown");
  mock(context, prisma.studentCourseGrade, "findMany", async () => [{ offeringId: "o", sourcePayload: { IsPass: null, NotScore: "1" },
    isPass: false, notScore: true, scoreStatus: "pending" }]);
  const pending = (await GradesService.list("s", { view: "attempts" }))[0];
  assert.equal(pending.isPassed, null);
  assert.equal(pending.scoreStatus, "pending");
  assert.equal(pending.notScore, true);
});

test("course IDs only expand verified aliases, never arbitrary D suffixes with matching names", async context => {
  mock(context, prisma.course, "findMany", async () => [
    { id: "a", sCourseCode: "20CT4105", sCourseName: "Same name" },
    { id: "b", sCourseCode: "20CT4105D", sCourseName: "Same name" },
    { id: "c", sCourseCode: "TN1008D", sCourseName: "Toán rời rạc" },
    { id: "d", sCourseCode: "20TN1202", sCourseName: "Toán rời rạc" },
  ]);
  const aliases = await loadEquivalentCourseIds("CQ23CT-PM");
  assert.deepEqual(aliases.get("a"), ["a"]);
  assert.deepEqual(aliases.get("c"), ["c", "d"]);
});

test("recognized transfer evidence is available to certificate checks without fabricating a registration", async context => {
  mock(context, prisma.studentGraduationRequirement, "findMany", async () => []);
  mock(context, prisma.studentConductRecord, "findMany", async () => []);
  mock(context, prisma.studentCourseOffering, "findMany", async () => []);
  const attempts = ["TC1001", "TC1002", "TC2003"].map(courseCode => ({ courseCode, courseName: "GDTC", credits: 1,
    academicYear: "2024-2025", termCode: "HK01", isPass: true, isRecognized: true,
    recognition: { sourceRecordId: courseCode, decisionId: "signed-decision", academicYear: "2024-2025", termCode: "HK01" } }));
  const result = (await fetchDerivedRequirements(["s"], ["t"], new Map([["s", { attempts, unresolvedCourseCodes: [] }]]))).get("s")!;
  assert.equal(result.physicalStatus, "PASSED");
});

test("maintenance review cannot bypass missing cohort or other blockers, and ordinary calculations still reject unconfirmed mappings", async context => {
  let code = "COHORT_NOT_FOUND";
  mock(context, TrainingProgressService, "previewCompletionRun", async () => ({ canRun: false, blockers: [{ code, message: "blocked" }] }));
  mock(context, prisma, "$queryRaw", async () => { throw new Error("review-recording-stage"); });
  const input = { cohortId: "c", trainingProgramId: "p", assessmentAcademicTermId: "t" };
  await assert.rejects(TrainingProgressService.triggerCompletionRun({ ...input, recordConfigurationReview: true }), /blocked/);
  code = "PROGRAM_COVERAGE_INVALID";
  await assert.rejects(TrainingProgressService.triggerCompletionRun(input), /blocked/);
  await assert.rejects(TrainingProgressService.triggerCompletionRun({ ...input, recordConfigurationReview: true }), /review-recording-stage/);
});

test("undated M certificate passes in a current source view but is never invented in historical assessments", async context => {
  const payload = { StudyProgramID: "P", CurriculumID: "QP2101D", IsPass: "x", DiemChuyenMien: "M", YearStudy: "", TermID: "" };
  const before = JSON.stringify(payload);
  mock(context, prisma.unscopedGradeRecord, "findMany", async () => [{ id: "m", studentId: "s", sCourseCode: "QP2101D", sCourseName: "GDQP", sCredits: 3, sourcePayload: payload }]);
  mock(context, prisma.studentDecision, "findMany", async () => []);
  mock(context, prisma.academicTerm, "findMany", async () => []);
  mock(context, prisma.academicYear, "findMany", async () => []);
  const cutoff = { academicYear: "2026-2027", termCode: "HK01", termOrder: 1 };
  assert.equal((await loadSourceCreditRecognitions(["s"], "P", cutoff)).get("s")!.attempts.length, 0);
  const live = (await loadSourceCreditRecognitions(["s"], "P", cutoff, { includeUndatedConditional: true })).get("s")!.attempts[0];
  assert.equal(live.isPass, true);
  assert.equal(live.recognition.kind, "UNDATED_CERTIFICATE");
  assert.equal(live.academicYear, "");
  assert.equal(live.termCode, "");
  assert.equal((await loadSourceCreditRecognitions(["s"], "OTHER", cutoff, { includeUndatedConditional: true })).get("s")!.attempts.length, 0);
  assert.equal(JSON.stringify(payload), before);
});

test("cumulative profile metrics are selected for the current program and preserve a genuine zero", async context => {
  mock(context, prisma.student, "findFirst", async () => ({ id: "s", sStudyProgramId: "CURRENT" }));
  mock(context, prisma.studentTermSummary, "findMany", async () => []);
  mock(context, prisma.studentCumulativeSummary, "findFirst", async (query: { where: { sProgramCode: string } }) => {
    assert.equal(query.where.sProgramCode, "CURRENT");
    return { cumulativeGpa4: 0, cumulativeGpa10: 0, cumulativeCredits: 0, cumulativeRegisteredCredits: 3 };
  });
  mock(context, prisma.studentConductRecord, "findMany", async () => []);
  mock(context, prisma.unscopedGradeRecord, "findMany", async () => []);
  mock(context, prisma.academicTerm, "findMany", async () => []);
  mock(context, prisma.academicYear, "findMany", async () => []);
  assert.equal((await GradesService.summaries("s")).cumulative?.cumulativeGpa4, 0);
});
