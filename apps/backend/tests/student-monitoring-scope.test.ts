import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { StudentsService } from "../lib/services/students";
import { StudentTrainingProgressService } from "../lib/services/student-training-progress";
import { GraduationEvaluationsService } from "../lib/services/graduation-evaluations";
import { TrainingProgressService } from "../lib/services/training-progress";
import { AcademicWarningsService } from "../lib/services/academic-warnings";

type TestWhere = { OR?: unknown[]; AND?: { sIsInClass?: boolean }[]; studentId?: { notIn: string[] } };
type TestQuery = { where: TestWhere };

function replace(target: object, method: string, implementation: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[method];
  record[method] = implementation;
  return () => { record[method] = original; };
}

test("progress summary updates immediately when a student leaves or rejoins, while the directory retains them", async () => {
  let departed = false;
  const evaluations: string[] = [];
  const students = [
    { id: "active", sStudentId: "active", sFullName: "Active" },
    { id: "departed", sStudentId: "departed", sFullName: "Departed" },
  ];
  const cleanup = [
    replace(prisma.student, "findMany", async ({ where }: TestQuery) => {
      if (where.OR && !where.AND) return departed ? [{ id: "departed" }] : [];
      const monitored = where.AND?.some((clause) => clause.sIsInClass === true);
      return students.filter(student => !monitored || !departed || student.id !== "departed");
    }),
    replace(prisma.student, "count", async () => 2),
    replace(prisma, "$queryRaw", async () => students.map(student => ({ id: student.id }))),
    replace(StudentTrainingProgressService, "getStudentTrainingProgress", async (id: string) => {
      evaluations.push(id);
      return { student: { id, studentCode: id, fullName: id }, curriculum: { programCode: "P" },
        scheduleProgress: { progressStatus: id === "active" ? "ON_TRACK" : "UNKNOWN", creditDifference: 0 } };
    }),
  ];
  try {
    const params = { search: "membership-cache-regression" };
    const before = await StudentTrainingProgressService.getDepartmentProgressOverview(params);
    assert.equal(before.kpi.totalStudents, 2);
    departed = true;
    const after = await StudentTrainingProgressService.getDepartmentProgressOverview(params);
    assert.equal(after.kpi.totalStudents, 1);
    assert.equal(after.kpi.unknownCount, 0);
    assert.deepEqual(after.items.map(row => row.id), ["active"]);
    const directory = await StudentsService.list();
    assert.deepEqual(directory.items.map(row => row.id), ["active", "departed"]);
    departed = false;
    const rejoined = await StudentTrainingProgressService.getDepartmentProgressOverview(params);
    assert.equal(rejoined.kpi.totalStudents, 2);
    assert.deepEqual(evaluations, ["active", "departed", "active"]);
  } finally { cleanup.reverse().forEach(restore => restore()); }
});

test("saved operational results exclude departed students before pagination and graduation statistics", async () => {
  const expectScope = ({ where }: TestQuery) => {
    assert.deepEqual(where.studentId, { notIn: ["departed"] });
  };
  let aggregateQueries = 0;
  const cleanup = [
    replace(prisma.student, "findMany", async () => [{ id: "departed" }]),
    ...[prisma.trainingProgressStudentResult, prisma.trainingProgressCompletionStudentResult,
      prisma.academicWarningStudentResult, prisma.graduationEvaluationStudent].flatMap(model => [
      replace(model, "count", async (query: TestQuery) => { expectScope(query); return 0; }),
      replace(model, "findMany", async (query: TestQuery) => { expectScope(query); return []; }),
    ]),
    replace(prisma.graduationEvaluationStudent, "groupBy", async (query: TestQuery) => {
      expectScope(query); aggregateQueries++; return [];
    }),
  ];
  try {
    assert.equal((await TrainingProgressService.listStudentResults("run")).total, 0);
    assert.equal((await TrainingProgressService.listCompletionStudents("run")).total, 0);
    assert.equal((await AcademicWarningsService.listStudentResults("run")).total, 0);
    const graduation = await GraduationEvaluationsService.listStudents("evaluation", {}, 1, 20);
    assert.equal(graduation.total, 0);
    assert.equal(graduation.statusCounts.all, 0);
    assert.equal(aggregateQueries, 2);
  } finally { cleanup.reverse().forEach(restore => restore()); }
});

test("global run counters reflect monitored students instead of stale saved totals", async () => {
  const cleanup = [
    replace(prisma.student, "findMany", async () => [{ id: "departed" }]),
    replace(prisma.trainingProgressStudentResult, "findMany", async ({ where }: TestQuery) => {
      assert.deepEqual(where.studentId, { notIn: ["departed"] });
      return [{ runId: "run", classId: "class", status: "pass" }];
    }),
    replace(prisma.academicWarningStudentResult, "findMany", async ({ where }: TestQuery) => {
      assert.deepEqual(where.studentId, { notIn: ["departed"] });
      return [{ runId: "run", classId: "class", maxSeverity: "medium", reasonCount: 1 }];
    }),
  ];
  try {
    const scopes = new Map([["run", null]]);
    const [registration] = await TrainingProgressService.scopeRegistrationRunItems(
      [{ id: "run", totalStudents: 2, passStudents: 1, failStudents: 1, dataErrorStudents: 0 }], scopes);
    assert.equal(registration.totalStudents, 1);
    assert.equal(registration.failStudents, 0);
    const [warning] = await AcademicWarningsService.scopeRunItems(
      [{ id: "run", totalStudents: 2, warningStudents: 2, mediumStudents: 1, highStudents: 1 }], scopes);
    assert.equal(warning.totalStudents, 1);
    assert.equal(warning.warningStudents, 1);
    assert.equal(warning.highStudents, 0);
  } finally { cleanup.reverse().forEach(restore => restore()); }
});

test("class and cohort warning counters use the same monitored result rows", async () => {
  const cleanup = [
    replace(prisma.student, "findMany", async () => [{ id: "departed" }]),
    replace(prisma.academicWarningGroupResult, "findMany", async () =>
      ["class", "cohort"].map(groupType => ({ groupType, groupId: groupType, totalStudents: 2,
        warningStudents: 2, mediumStudents: 1, highStudents: 1 }))),
    replace(prisma.academicWarningStudentResult, "findMany", async () =>
      [{ classId: "class", cohortId: "cohort", reasonCount: 1, maxSeverity: "medium" }]),
  ];
  try {
    const groups = await AcademicWarningsService.listGroupResults("run");
    assert.equal(groups.length, 2);
    for (const group of groups) {
      assert.equal(group.totalStudents, 1);
      assert.equal(group.warningStudents, 1);
      assert.equal(group.highStudents, 0);
    }
  } finally { cleanup.reverse().forEach(restore => restore()); }
});
