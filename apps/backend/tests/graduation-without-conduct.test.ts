import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { prisma } from "../lib/prisma";
import { GraduationEvaluationsService, isApplicableGraduationRule, resolveGraduationStatus } from "../lib/services/graduation-evaluations";
import { graduationReasonsWithoutConduct, graduationSnapshotWithoutConduct, omitGraduationConduct } from "../lib/services/graduation-criteria";

function replace(context: TestContext, target: object, method: string, value: unknown) {
  const record = target as Record<string, unknown>, before = record[method];
  record[method] = value; context.after(() => { record[method] = before; });
}

test("removed conduct cannot block eligibility, pending grades, or remaining genuine review", () => {
  const conduct = { ruleCode: "WHOLE_COURSE_TRAINING", result: "NOT_AVAILABLE" as const };
  assert.equal(resolveGraduationStatus([conduct, { ruleCode: "CUMULATIVE_GPA", result: "PASS" }]), "EXPECTED_ELIGIBLE");
  assert.equal(resolveGraduationStatus([conduct, { ruleCode: "PROGRAM_COMPLETION", result: "PENDING" }]), "PENDING_GRADE");
  assert.equal(resolveGraduationStatus([{ ...conduct, result: "FAIL" }, { ruleCode: "PHYSICAL_EDUCATION", result: "PENDING" }]), "PENDING_REQUIREMENT");
  assert.equal(resolveGraduationStatus([conduct, { ruleCode: "PROGRAM_MAPPING", result: "NOT_AVAILABLE" }]), "MANUAL_REVIEW");
  assert.equal(resolveGraduationStatus([conduct, { ruleCode: "TOTAL_CREDITS", result: "FAIL" }]), "NOT_ELIGIBLE");
});

test("an existing local or global conduct rule never re-enables the removed feature", () => {
  const scope = { trainingProgramId: "p", cohortId: "c" };
  for (const trainingProgramId of [null, "p"]) {
    assert.equal(isApplicableGraduationRule({ ruleCode: "WHOLE_COURSE_TRAINING", trainingProgramId, cohortId: null }, scope), false);
  }
  assert.equal(isApplicableGraduationRule({ ruleCode: "TOTAL_CREDITS", trainingProgramId: "p", cohortId: "c" }, scope), true);
});

test("legacy API views remove conduct while preserving GPA, evidence and stored snapshots", () => {
  const record = { wholeCourseTrainingScore: 95, trainingStatus: "AVAILABLE", cumulativeGpa4: 2.9, totalCredits: 150 };
  const snapshot = { rules: [{ code: "WHOLE_COURSE_TRAINING" }, { code: "TOTAL_CREDITS", requiredValue: "150" }], readiness: { missingWholeCourseTraining: 50, missingGpa: 2 } };
  const before = JSON.stringify({ record, snapshot });
  assert.deepEqual(omitGraduationConduct(record), { cumulativeGpa4: 2.9, totalCredits: 150 });
  assert.deepEqual(graduationSnapshotWithoutConduct(snapshot), { rules: [{ code: "TOTAL_CREDITS", requiredValue: "150" }], readiness: { missingGpa: 2 } });
  assert.deepEqual(graduationReasonsWithoutConduct([
    { code: "UNKNOWN_REQUIREMENT", message: "Chưa có kết quả rèn luyện toàn khóa" },
    { code: "UNKNOWN_REQUIREMENT", message: "Cần xác minh học phần" },
  ]), [{ code: "UNKNOWN_REQUIREMENT", message: "Cần xác minh học phần" }]);
  assert.equal(JSON.stringify({ record, snapshot }), before);
});

test("historical status filtering and counts honor class scope after removing conduct", async context => {
  replace(context, GraduationEvaluationsService, "getStatusOverrides", async () => [
    { id: "a", evaluationId: "e", studentId: "s", classId: "C1", storedStatus: "MANUAL_REVIEW", finalStatus: "PENDING_GRADE", needsManualReview: false },
    { id: "b", evaluationId: "e", studentId: "outside", classId: "C2", storedStatus: "MANUAL_REVIEW", finalStatus: "PENDING_GRADE", needsManualReview: false },
  ]);
  replace(context, prisma.graduationEvaluationStudent, "findMany", async ({ where, select }: { where: Record<string, unknown>; select?: unknown }) => {
    if (select) { assert.deepEqual(where.AND, [{ OR: [{ id: { in: ["a"] } }, { finalStatus: "PENDING_GRADE", id: { notIn: ["a"] } }] }]); return [{ id: "a", sStudentId: "S", sStudentName: "Student" }]; }
    return [{ id: "a", sStudentId: "S", finalStatus: "MANUAL_REVIEW", needsManualReview: true, wholeCourseTrainingScore: null, trainingStatus: "NOT_AVAILABLE", reasons: [{ code: "UNKNOWN_REQUIREMENT", message: "Rèn luyện" }] }];
  });
  replace(context, prisma.graduationEvaluationStudent, "groupBy", async ({ by }: { by: string[] }) => by.includes("finalStatus")
    ? [{ finalStatus: "MANUAL_REVIEW", _count: { _all: 1 } }]
    : [{ classId: "C1", sClassName: "Class", _count: { _all: 1 } }]);
  const result = await GraduationEvaluationsService.listStudents("e", { status: "PENDING_GRADE" }, 1, 20, ["C1"]);
  assert.equal(result.total, 1);
  assert.equal(result.statusCounts.all, 1);
  assert.equal(result.statusCounts.PENDING_GRADE, 1);
  assert.equal(result.statusCounts.MANUAL_REVIEW, 0);
  assert.equal(result.items[0].finalStatus, "PENDING_GRADE");
  assert.equal(result.items[0].needsManualReview, false);
  assert.equal("wholeCourseTrainingScore" in result.items[0], false);
  assert.deepEqual(result.items[0].reasons, []);
});
