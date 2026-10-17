import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { courseOutcome, warningCourseOutcome, sourcePassOutcome } from "../lib/academic-course-rules";
import { calculateAcademicDebt } from "../lib/services/academic-debt";
import { calculateAssessmentTermFailedCredits } from "../lib/services/academic-warning-capabilities";
import { evaluateStudentTrainingProgress, StudentTrainingProgressService } from "../lib/services/student-training-progress";
import { academicWarningProgressSignal, calculateAcademicWarningProgressSignals } from "../lib/services/academic-warning-progress";
import { loadSourceCreditRecognitions } from "../lib/services/source-credit-recognition";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/auth/jwt";
import { GET as getProgress } from "../app/api/v1/students/[id]/training-progress/route";
import { assessAcademicStanding } from "../lib/services/academic-standing-rules";

function mock(context: TestContext, target: object, key: string, replacement: (...args: never[]) => unknown) {
  const record = target as Record<string, unknown>, original = record[key];
  record[key] = replacement;
  context.after(() => { record[key] = original; });
}
const student = { id: "s", studentCode: "S", fullName: "S", classCode: "C", cohortCode: "K49", programCode: "TEST" };
const course = (code: string, semesterNo = 1, credits = 3) => ({ courseId: code, courseCode: code, courseName: code, credits, semesterNo, requirementType: "mandatory" });
const timeline = { currentAcademicYear: "2025-2026", currentTermCode: "HK02", expectedYear: 1, expectedSemester: "HK2", expectedSemesterNo: 2 };

test("quarantined ordinary rows from another program are not unresolved transfer recognition", async context => {
  mock(context, prisma.unscopedGradeRecord, "findMany", async () => [{ id: "q", studentId: "s", reason: "API_PROGRAM_SCOPE_CONFLICT",
    sCourseCode: "A", sCourseName: "A", sCredits: 3, sourcePayload: { StudyProgramID: "OTHER", IsPass: null, NotScore: "1", DiemChuyenMien: "" } }]);
  mock(context, prisma.studentDecision, "findMany", async () => []);
  mock(context, prisma.academicTerm, "findMany", async () => []);
  mock(context, prisma.academicYear, "findMany", async () => []);
  const result = (await loadSourceCreditRecognitions(["s"], "TEST", { academicYear: "2026-2027", termCode: "HK01", termOrder: 1 })).get("s")!;
  assert.deepEqual(result.attempts, []);
  assert.deepEqual(result.unresolvedCourseCodes, []);
});

test("incoming transfer does not create missing-registration warnings before individual admission", () => {
  const terms = ["2023-2024", "2024-2025"].map((year, i) => ({ id: `t${i}`, academicYearId: year, academicYearCode: year, termOrder: 1, isSummer: false, label: year }));
  const source = { assessmentTermId: "t0", previousTermId: null, summaryPresent: false, registeredOfferings: 0, summaryRegisteredCredits: null,
    previousSummaryPresent: false, previousRegisteredOfferings: 0, previousRegisteredCredits: null, cohortCode: "K47", studyType: "Chính quy", assessmentDate: null,
    terms, decisions: [{ id: "d", termId: "t1", number: "100/QĐ", signedAt: "2024-08-20", name: "Tiếp nhận Chuyển trường", typeName: "Tiếp nhận Chuyển trường" }] };
  assert.equal(assessAcademicStanding(source).excluded, true);
  assert.equal(assessAcademicStanding({ ...source, assessmentTermId: "t1" }).excluded, false);
});

test("VT uses API IsPass in debt, ratio and progress, independently of pending/display flags", () => {
  for (const isPass of [true, false]) {
    const attempt = { courseCode: "A", credits: 3, specialCode: "VT", letterCode: "VT", isPass: !isPass,
      sourcePayload: { isPass }, notScore: true, scoreStatus: "pending", academicYear: "2025-2026", termCode: "HK01" };
    const before = JSON.stringify(attempt);
    assert.equal(courseOutcome(attempt), isPass ? "passed" : "failed");
    assert.equal(warningCourseOutcome(attempt), courseOutcome(attempt));
    const progress = evaluateStudentTrainingProgress({ student, curriculum: [course("A")], grades: [attempt], timeline });
    assert.equal(progress.semesters[0].courses[0].status, isPass ? "PASSED" : "FAILED");
    assert.equal(progress.semesters[0].courses[0].isCurrentlyStudying, false);
    const debt = calculateAcademicDebt([attempt], [course("A")], "TEST");
    assert.equal(debt.accumulatedDebtCredits, isPass ? 0 : 3);
    const ratio = calculateAssessmentTermFailedCredits("term", [{ ...attempt, isPass: sourcePassOutcome(attempt.sourcePayload), academicTermId: "term", offeringId: "o", hasFinalGrade: false }]);
    assert.equal(ratio.failedCreditRatio, isPass ? 0 : 1);
    assert.equal(ratio.dataStatus, "COMPLETE");
    assert.equal(JSON.stringify(attempt), before);
  }
});

test("same title and different codes never manufacture credits; verified program aliases still work", () => {
  const target = { ...course("NEW", 1, 3), courseName: "Same name" };
  const attempt = { courseCode: "OLD", courseName: "Same name", credits: 2, isPass: true, scoreStatus: "graded" };
  const evaluation = evaluateStudentTrainingProgress({ student, curriculum: [target], grades: [attempt], timeline });
  assert.equal(evaluation.summary.completedCredits, 0);
  assert.equal(evaluation.reconciliation?.status, "REVIEW_REQUIRED");
  assert.equal(academicWarningProgressSignal(evaluation, "p").creditDeficit, null);
  assert.equal(calculateAcademicDebt([attempt], [target], "TEST").dataStatus, "PARTIAL");
  const alias = evaluateStudentTrainingProgress({ student: { ...student, programCode: "CQ23CT-PM" }, curriculum: [course("20TN1202", 1, 4)],
    grades: [{ ...attempt, courseCode: "TN1008D", credits: 4 }], timeline });
  assert.equal(alias.semesters[0].courses[0].status, "PASSED");
});

test("an independently passed curriculum code needs no name mapping and earns credits only once", () => {
  const target = { ...course("NEW"), courseName: "Same name" };
  const passed = { courseCode: "NEW", courseName: "Same name", credits: 3, isPass: true, scoreStatus: "graded" };
  const oldResults = [
    { isPass: true, scoreStatus: "graded" },
    { isPass: false, scoreStatus: "graded" },
    { isPass: false, scoreStatus: "pending", notScore: true },
    {},
  ];
  for (const oldResult of oldResults) {
    const old = { courseCode: "OLD", courseName: "Same name", credits: 2, ...oldResult };
    for (const grades of [[old, passed], [passed, old]]) {
      const before = JSON.stringify(grades);
      const evaluation = evaluateStudentTrainingProgress({ student, curriculum: [target], grades, timeline });
      assert.equal(evaluation.summary.completedCredits, 3);
      assert.equal(evaluation.semesters[0].courses[0].attemptCount, 1);
      assert.equal(evaluation.reconciliation?.status, "READY");
      const signal = academicWarningProgressSignal(evaluation, "p");
      assert.equal(signal.creditDeficit, 0);
      assert.equal(signal.dataStatus, "COMPLETE");
      const debt = calculateAcademicDebt(grades, [target], "TEST");
      assert.equal(debt.accumulatedDebtCredits, 0);
      assert.equal(debt.dataStatus, "COMPLETE");
      assert.deepEqual(debt.curriculumReviewCourses ?? [], []);
      assert.equal(JSON.stringify(grades), before);
    }
  }
});

test("a same-name pass cannot settle a missing, failed or pending curriculum code", () => {
  const target = { ...course("NEW"), courseName: "Same name" };
  const old = { courseCode: "OLD", courseName: "Same name", credits: 3, isPass: true, scoreStatus: "graded" };
  for (const current of [[], [{ courseCode: "NEW", credits: 3, isPass: false, scoreStatus: "graded" }],
    [{ courseCode: "NEW", credits: 3, isPass: false, scoreStatus: "pending", notScore: true }]]) {
    const grades = [old, ...current];
    const evaluation = evaluateStudentTrainingProgress({ student, curriculum: [target], grades, timeline });
    assert.equal(evaluation.summary.completedCredits, 0);
    assert.equal(evaluation.reconciliation?.status, "REVIEW_REQUIRED");
    assert.equal(academicWarningProgressSignal(evaluation, "p").creditDeficit, null);
    const debt = calculateAcademicDebt(grades, [target], "TEST");
    assert.equal(debt.dataStatus, "PARTIAL");
    assert.equal(debt.curriculumReviewCourses?.[0].courseCode, "OLD");
  }
});

test("a pass settles only its own code, leaving other same-name requirements and credit mismatches for review", () => {
  const curriculum = ["A", "B"].map(code => ({ ...course(code), courseName: "Same name" }));
  const old = { courseCode: "OLD", courseName: "Same name", credits: 3, isPass: true, scoreStatus: "graded" };
  const passed = { ...old, courseCode: "A" };
  const evaluation = evaluateStudentTrainingProgress({ student, curriculum, grades: [old, passed], timeline });
  assert.equal(evaluation.summary.completedCredits, 3);
  assert.deepEqual(evaluation.reconciliation?.issues[0].courseCodes, ["OLD", "B"]);
  assert.equal(calculateAcademicDebt([old, passed], curriculum, "TEST").dataStatus, "PARTIAL");
  const mismatched = { ...passed, credits: 2 };
  const mismatch = evaluateStudentTrainingProgress({ student, curriculum: [curriculum[0]], grades: [old, mismatched], timeline });
  assert.equal(mismatch.summary.completedCredits, 0);
  assert.equal(mismatch.reconciliation?.status, "REVIEW_REQUIRED");
  assert.equal(calculateAcademicDebt([old, mismatched], [curriculum[0]], "TEST").dataStatus, "PARTIAL");
});

test("a pending improvement preserves one earned obligation; pending retake preserves existing debt", () => {
  for (const isPass of [true, false]) {
    const old = { courseCode: "A", credits: 3, isPass, scoreStatus: "graded", letterCode: isPass ? "C" : "F" };
    const pending = { courseCode: "A", credits: 3, isPass: false, scoreStatus: "pending", notScore: true };
    const debt = calculateAcademicDebt([old, pending], [course("A")], "TEST");
    assert.equal(debt.accumulatedDebtCredits, isPass ? 0 : 3);
    const progress = evaluateStudentTrainingProgress({ student, curriculum: [course("A")], grades: [old, pending], timeline });
    assert.equal(progress.summary.completedCredits, isPass ? 3 : 0);
    assert.equal(academicWarningProgressSignal(progress, "p").pendingCourses?.[0].context, isPass ? "IMPROVEMENT" : "RETAKE");
  }
});

test("pending cross-cohort registration does not make progress or debt uncertain and cannot settle existing failure", () => {
  const target = { ...course("NEW"), courseName: "Same name" };
  const pending = { courseCode: "OLD", courseName: "Same name", credits: 3, academicYear: "2026-2027", termCode: "HK01",
    sourcePayload: { IsPass: null, NotScore: "1" }, isPass: false, scoreStatus: "pending", notScore: true };
  for (const old of [[], [{ courseCode: "NEW", credits: 3, isPass: false, scoreStatus: "graded", letterCode: "F" }]]) {
    const grades = [...old, pending];
    const before = JSON.stringify(grades);
    const result = evaluateStudentTrainingProgress({ student, curriculum: [target], grades, timeline });
    assert.equal(result.reconciliation?.status, "READY");
    assert.equal(result.summary.completedCredits, 0);
    assert.equal(result.courseStatus.pendingRegistrations.length, 1);
    for (const [key, value] of Object.entries(pending)) assert.deepEqual(result.courseStatus.pendingRegistrations[0][key as keyof typeof pending], value);
    assert.equal(result.courseStatus.unmatched[0].courseCode, "OLD");
    assert.equal(result.student.programCode, "TEST");
    const debt = calculateAcademicDebt(grades, [target], "TEST", [{ ...target, courseCode: "OLD", catalogProgramCode: "OTHER" }]);
    assert.equal(debt.dataStatus, "COMPLETE");
    assert.equal(debt.accumulatedDebtCredits, old.length ? 3 : 0);
    assert.equal(debt.pendingCourses?.at(-1)?.courseCode, "OLD");
    assert.deepEqual(debt.curriculumReviewCourses ?? [], []);
    assert.equal(JSON.stringify(grades), before);
  }
  // A VT with an authoritative failing result is not a pending registration,
  // even when the source also has NotScore set.
  const vt = { ...pending, sourcePayload: { IsPass: "" }, specialCode: "VT" };
  assert.equal(evaluateStudentTrainingProgress({ student, curriculum: [target], grades: [vt], timeline }).reconciliation?.status, "REVIEW_REQUIRED");
});

test("current monitoring excludes the ongoing term's due-credit milestone while historical assessment includes it", async context => {
  mock(context, prisma.academicTerm, "findFirst", async () => ({ academicYearId: "y", sTermCode: "HK01", sTermOrder: 1 }));
  mock(context, prisma.academicYear, "findFirst", async () => ({ sYearCode: "2025-2026" }));
  mock(context, StudentTrainingProgressService, "getStudentTrainingProgress", async (_id: string, _scope: unknown, assessment: NonNullable<Parameters<typeof StudentTrainingProgressService.getStudentTrainingProgress>[2]>) => {
    const curriculum = Array.from({ length: 4 }, (_, i) => course(`A${i}`));
    return evaluateStudentTrainingProgress({ student, curriculum,
      grades: curriculum.map(c => ({ courseCode: c.courseCode, credits: c.credits, scoreStatus: "pending", notScore: true })),
      timeline: { ...timeline, currentTermCode: "HK01", expectedSemesterNo: assessment.boundary === "BEFORE_TERM" ? 1 : 2 } });
  });
  const input = { students: [{ id: "s" }], cohortId: "c", trainingProgramId: "p", assessmentTermId: "t", programCode: "TEST" };
  const live = (await calculateAcademicWarningProgressSignals({ ...input, boundary: "BEFORE_TERM" })).get("s")!;
  assert.equal(live.creditDeficit, 0);
  assert.equal(live.missingRequiredCredits, 0);
  assert.equal(live.dataStatus, "COMPLETE");
  const ended = (await calculateAcademicWarningProgressSignals(input)).get("s")!;
  assert.equal(ended.creditDeficit, 12);
  assert.equal(ended.latestCompletedSemester, 1);
});

test("School R credits use the signed transfer boundary without inventing the original study semester", async context => {
  const payload = { IsPass: "x", DiemChuyenMien: "R", StudyProgramID: "TEST", YearStudy: "", TermID: "", DiemTK_4: "3.0", DiemTK_Chu: "B" };
  const before = JSON.stringify(payload);
  mock(context, prisma.unscopedGradeRecord, "findMany", async () => [{ id: "r", studentId: "s", sCourseCode: "A", sCourseName: "A", sCredits: 3, sourcePayload: payload }]);
  mock(context, prisma.studentDecision, "findMany", async () => [{ id: "decision", studentId: "s", academicTermId: "t", sDecisionName: "Tiếp nhận Chuyển trường", sFullText: "Chuyển trường đến", sDecisionNumber: "100/QĐ", sSignDate: new Date("2024-08-20") }]);
  mock(context, prisma.academicTerm, "findMany", async () => [{ id: "t", academicYearId: "y", sTermCode: "HK01", sTermOrder: 1 }]);
  mock(context, prisma.academicYear, "findMany", async () => [{ id: "y", sYearCode: "2024-2025" }]);
  const earlier = (await loadSourceCreditRecognitions(["s"], "TEST", { academicYear: "2023-2024", termCode: "HK02", termOrder: 2 })).get("s")!;
  assert.equal(earlier.attempts.length, 0);
  assert.deepEqual(earlier.unresolvedCourseCodes, []);
  const recognized = (await loadSourceCreditRecognitions(["s"], "TEST", { academicYear: "2024-2025", termCode: "HK01", termOrder: 1 })).get("s")!;
  assert.equal(recognized.attempts.length, 1);
  const evaluation = evaluateStudentTrainingProgress({ student, curriculum: [course("A")], grades: recognized.attempts, timeline });
  assert.equal(evaluation.summary.completedCredits, 3);
  assert.equal(evaluation.reconciliation?.recognizedCourses[0].academicYear, "2024-2025");
  assert.equal(calculateAcademicDebt([{ courseCode: "A", credits: 3, isPass: false, scoreStatus: "graded", letterCode: "F" }, ...recognized.attempts], [course("A")], "TEST").accumulatedDebtCredits, 0);
  const otherProgram = (await loadSourceCreditRecognitions(["s"], "OTHER", { academicYear: "2025-2026", termCode: "HK01", termOrder: 1 })).get("s")!;
  assert.equal(otherProgram.attempts.length, 0);
  assert.deepEqual(otherProgram.unresolvedCourseCodes, ["A"]);
  assert.equal(JSON.stringify(payload), before);
});

test("warning progress endpoint pins term and program and rejects another student's result", async context => {
  process.env.JWT_SECRET ||= "special-cases-test-secret-at-least-32-characters";
  const id = "11111111-1111-4111-8111-111111111111", resultId = "22222222-2222-4222-8222-222222222222";
  const actor = { userId: id, username: "test", fullName: "Test", grants: [{ role: "admin", scope: "system", permission: "*" }] };
  mock(context, prisma, "$queryRaw", async () => [{ id, username: "test", full_name: "Test", role_code: "admin", data_scope: "system", permission_code: "*" }]);
  mock(context, prisma.student, "findFirst", async () => ({ id }));
  mock(context, prisma.student, "findFirstOrThrow", async () => ({ id }));
  let wrongStudent = false, calls = 0;
  mock(context, prisma.academicWarningStudentResult, "findFirst", async (query: { where: { studentId: string } }) => {
    assert.equal(query.where.studentId, id);
    return wrongStudent ? null : { runId: "run", sProgramCode: "HISTORICAL" };
  });
  mock(context, prisma.academicWarningRun, "findFirst", async () => ({ assessmentAcademicTermId: "term", cohortId: "old-cohort" }));
  mock(context, prisma.academicTerm, "findUniqueOrThrow", async () => ({ academicYearId: "year", sTermCode: "HK02", sTermOrder: 2 }));
  mock(context, prisma.academicYear, "findUniqueOrThrow", async () => ({ sYearCode: "2024-2025" }));
  mock(context, StudentTrainingProgressService, "getStudentTrainingProgress", async (_id: string, _scope: unknown, assessment: unknown) => {
    calls++; assert.deepEqual(assessment, { academicYear: "2024-2025", termCode: "HK02", termOrder: 2, boundary: "END_OF_TERM", programCode: "HISTORICAL", cohortId: "old-cohort" });
    return { assessmentContext: assessment };
  });
  const { token } = await signAccessToken(id, "test", actor);
  const request = () => new NextRequest(`http://localhost/api/v1/students/${id}/training-progress?warningResultId=${resultId}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await getProgress(request(), { params: Promise.resolve({ id }) })).status, 200);
  wrongStudent = true;
  assert.equal((await getProgress(request(), { params: Promise.resolve({ id }) })).status, 404);
  assert.equal(calls, 1);
});
