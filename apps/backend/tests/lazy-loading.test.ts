import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { StudentTrainingProgressService } from "../lib/services/student-training-progress";
import { GraduationEvaluationsService } from "../lib/services/graduation-evaluations";

function replace(target: object, method: string, implementation: unknown) {
  const record = target as Record<string, unknown>;
  const original = record[method];
  record[method] = implementation;
  return () => { record[method] = original; };
}

function progress(id: string) {
  return {
    student: { id, studentCode: id, fullName: id, classCode: "C1" },
    curriculum: { programCode: "P1" },
    scheduleProgress: { progressStatus: id === "S3" ? "BEHIND" : "ON_TRACK", creditDifference: id === "S3" ? -3 : 0 },
  };
}

test("lazy overview evaluates only the requested database page, preserving scope and total", async () => {
  const evaluated: string[] = [];
  const cleanup = [
    replace(prisma.student, "count", async ({ where }: { where: unknown }) => {
      assert.deepEqual(where, { AND: [{ deletedAt: null, sIsInClass: true }, { sClassStudentId: { in: ["C1"] } }], sStudyProgramId: "P1" });
      return 1000;
    }),
    replace(prisma.student, "findMany", async (query: { skip?: number; take?: number; orderBy: unknown }) => {
      assert.equal(query.skip, 2);
      assert.equal(query.take, 2);
      assert.deepEqual(query.orderBy, [{ sStudentId: "asc" }, { id: "asc" }]);
      return [{ id: "S3" }, { id: "S4" }];
    }),
    replace(StudentTrainingProgressService, "getStudentTrainingProgress", async (id: string) => {
      evaluated.push(id);
      return progress(id);
    }),
  ];
  try {
    const result = await StudentTrainingProgressService.getDepartmentProgressOverview({
      lazy: true, page: 2, pageSize: 2, studyProgramId: "P1", scopeWhere: { sClassStudentId: { in: ["C1"] } },
    });
    assert.deepEqual(evaluated, ["S3", "S4"]);
    assert.deepEqual(result.items.map((item) => item.id), ["S3", "S4"]);
    assert.deepEqual(result.pagination, { page: 2, pageSize: 2, total: 1000, totalPages: 500 });
    assert.equal(result.kpiComplete, false);
    assert.equal(result.allEvaluations, undefined);
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});

test("lazy overview clamps an out-of-range page and does no evaluations for an empty scope", async () => {
  let calls = 0;
  const cleanup = [
    replace(prisma.student, "count", async () => 0),
    replace(prisma.student, "findMany", async (query: { skip: number; take: number }) => {
      assert.equal(query.skip, 0);
      assert.equal(query.take, 20);
      return [];
    }),
    replace(StudentTrainingProgressService, "getStudentTrainingProgress", async () => { calls++; return null; }),
  ];
  try {
    const result = await StudentTrainingProgressService.getDepartmentProgressOverview({ lazy: true, page: 999, pageSize: 20 });
    assert.equal(calls, 0);
    assert.deepEqual(result.pagination, { page: 1, pageSize: 20, total: 0, totalPages: 1 });
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});

test("status filtering remains scope-wide and uses exact totals before pagination", async () => {
  const cleanup = [
    replace(prisma.student, "findMany", async (query: { take?: number }) => {
      assert.equal(query.take, undefined);
      return [{ id: "S1" }, { id: "S2" }, { id: "S3" }];
    }),
    replace(StudentTrainingProgressService, "getStudentTrainingProgress", async (id: string) => progress(id)),
  ];
  try {
    const result = await StudentTrainingProgressService.getDepartmentProgressOverview({
      lazy: true, page: 1, pageSize: 1, search: "status-regression-fixture", progressStatus: "BEHIND",
    });
    assert.deepEqual(result.items.map((item) => item.id), ["S3"]);
    assert.equal(result.pagination.total, 1);
    assert.equal(result.kpi.totalStudents, 3);
    assert.equal(result.kpi.onTrackCount, 2);
    assert.equal(result.kpi.behindCount, 1);
    assert.equal(result.kpi.avgDeficitCredits, 3);
    assert.equal(result.kpiComplete, true);
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});

test("graduation pagination aggregates full scoped counts while keeping class choices outside the active filter", async () => {
  const cleanup = [
    replace(prisma.graduationEvaluationStudent, "count", async (query: { where: Record<string, unknown> }) => {
      assert.equal(query.where.classId, "C1");
      assert.equal(query.where.finalStatus, "NOT_ELIGIBLE");
      return 42;
    }),
    replace(prisma.graduationEvaluationStudent, "findMany", async (query: { skip: number; take: number; omit: unknown }) => {
      assert.equal(query.skip, 20);
      assert.equal(query.take, 20);
      assert.deepEqual(query.omit, { gradeSnapshot: true });
      return [];
    }),
    replace(prisma.graduationEvaluationStudent, "groupBy", async (query: { by: string[]; where: Record<string, unknown> }) => {
      assert.equal(query.where.evaluationId, "E1");
      assert.equal(query.where.finalStatus, undefined);
      assert.equal(query.where.OR, undefined);
      if (query.by.includes("finalStatus")) {
        assert.equal(query.where.classId, "C1");
        return [{ finalStatus: "NOT_ELIGIBLE", _count: { _all: 42 } }, { finalStatus: "EXPECTED_ELIGIBLE", _count: { _all: 18 } }];
      }
      assert.deepEqual(query.where.classId, { in: ["C1", "C2"] });
      return [{ classId: "C1", sClassName: "Lớp 1", _count: { _all: 60 } }, { classId: "C2", sClassName: "Lớp 2", _count: { _all: 30 } }];
    }),
  ];
  try {
    const result = await GraduationEvaluationsService.listStudents("E1", { classId: "C1", status: "NOT_ELIGIBLE", keyword: "test" }, 2, 20, ["C1", "C2"]);
    assert.equal(result.total, 42);
    assert.equal(result.statusCounts.all, 60);
    assert.equal(result.statusCounts.NOT_ELIGIBLE, 42);
    assert.equal(result.classes.length, 2);
    assert.equal(result.classes[1].count, 30);
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});

test("graduation counts cannot expose a class outside the actor scope", async () => {
  const cleanup = [
    replace(prisma.graduationEvaluationStudent, "count", async ({ where }: { where: Record<string, unknown> }) => { assert.deepEqual(where.classId, { in: [] }); return 0; }),
    replace(prisma.graduationEvaluationStudent, "findMany", async () => []),
    replace(prisma.graduationEvaluationStudent, "groupBy", async ({ by, where }: { by: string[]; where: Record<string, unknown> }) => {
      assert.deepEqual(where.classId, { in: by.includes("finalStatus") ? [] : ["C1"] });
      return [];
    }),
  ];
  try {
    const result = await GraduationEvaluationsService.listStudents("E1", { classId: "C2" }, 1, 20, ["C1"]);
    assert.equal(result.total, 0);
    assert.equal(result.statusCounts.all, 0);
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});

test("a failed lazy-page evaluation is surfaced instead of returning a silently incomplete page", async () => {
  const cleanup = [
    replace(prisma.student, "count", async () => 1),
    replace(prisma.student, "findMany", async () => [{ id: "broken" }]),
    replace(StudentTrainingProgressService, "getStudentTrainingProgress", async () => { throw new Error("evaluation unavailable"); }),
  ];
  try {
    await assert.rejects(
      StudentTrainingProgressService.getDepartmentProgressOverview({ lazy: true, page: 1, pageSize: 20 }),
      /evaluation unavailable/,
    );
  } finally { cleanup.reverse().forEach((restore) => restore()); }
});
