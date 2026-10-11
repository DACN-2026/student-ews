import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { prisma } from "../lib/prisma";
import type { Actor } from "../lib/auth/types";
import { ApiError } from "../lib/utils/api-error";
import { assertWarningActionTransition, WarningActionsService } from "../lib/services/warning-actions";
import {
  createInterventionEpisodeKey,
  EARLY_WARNING_CASE_TYPE,
  InterventionCasesService,
  isInterventionCaseOverdue,
  isInterventionTriggerStatus,
} from "../lib/services/intervention-cases";
import { loadWarningActionHistory } from "../lib/services/warning-action-history";
import { SUPERSEDED_EARLY_WARNING_CASE_TYPE } from "../lib/services/warning-case-types";

const IDS = {
  term: "11111111-1111-4111-8111-111111111111",
  classA: "22222222-2222-4222-8222-222222222222",
  classB: "33333333-3333-4333-8333-333333333333",
  advisor: "44444444-4444-4444-8444-444444444444",
  studentA: "55555555-5555-4555-8555-555555555555",
  studentB: "66666666-6666-4666-8666-666666666666",
};

type MemoryState = ReturnType<typeof createMemoryState>;

function createMemoryState() {
  return {
    runs: new Map<string, any>(),
    results: [] as any[],
    cases: [] as any[],
    events: [] as any[],
    assignments: [] as any[],
    users: [] as any[],
    classes: [
      { id: IDS.classA, classId: "CLASS-A", className: "Class A", deletedAt: null },
      { id: IDS.classB, classId: "CLASS-B", className: "Class B", deletedAt: null },
    ] as any[],
    programs: [] as any[],
    lecturers: [] as any[],
    roles: [{ id: "advisor-role", code: "class_advisor" }] as any[],
    userRoles: [] as any[],
    reasons: [] as any[],
    terms: [
      { id: IDS.term, sTermCode: "HK02", academicYearId: "year", sTermOrder: 2, sIsSummer: false },
      { id: "previous-term", sTermCode: "HK01", academicYearId: "year", sTermOrder: 1, sIsSummer: false },
    ] as any[],
    nextCaseId: 0,
  };
}

function mockMethod<T extends object>(target: T, key: keyof T, replacement: unknown) {
  const record = target as Record<string | symbol, unknown>;
  const original = record[key as string | symbol];
  record[key as string | symbol] = replacement;
  return () => { record[key as string | symbol] = original; };
}

function matchesCase(row: any, where: any) {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (typeof where.studentId === "string" && row.studentId !== where.studentId) return false;
  if (where.studentId?.in && !where.studentId.in.includes(row.studentId)) return false;
  if (where.studentId?.notIn && where.studentId.notIn.includes(row.studentId)) return false;
  if (where.caseType !== undefined && row.caseType !== where.caseType) return false;
  if (where.latestWarningRunId !== undefined && row.latestWarningRunId !== where.latestWarningRunId) return false;
  if (where.resolvedAt?.gte && !(row.resolvedAt && row.resolvedAt >= where.resolvedAt.gte)) return false;
  if (typeof where.status === "string" && row.status !== where.status) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.status?.not && row.status === where.status.not) return false;
  if (typeof where.latestBusinessStatus === "string" && row.latestBusinessStatus !== where.latestBusinessStatus) return false;
  if (where.latestBusinessStatus?.in && !where.latestBusinessStatus.in.includes(row.latestBusinessStatus)) return false;
  if (typeof where.assignedUserId === "string" && row.assignedUserId !== where.assignedUserId) return false;
  if (where.assignedUserId === null && row.assignedUserId !== null) return false;
  if (where.assignedUserId?.not === null && row.assignedUserId === null) return false;
  if (where.updatedAt instanceof Date && row.updatedAt?.getTime() !== where.updatedAt.getTime()) return false;
  if (where.nextFollowUpAt?.lt && !(row.nextFollowUpAt && row.nextFollowUpAt < where.nextFollowUpAt.lt)) return false;
  if (where.nextFollowUpAt?.gte && !(row.nextFollowUpAt && row.nextFollowUpAt >= where.nextFollowUpAt.gte)) return false;
  if (where.OR && !where.OR.some((branch: any) => matchesCase(row, branch))) return false;
  return true;
}

function installMemoryDatabase(state: MemoryState) {
  const cleanups: Array<() => void> = [];
  const warningAction = {
    findMany: async ({ where }: any) => state.cases.filter((row) => matchesCase(row, where)),
    findFirst: async ({ where }: any) => state.cases.find((row) => matchesCase(row, where)) ?? null,
    findUnique: async ({ where }: any) => state.cases.find((row) =>
      where.id !== undefined ? row.id === where.id : row.episodeKey === where.episodeKey,
    ) ?? null,
    findUniqueOrThrow: async ({ where }: any) => {
      const row = state.cases.find((item) => item.id === where.id);
      if (!row) throw new Error("case not found");
      return row;
    },
    create: async ({ data }: any) => {
      const row = {
        id: `case-${++state.nextCaseId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      state.cases.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = state.cases.find((item) => item.id === where.id);
      if (!row) throw new Error("case not found");
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const rows = state.cases.filter((row) => matchesCase(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
  };
  const warningActionEvent = {
    findMany: async ({ where }: any) => state.events.filter((row) => typeof where.warningActionId === "string"
      ? row.warningActionId === where.warningActionId : where.warningActionId.in.includes(row.warningActionId))
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)),
    createMany: async ({ data, skipDuplicates }: any) => {
      for (const candidate of data) {
        if (skipDuplicates && candidate.idempotencyKey && state.events.some((event) => event.idempotencyKey === candidate.idempotencyKey)) continue;
        state.events.push({ createdAt: new Date(), ...candidate });
      }
      return { count: data.length };
    },
    create: async ({ data }: any) => {
      const row = { id: `event-${state.events.length + 1}`, createdAt: new Date(), ...data };
      state.events.push(row);
      return row;
    },
  };
  const classAdvisorAssignment = {
    findFirst: async ({ where }: any) => state.assignments.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    ) ?? null,
    findMany: async ({ where }: any) => state.assignments.filter((row) =>
      (!where.userId || row.userId === where.userId) &&
      (!where.status || row.status === where.status) &&
      (where.revokedAt !== null || row.revokedAt === null),
    ),
  };
  const academicWarningRun = {
    findUnique: async ({ where }: any) => state.runs.get(where.id) ?? null,
    findMany: async ({ where }: any) => [...state.runs.values()].filter(row => !where.id?.in || where.id.in.includes(row.id)),
  };
  const tx = { warningAction, warningActionEvent, classAdvisorAssignment, academicWarningRun };

  // This fixture contains only monitored students; do not read membership from the live DB.
  cleanups.push(mockMethod(prisma.student, "findMany", async () => []));
  cleanups.push(mockMethod(prisma.student, "findFirst", async ({ where }: { where: { id: string } }) => ({ id: where.id, sIsInClass: true, leftClassEffectiveAt: null })));
  cleanups.push(mockMethod(prisma.academicWarningRun, "findUnique", async ({ where }: any) => state.runs.get(where.id) ?? null));
  cleanups.push(mockMethod(prisma.academicWarningRun, "findMany", async ({ where }: any) =>
    [...state.runs.values()].filter((row) => !where.id?.in || where.id.in.includes(row.id)),
  ));
  cleanups.push(mockMethod(prisma.academicWarningStudentResult, "findMany", async ({ where }: any) =>
    state.results.filter((row) => (!where.runId || (where.runId.in ? where.runId.in.includes(row.runId) : row.runId === where.runId)) && (
      !where.id?.in || where.id.in.includes(row.id)
    ) && (
      !where.businessStatus?.in || where.businessStatus.in.includes(row.businessStatus)
    ) && (
      !where.businessStatus?.notIn || !where.businessStatus.notIn.includes(row.businessStatus)
    ) && (
      (!where.studentId?.in || where.studentId.in.includes(row.studentId)) && (!where.studentId?.notIn || !where.studentId.notIn.includes(row.studentId))
    )),
  ));
  cleanups.push(mockMethod(prisma.academicWarningStudentResult, "findUnique", async ({ where }: any) =>
    state.results.find((row) => row.id === where.id) ?? null,
  ));
  cleanups.push(mockMethod(prisma.warningAction, "findUnique", warningAction.findUnique));
  cleanups.push(mockMethod(prisma.warningAction, "findUniqueOrThrow", warningAction.findUniqueOrThrow));
  cleanups.push(mockMethod(prisma.warningAction, "findMany", async ({ where }: any) =>
    state.cases.filter((row) => matchesCase(row, where)),
  ));
  cleanups.push(mockMethod(prisma.classAdvisorAssignment, "findFirst", classAdvisorAssignment.findFirst));
  cleanups.push(mockMethod(prisma.classAdvisorAssignment, "findMany", classAdvisorAssignment.findMany));
  cleanups.push(mockMethod(prisma.class, "findMany", async ({ where }: any) =>
    state.classes.filter((row) => (!where.id?.in || where.id.in.includes(row.id)) && row.deletedAt === null),
  ));
  cleanups.push(mockMethod(prisma.user, "findMany", async ({ where }: any) =>
    state.users.filter((row) => !where.id?.in || where.id.in.includes(row.id)),
  ));
  cleanups.push(mockMethod(prisma.academicTerm, "findMany", async () => state.terms));
  cleanups.push(mockMethod(prisma.academicYear, "findMany", async () => [{ id: "year", sYearCode: "2025-2026" }]));
  cleanups.push(mockMethod(prisma.user, "findFirst", async ({ where }: any) =>
    state.users.find((row) => row.id === where.id && row.isActive === where.isActive && row.deletedAt === where.deletedAt) ?? null,
  ));
  cleanups.push(mockMethod(prisma.lecturerProfile, "findUnique", async ({ where }: any) =>
    state.lecturers.find((row) => row.userId === where.userId) ?? null,
  ));
  cleanups.push(mockMethod(prisma.trainingProgram, "findMany", async ({ where }: any) =>
    state.programs.filter((row) => row.s_faculty_code === where.s_faculty_code && row.deletedAt === null && row.isActive),
  ));
  cleanups.push(mockMethod(prisma.warningActionEvent, "findMany", warningActionEvent.findMany));
  cleanups.push(mockMethod(prisma.academicWarningReason, "findMany", async ({ where }: any) =>
    state.reasons.filter((row) => row.studentResultId === where.studentResultId),
  ));
  cleanups.push(mockMethod(prisma.role, "findUnique", async ({ where }: any) =>
    state.roles.find((row) => row.code === where.code) ?? null,
  ));
  cleanups.push(mockMethod(prisma.userRole, "findUnique", async ({ where }: any) =>
    state.userRoles.find((row) => row.userId === where.userId_roleId.userId && row.roleId === where.userId_roleId.roleId) ?? null,
  ));
  cleanups.push(mockMethod(prisma, "$transaction", async (callback: any) => callback(tx)));
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}

function addRun(
  state: MemoryState,
  runId: string,
  statuses: Array<{ studentId: string; classId?: string | null; status: string; code?: string; name?: string }>,
  trainingProgramId = "program-a",
) {
  const completedAt = new Date(`2026-09-${String(state.runs.size + 1).padStart(2, "0")}T08:00:00.000Z`);
  state.runs.set(runId, {
    id: runId,
    status: "completed",
    runMode: "OFFICIAL",
    assessmentAcademicTermId: IDS.term,
    trainingProgramId,
    completedAt,
  });
  statuses.forEach((item, index) => state.results.push({
    id: `${runId}-result-${index}`,
    runId,
    studentId: item.studentId,
    classId: item.classId ?? IDS.classA,
    sStudentId: item.code || `SV-${index + 1}`,
    sStudentName: item.name || `Student ${index + 1}`,
    sClassName: item.classId === IDS.classB ? "Class B" : "Class A",
    sProgramCode: trainingProgramId,
    businessStatus: item.status,
    regulatoryCoverage: "PARTIAL",
    ruleResults: [],
  }));
}

test("a scoped correction synchronizes selected students and preserves deferred students' cases and events", async () => {
  const state = createMemoryState();
  addRun(state, "before-correction", [
    { studentId: IDS.studentA, status: "HIGH_RISK" }, { studentId: IDS.studentB, status: "HIGH_RISK" },
  ]);
  const cleanup = installMemoryDatabase(state);
  try {
    await InterventionCasesService.syncInterventionCasesForRun("before-correction");
    const deferred = structuredClone(state.cases.find(row => row.studentId === IDS.studentB));
    const history = structuredClone(state.events.filter(row => row.warningActionId === deferred.id));
    addRun(state, "after-correction", [
      { studentId: IDS.studentA, status: "HIGH_RISK" }, { studentId: IDS.studentB, status: "NORMAL" },
    ]);
    const synced = await InterventionCasesService.syncInterventionCasesForRun("after-correction", { studentIds: [IDS.studentA] });
    assert.equal(synced.processedResults, 1);
    assert.equal(state.cases.find(row => row.studentId === IDS.studentA).latestWarningRunId, "after-correction");
    assert.deepEqual(state.cases.find(row => row.studentId === IDS.studentB), deferred);
    assert.deepEqual(state.events.filter(row => row.warningActionId === deferred.id), history);
    assert.equal((await InterventionCasesService.syncInterventionCasesForRun("after-correction", { studentIds: [] })).processedResults, 0);
    const restoreExcluded = mockMethod(prisma.student, "findMany", async () => [{ id: IDS.studentB }]);
    try {
      assert.equal((await InterventionCasesService.syncInterventionCasesForRun("after-correction", { studentIds: [IDS.studentB] })).processedResults, 0);
      assert.deepEqual(state.cases.find(row => row.studentId === IDS.studentB), deferred);
    } finally { restoreExcluded(); }
  } finally { cleanup(); }
});

const adminActor: Actor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  fullName: "Admin",
  grants: [{ role: "admin", scope: "system", permission: "academic_warning.action.update" }],
};

test("departed students leave the operational queue but their intervention detail and history remain readable", async () => {
  const state = createMemoryState();
  const restoreDatabase = installMemoryDatabase(state);
  const cleanup: Array<() => void> = [];
  try {
    addRun(state, "historical-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("historical-risk");
    const caseId = state.cases[0].id;
    cleanup.push(mockMethod(prisma.student, "findMany", async () => [{ id: IDS.studentA }]));
    cleanup.push(mockMethod(prisma.student, "findFirst", async () => ({ sIsInClass: true, leftClassEffectiveAt: new Date("2026-03-19") })));
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20 }, adminActor)).total, 0);
    const detail = await InterventionCasesService.getDetail(caseId, adminActor);
    assert.equal(detail.case.readOnly, true);
    assert.ok(detail.history.length > 0);
    assert.equal(state.cases.length, 1);
  } finally { cleanup.reverse().forEach(restore => restore()); restoreDatabase(); }
});

test("yellow and red warning states create OPEN cases; non-warning states do not", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-trigger", [
      { studentId: "student-high", status: "HIGH_RISK" },
      { studentId: "student-verify", status: "VERIFY_REQUIRED" },
      { studentId: "student-monitor", status: "MONITORING" },
      { studentId: "student-normal", status: "NORMAL" },
      { studentId: "student-incomplete", status: "INSUFFICIENT_DATA" },
    ]);
    const summary = await InterventionCasesService.syncInterventionCasesForRun("run-trigger");
    assert.equal(summary.createdCases, 3);
    assert.deepEqual(state.cases.map((row) => [row.studentId, row.status]), [
      ["student-high", "OPEN"],
      ["student-verify", "OPEN"],
      ["student-monitor", "OPEN"],
    ]);
    assert.equal(isInterventionTriggerStatus("HIGH_RISK"), true);
    assert.equal(isInterventionTriggerStatus("MONITORING"), true);
    assert.equal(isInterventionTriggerStatus("NORMAL"), false);
  } finally {
    cleanup();
  }
});

test("temporary leave freezes support and overdue queues while preserving readable case history and class membership", async () => {
  const state = createMemoryState();
  const restoreDatabase = installMemoryDatabase(state);
  const cleanup: Array<() => void> = [];
  try {
    addRun(state, "before-leave-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("before-leave-risk");
    const caseId = state.cases[0].id;
    state.cases[0].nextFollowUpAt = new Date("2025-01-01");
    const before = structuredClone({ cases: state.cases, events: state.events });
    cleanup.push(mockMethod(prisma.student, "findMany", async () => [{ id: IDS.studentA }]));
    cleanup.push(mockMethod(prisma.student, "findFirst", async () => ({ sIsInClass: true, leftClassEffectiveAt: null, studySuspensions: [{ decisionId: "leave", decisionNumber: "332", fromYear: "2025-2026", fromTerm: 2, effectiveAt: new Date("2026-04-03"), returnEffectiveAt: null, fromCalendarActive: true, returnCalendarActive: false }] })));
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20, overdue: true }, adminActor)).total, 0);
    assert.equal((await InterventionCasesService.summary(adminActor)).total, 0);
    const detail = await InterventionCasesService.getDetail(caseId, adminActor);
    assert.equal(detail.case.readOnly, true); assert.ok(detail.history.length > 0);
    await assert.rejects(InterventionCasesService.recordIntervention(caseId, { interventionType: "CONTACT", occurredAt: new Date(), content: "New support" }, adminActor), (error: { code?: string }) => error.code === "STUDENT_STUDY_SUSPENDED");
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
  } finally { cleanup.reverse().forEach(restore => restore()); restoreDatabase(); }
});

test("case creation does not require a separate intervention-case assignment", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    state.assignments.push({
      id: "assignment-exact",
      userId: IDS.advisor,
      classId: IDS.classA,
      academicTermId: IDS.term,
      status: "active",
      revokedAt: null,
    });
    state.assignments.push({
      id: "assignment-other-term",
      userId: "wrong-advisor",
      classId: IDS.classB,
      academicTermId: "other-term",
      status: "active",
      revokedAt: null,
    });
    addRun(state, "run-assignment", [
      { studentId: IDS.studentA, classId: IDS.classA, status: "HIGH_RISK" },
      { studentId: IDS.studentB, classId: IDS.classB, status: "VERIFY_REQUIRED" },
    ]);
    await InterventionCasesService.syncInterventionCasesForRun("run-assignment");
    assert.equal(state.cases.find((row) => row.studentId === IDS.studentA)?.assignedUserId, null);
    assert.equal(state.cases.find((row) => row.studentId === IDS.studentB)?.assignedUserId, null);
    assert.equal(state.events.filter((event) => event.eventType === "ASSIGNED").length, 0);
  } finally {
    cleanup();
  }
});

test("repeated sync is idempotent and a later risk run reuses the active episode", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-one", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-one");
    const firstUpdatedAt = state.cases[0].updatedAt;
    await InterventionCasesService.syncInterventionCasesForRun("run-one");
    assert.equal(state.cases.length, 1);
    assert.equal(state.events.filter((event) => event.eventType === "WARNING_DETECTED").length, 1);
    assert.equal(state.cases[0].updatedAt, firstUpdatedAt);

    addRun(state, "run-two", [{ studentId: IDS.studentA, status: "VERIFY_REQUIRED" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-two");
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0].latestBusinessStatus, "VERIFY_REQUIRED");
    assert.equal(state.events.filter((event) => event.eventType === "WARNING_DETECTED").length, 2);
    assert.equal(state.events.filter((event) => event.eventType === "RISK_STATUS_CHANGED").length, 1);
  } finally {
    cleanup();
  }
});

test("a future risk after resolution creates a new stable episode", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-old", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-old");
    state.cases[0].status = "RESOLVED";
    state.cases[0].resolvedAt = new Date("2026-09-01T09:00:00.000Z");
    addRun(state, "run-new", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-new");
    assert.equal(state.cases.length, 2);
    assert.notEqual(state.cases[0].episodeKey, state.cases[1].episodeKey);
    assert.equal(state.cases[1].episodeKey, createInterventionEpisodeKey(IDS.studentA, "run-new"));
  } finally {
    cleanup();
  }
});

test("historical reconciliation preserves resolution after an episode consumed multiple runs", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-first", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    addRun(state, "run-next", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-first");
    await InterventionCasesService.syncInterventionCasesForRun("run-next");
    await InterventionCasesService.recordIntervention(state.cases[0].id, {
      interventionType: "CONTACT", occurredAt: "2026-09-02T10:00:00.000Z", content: "Followed up with student",
    }, adminActor);
    await InterventionCasesService.transitionStatus(state.cases[0].id, "RESOLVED", adminActor);
    const before = structuredClone({ cases: state.cases, events: state.events });
    // A third historical result had never created its own episode. Replaying
    // it after completion reproduced the duplicate OPEN case seen in the UI.
    addRun(state, "run-backfill", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    for (let pass = 0; pass < 2; pass++) {
      for (const id of ["run-first", "run-next", "run-backfill"]) {
        const result = await InterventionCasesService.syncInterventionCasesForRun(id);
        assert.equal(result.createdCases, 0);
        assert.equal(result.updatedCases, 0);
      }
    }
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
    const detail = await InterventionCasesService.getDetail(state.cases[0].id, adminActor);
    assert.equal(detail.case.interventionStatus, "RESOLVED");
    assert.equal(detail.activities.length, 1);
  } finally { cleanup(); }
});

test("old risk runs cannot regress an active episode or reopen a resolved episode with a legacy missing timestamp", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-first", [{ studentId: IDS.studentA, status: "MONITORING" }]);
    addRun(state, "run-latest", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-first");
    await InterventionCasesService.syncInterventionCasesForRun("run-latest");
    const before = structuredClone({ cases: state.cases, events: state.events });
    await InterventionCasesService.syncInterventionCasesForRun("run-first");
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
    state.cases[0].status = "RESOLVED";
    state.cases[0].resolvedAt = null;
    const result = await InterventionCasesService.syncInterventionCasesForRun("run-latest");
    assert.equal(result.createdCases, 0);
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0].status, "RESOLVED");
  } finally { cleanup(); }
});

test("state machine accepts required paths and rejects arbitrary status jumps", () => {
  assert.doesNotThrow(() => assertWarningActionTransition("OPEN", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertWarningActionTransition("IN_PROGRESS", "RESOLVED"));
  assert.doesNotThrow(() => assertWarningActionTransition("RESOLVED", "REOPENED"));
  assert.doesNotThrow(() => assertWarningActionTransition("REOPENED", "RESOLVED"));
  assert.throws(
    () => assertWarningActionTransition("OPEN", "RESOLVED"),
    (error: unknown) => error instanceof ApiError && error.code === "INVALID_STATUS_TRANSITION",
  );
  assert.throws(() => assertWarningActionTransition("ESCALATED", "RESOLVED"), /Cannot transition/);
});

test("a recomputed earlier semester cannot replace the active episode's later-semester result", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "current-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("current-risk");
    const before = structuredClone({ cases: state.cases, events: state.events });
    for (const status of ["MONITORING", "NORMAL"]) {
      const id = `historical-recomputed-${status}`;
      addRun(state, id, [{ studentId: IDS.studentA, status }]);
      state.runs.get(id).assessmentAcademicTermId = "previous-term";
      const summary = await InterventionCasesService.syncInterventionCasesForRun(id);
      assert.equal(summary.updatedCases, 0);
      assert.deepEqual({ cases: state.cases, events: state.events }, before);
    }
  } finally { cleanup(); }
});

test("a later semester repairs a stale link even when its run completed before the historical recomputation", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "current-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    addRun(state, "recomputed-old-risk", [{ studentId: IDS.studentA, status: "MONITORING" }]);
    state.runs.get("recomputed-old-risk").assessmentAcademicTermId = "previous-term";
    await InterventionCasesService.syncInterventionCasesForRun("recomputed-old-risk");
    const caseId = state.cases[0].id;
    const result = await InterventionCasesService.syncInterventionCasesForRun("current-risk");
    assert.equal(result.updatedCases, 1);
    assert.equal(state.cases.length, 1);
    assert.equal(state.cases[0].id, caseId);
    assert.equal(state.cases[0].latestWarningRunId, "current-risk");
    assert.equal(state.cases[0].latestBusinessStatus, "HIGH_RISK");
    const before = structuredClone({ cases: state.cases, events: state.events });
    await InterventionCasesService.syncInterventionCasesForRun("recomputed-old-risk");
    await InterventionCasesService.syncInterventionCasesForRun("current-risk");
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
  } finally { cleanup(); }
});

test("a newly recomputed older semester cannot create another episode after a later semester was resolved", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "resolved-current-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("resolved-current-risk");
    state.cases[0].status = "RESOLVED";
    state.cases[0].resolvedAt = new Date("2026-09-01T09:00:00Z");
    const before = structuredClone({ cases: state.cases, events: state.events });
    addRun(state, "backfilled-older-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    state.runs.get("backfilled-older-risk").assessmentAcademicTermId = "previous-term";
    const summary = await InterventionCasesService.syncInterventionCasesForRun("backfilled-older-risk");
    assert.equal(summary.createdCases, 0);
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
  } finally { cleanup(); }
});

test("within one semester an older risk run cannot overwrite a newer normal result", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "older-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("older-risk");
    addRun(state, "newer-normal", [{ studentId: IDS.studentA, status: "NORMAL" }]);
    await InterventionCasesService.syncInterventionCasesForRun("newer-normal");
    const before = structuredClone({ cases: state.cases, events: state.events });
    await InterventionCasesService.syncInterventionCasesForRun("older-risk");
    assert.deepEqual({ cases: state.cases, events: state.events }, before);
    assert.equal(state.cases[0].latestBusinessStatus, "NORMAL");
  } finally { cleanup(); }
});

test("first intervention starts work, appends immutable history, and schedules follow-up", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-activity", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-activity");
    const originalEvents = state.events.map((event) => structuredClone(event));
    const caseId = state.cases[0].id;
    await InterventionCasesService.recordIntervention(caseId, {
      interventionType: "DIRECT_COUNSELING",
      occurredAt: "2026-09-10T03:00:00.000Z",
      content: "Discussed a recovery plan",
      result: "Student agreed",
      nextFollowUpAt: "2026-09-20T03:00:00.000Z",
    }, adminActor);
    assert.equal(state.cases[0].status, "IN_PROGRESS");
    assert.equal(state.cases[0].nextFollowUpAt.toISOString(), "2026-09-20T03:00:00.000Z");
    assert.deepEqual(state.events.slice(0, originalEvents.length), originalEvents);
    assert.deepEqual(state.events.slice(originalEvents.length).map((event) => event.eventType), [
      "STATUS_CHANGED",
      "INTERVENTION_RECORDED",
      "FOLLOW_UP_SCHEDULED",
    ]);
    await InterventionCasesService.transitionStatus(caseId, "RESOLVED", adminActor);
    assert.equal(state.cases[0].status, "RESOLVED");
    assert.ok(state.cases[0].resolvedAt instanceof Date);
    await InterventionCasesService.transitionStatus(caseId, "REOPENED", adminActor);
    assert.equal(state.cases[0].status, "REOPENED");
    assert.equal(state.cases[0].resolvedAt, null);
    assert.equal(state.events.filter((event) => event.eventType === "CASE_RESOLVED").length, 1);
    assert.equal(state.events.filter((event) => event.eventType === "CASE_REOPENED").length, 1);
  } finally {
    cleanup();
  }
});

test("optional notes record an activity, start work and preserve the existing follow-up date", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-optional-note", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-optional-note");
    const caseId = state.cases[0].id;
    state.cases[0].nextFollowUpAt = new Date("2026-10-20T03:00:00Z");
    const occurredAt = "2026-10-09T01:12:00Z";
    for (const note of [undefined, null, "   ", "  Gặp sinh viên\nThống nhất học lại  "]) {
      await InterventionCasesService.recordIntervention(caseId, { interventionType: "DIRECT_COUNSELING", occurredAt, note }, adminActor);
    }
    assert.equal(state.cases[0].status, "IN_PROGRESS");
    assert.equal(state.cases[0].nextFollowUpAt.toISOString(), "2026-10-20T03:00:00.000Z");
    const detail = await InterventionCasesService.getDetail(caseId, adminActor);
    assert.equal(detail.activities.length, 4);
    assert.deepEqual(detail.activities.map(a => a.note), [null, null, null, "Gặp sinh viên\nThống nhất học lại"]);
    assert.ok(detail.activities.every(a => a.content === null && a.result === null && a.occurredAt === "2026-10-09T01:12:00.000Z"));
    assert.equal(state.events.filter(e => e.eventType === "STATUS_CHANGED").length, 1);
    assert.equal(state.events.filter(e => e.eventType === "FOLLOW_UP_SCHEDULED").length, 0);
  } finally { cleanup(); }
});

test("a persisted NORMAL result updates risk state but never resolves an active case", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "run-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-risk");
    state.cases[0].status = "IN_PROGRESS";
    addRun(state, "run-normal", [{ studentId: IDS.studentA, status: "NORMAL" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-normal");
    assert.equal(state.cases[0].status, "IN_PROGRESS");
    assert.equal(state.cases[0].resolvedAt, null);
    assert.equal(state.cases[0].latestBusinessStatus, "NORMAL");
    assert.equal(state.events.filter((event) => event.eventType === "RISK_STATUS_CHANGED").length, 1);
    const currentQueue = await InterventionCasesService.list({ page: 1, pageSize: 20 }, adminActor);
    assert.equal(currentQueue.total, 0);
    assert.equal(state.cases[0].status, "IN_PROGRESS");
  } finally {
    cleanup();
  }
});

test("creation history records the warning without creating an assignment event", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    state.assignments.push({
      id: "assignment-exact",
      userId: IDS.advisor,
      classId: IDS.classA,
      academicTermId: IDS.term,
      status: "active",
      revokedAt: null,
    });
    addRun(state, "run-history", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-history");
    assert.deepEqual(state.events.map((event) => event.eventType), ["CASE_CREATED", "WARNING_DETECTED"]);
    assert.equal(new Set(state.events.map((event) => event.idempotencyKey)).size, 2);
  } finally {
    cleanup();
  }
});

test("advisor mutation guard uses active class responsibility across warning terms without case assignment", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  const advisorActor: Actor = {
    userId: IDS.advisor,
    username: "advisor",
    fullName: "Advisor",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.update" }],
  };
  const facultyActor: Actor = {
    userId: "faculty-user",
    username: "faculty",
    fullName: "Faculty",
    grants: [{ role: "faculty_manager", scope: "faculty", permission: "academic_warning.update" }],
  };
  try {
    state.assignments.push({
      id: "assignment-exact",
      userId: IDS.advisor,
      classId: IDS.classA,
      academicTermId: "current-advisor-term",
      status: "active",
      revokedAt: null,
    });
    addRun(state, "run-scope", [{ studentId: IDS.studentA, classId: IDS.classA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-scope");
    assert.equal(state.cases[0].assignedUserId, null);
    state.cases[0].assignedUserId = "legacy-case-assignee";
    await InterventionCasesService.transitionStatus(state.cases[0].id, "IN_PROGRESS", advisorActor);
    assert.equal(state.cases[0].status, "IN_PROGRESS");
    await assert.rejects(
      InterventionCasesService.transitionStatus(state.cases[0].id, "ESCALATED", facultyActor),
      (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND" && error.status === 404,
    );
  } finally {
    cleanup();
  }
});

test("sync accepts only completed OFFICIAL runs and overdue remains a derived property", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    state.runs.set("draft-run", {
      id: "draft-run",
      status: "running",
      runMode: "OFFICIAL",
      assessmentAcademicTermId: IDS.term,
      completedAt: null,
    });
    await assert.rejects(
      InterventionCasesService.syncInterventionCasesForRun("draft-run"),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_WARNING_RUN",
    );
    assert.equal(isInterventionCaseOverdue({ status: "OPEN", nextFollowUpAt: new Date("2026-01-01") }, new Date("2026-02-01")), true);
    assert.equal(isInterventionCaseOverdue({ status: "RESOLVED", nextFollowUpAt: new Date("2026-01-01") }, new Date("2026-02-01")), false);
  } finally {
    cleanup();
  }
});

test("migration preserves legacy rows and enforces one active early-warning case at the database layer", () => {
  const migrationPath = path.join(
    process.cwd(),
    "prisma/migrations/20260928180000_core_intervention_workflow/migration.sql",
  );
  const sql = fs.readFileSync(migrationPath, "utf8");
  assert.match(sql, /CREATE UNIQUE INDEX "warning_actions_one_active_early_warning_case_idx"/);
  assert.match(sql, /WHERE "case_type" = 'EARLY_WARNING_CASE'/);
  assert.match(sql, /'OPEN', 'IN_PROGRESS', 'ESCALATED', 'REOPENED'/);
  assert.doesNotMatch(sql, /UPDATE\s+"warning_actions"/i);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+"warning_actions"/i);

  const serviceSource = fs.readFileSync(path.join(process.cwd(), "lib/services/intervention-cases.ts"), "utf8");
  assert.match(serviceSource, /academicWarningStudentResult\.findMany/);
  assert.doesNotMatch(serviceSource, /evaluateAcademicWarning|evaluateQd600/);

  const warningSource = fs.readFileSync(path.join(process.cwd(), "lib/services/academic-warnings.ts"), "utf8");
  const legacyRouteSource = fs.readFileSync(path.join(process.cwd(), "app/api/v1/academic-warnings/actions/route.ts"), "utf8");
  assert.match(warningSource, /caseType: \{ notIn: \[EARLY_WARNING_CASE_TYPE, SUPERSEDED_EARLY_WARNING_CASE_TYPE\] \}/);
  assert.match(legacyRouteSource, /caseType: \{ notIn: \[EARLY_WARNING_CASE_TYPE, SUPERSEDED_EARLY_WARNING_CASE_TYPE\] \}/);
});

test("legacy WarningAction mutation cannot bypass intervention history guards", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "legacy-bypass-run", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("legacy-bypass-run");
    await assert.rejects(
      WarningActionsService.update(state.cases[0].id, { note: "bypass" }, adminActor),
      (error: unknown) => error instanceof ApiError && error.code === "INTERVENTION_CASE_API_REQUIRED" && error.status === 409,
    );
    state.cases[0].caseType = SUPERSEDED_EARLY_WARNING_CASE_TYPE;
    await assert.rejects(
      WarningActionsService.update(state.cases[0].id, { status: "IN_PROGRESS" }, adminActor),
      (error: unknown) => error instanceof ApiError && error.code === "INTERVENTION_CASE_API_REQUIRED",
    );
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20 }, adminActor)).total, 0);
    assert.equal((await InterventionCasesService.summary(adminActor)).total, 0);
    assert.equal(state.events.length, 2);
  } finally {
    cleanup();
  }
});

test("work queue enforces advisor, faculty, and admin scopes before filtering and pagination", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  const advisorActor: Actor = {
    userId: IDS.advisor,
    username: "advisor",
    fullName: "Advisor",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.read" }],
  };
  const facultyActor: Actor = {
    userId: "faculty-user",
    username: "faculty",
    fullName: "Faculty",
    grants: [{ role: "faculty_manager", scope: "faculty", permission: "academic_warning.read" }],
  };
  try {
    state.users.push({ id: IDS.advisor, fullName: "Advisor A", isActive: true, deletedAt: null });
    state.assignments.push({
      id: "assignment-a",
      userId: IDS.advisor,
      classId: IDS.classA,
      academicTermId: "current-advisor-term",
      status: "active",
      revokedAt: null,
    });
    state.lecturers.push({ userId: facultyActor.userId, facultyCode: "FAC-A" });
    state.programs.push(
      { id: "program-a", s_faculty_code: "FAC-A", deletedAt: null, isActive: true },
      { id: "program-b", s_faculty_code: "FAC-B", deletedAt: null, isActive: true },
    );
    addRun(state, "queue-run-a", [{ studentId: IDS.studentA, classId: IDS.classA, status: "VERIFY_REQUIRED", code: "SV001", name: "Nguyen An" }], "program-a");
    addRun(state, "queue-run-b", [{ studentId: IDS.studentB, classId: IDS.classB, status: "HIGH_RISK", code: "SV002", name: "Tran Binh" }], "program-b");
    await InterventionCasesService.syncInterventionCasesForRun("queue-run-a");
    await InterventionCasesService.syncInterventionCasesForRun("queue-run-b");
    const caseB = state.cases.find((row) => row.studentId === IDS.studentB);
    caseB.nextFollowUpAt = new Date("2020-01-01");

    const base = { page: 1, pageSize: 20 };
    const advisorList = await InterventionCasesService.list(base, advisorActor);
    const facultyList = await InterventionCasesService.list(base, facultyActor);
    const adminList = await InterventionCasesService.list(base, adminActor);
    assert.deepEqual(advisorList.items.map((item) => item.student.studentCode), ["SV001"]);
    assert.deepEqual(facultyList.items.map((item) => item.student.studentCode), ["SV001"]);
    assert.equal(adminList.total, 2);
    assert.equal(adminList.items[0].latestBusinessStatus, "VERIFY_REQUIRED");

    assert.equal((await InterventionCasesService.list({ ...base, status: "OPEN" }, adminActor)).total, 2);
    assert.equal((await InterventionCasesService.list({ ...base, businessStatus: "HIGH_RISK" }, adminActor)).total, 1);
    assert.equal((await InterventionCasesService.list({ ...base, overdue: true }, adminActor)).items[0].student.studentCode, "SV002");
    assert.equal((await InterventionCasesService.list({ ...base, search: "nguyen an" }, adminActor)).items[0].student.studentCode, "SV001");
    assert.equal((await InterventionCasesService.list({ ...base, search: "SV002" }, adminActor)).total, 1);

    const summary = await InterventionCasesService.summary(facultyActor);
    assert.equal(summary.total, 1);
    assert.equal(summary.open, 1);
    assert.equal(summary.verifyRequired, 1);
    assert.equal(summary.byClass?.length, 1);
  } finally {
    cleanup();
  }
});

test("summary aligns with a selected term and separates students, cases, other terms, and unlinked history", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "current-term-risk", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    addRun(state, "previous-term-risk", [{ studentId: IDS.studentB, status: "MONITORING" }]);
    state.runs.get("previous-term-risk").assessmentAcademicTermId = "previous-term";
    await InterventionCasesService.syncInterventionCasesForRun("current-term-risk");
    await InterventionCasesService.syncInterventionCasesForRun("previous-term-risk");
    state.cases.push({ ...state.cases[0], id: "resolved-history", status: "RESOLVED", latestWarningResultId: "deleted-result", latestWarningRunId: "deleted-run" });
    const current = await InterventionCasesService.summary(adminActor, { academicTermId: IDS.term });
    assert.equal(current.total, 1);
    assert.equal(current.studentCount, 1);
    assert.equal(current.open, 1);
    assert.equal(current.resolved, 0);
    assert.deepEqual(current.allPeriods, { total: 3, studentCount: 2, otherPeriodCases: 1, otherPeriodStudents: 1, unlinkedCases: 1 });
    const global = await InterventionCasesService.summary(adminActor);
    assert.equal(global.total, 3);
    assert.equal(global.studentCount, 2);
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20, academicTermId: IDS.term }, adminActor)).total, current.total);
    const [a, b] = state.cases;
    a.status = "REOPENED";
    b.status = "ESCALATED";
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20, status: "ACTIVE_PROCESSING" }, adminActor)).total, 2);
    a.latestBusinessStatus = "VERIFY_REQUIRED";
    assert.equal((await InterventionCasesService.list({ page: 1, pageSize: 20, academicTermId: IDS.term, businessStatus: "HIGH_RISK_OR_VERIFY" }, adminActor)).total, 1);
  } finally { cleanup(); }
});

test("case detail is scope-safe, chronological, and exposes warning evidence without raw run snapshot", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  const outsideAdvisor: Actor = {
    userId: "outside-advisor",
    username: "outside",
    fullName: "Outside",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.read" }],
  };
  try {
    addRun(state, "detail-run", [{ studentId: IDS.studentA, status: "VERIFY_REQUIRED", code: "SV001", name: "Nguyen An" }]);
    await InterventionCasesService.syncInterventionCasesForRun("detail-run");
    const interventionCase = state.cases[0];
    const result = state.results[0];
    result.ruleResults = [{ ruleCode: "QD600_FAILED_CREDIT_RATIO", evaluationStatus: "NOT_EVALUATED" }];
    state.reasons.push({
      id: "reason-1",
      studentResultId: result.id,
      reasonCode: "QD600_FAILED_CREDIT_RATIO",
      severity: "high",
      title: "Failed-credit ratio",
      details: { observedValue: 0.6, thresholdValue: 0.5, isThresholdBreached: true, articleRef: "Điều 18" },
      sourceType: "REGULATORY",
    });
    state.events.push({
      id: "activity-event",
      warningActionId: interventionCase.id,
      eventType: "INTERVENTION_RECORDED",
      actorUserId: adminActor.userId,
      systemGenerated: false,
      sourceRunId: null,
      details: { interventionType: "REMINDER", occurredAt: "2026-09-02T00:00:00.000Z", content: "Reminder" },
      createdAt: new Date("2030-09-03"),
    });
    state.users.push({ id: adminActor.userId, fullName: "Admin", isActive: true, deletedAt: null });

    const detail = await InterventionCasesService.getDetail(interventionCase.id, adminActor);
    assert.equal(detail.case.student.studentCode, "SV001");
    assert.equal(detail.currentWarning?.reasons[0].observedValue, 0.6);
    assert.equal(detail.currentWarning?.reasons[0].articleReference, "Điều 18");
    assert.equal(detail.activities[0].content, "Reminder");
    assert.equal(detail.history.at(-1)?.eventType, "INTERVENTION_RECORDED");
    assert.deepEqual(detail.history, await loadWarningActionHistory([interventionCase.id]));
    assert.equal("sourceSnapshot" in detail, false);
    await assert.rejects(
      InterventionCasesService.getDetail(interventionCase.id, outsideAdvisor),
      (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND" && error.status === 404,
    );
  } finally {
    cleanup();
  }
});

test("shared profile history preserves each event's source evidence and excludes other cases", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "history-old", [{ studentId: IDS.studentA, status: "HIGH_RISK" }, { studentId: IDS.studentB, status: "MONITORING" }]);
    state.results[0].termGpa4 = 0.82;
    state.results[0].cumulativeGpa4 = 2;
    state.results[0].reasonCount = 1;
    await InterventionCasesService.syncInterventionCasesForRun("history-old");
    addRun(state, "history-new", [{ studentId: IDS.studentA, status: "NORMAL" }]);
    state.results.at(-1).termGpa4 = 3;
    state.results.at(-1).reasonCount = 0;
    await InterventionCasesService.syncInterventionCasesForRun("history-new");
    const caseId = state.cases.find(item => item.studentId === IDS.studentA)!.id;
    const before = JSON.stringify(state.events);
    const shared = await loadWarningActionHistory([caseId]);
    const detail = await InterventionCasesService.getDetail(caseId, adminActor);
    assert.deepEqual(shared, detail.history);
    assert.ok(shared.every(event => event.caseId === caseId));
    assert.equal(shared.find(event => event.eventType === "WARNING_DETECTED")?.warningContext?.result?.termGpa4, 0.82);
    assert.equal(shared.find(event => event.eventType === "RISK_STATUS_CHANGED")?.warningContext?.result?.termGpa4, 3);
    assert.deepEqual(await loadWarningActionHistory([]), []);
    assert.equal(JSON.stringify(state.events), before);
  } finally { cleanup(); }
});

test("follow-up changes are historical and resolution never rewrites warning risk", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  try {
    addRun(state, "follow-run", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("follow-run");
    const caseId = state.cases[0].id;
    await InterventionCasesService.setFollowUp(caseId, "2020-01-01T00:00:00.000Z", adminActor);
    assert.equal(isInterventionCaseOverdue(state.cases[0], new Date("2026-01-01")), true);
    await InterventionCasesService.transitionStatus(caseId, "IN_PROGRESS", adminActor);
    await InterventionCasesService.transitionStatus(caseId, "RESOLVED", adminActor);
    assert.equal(isInterventionCaseOverdue(state.cases[0], new Date("2026-01-01")), false);
    assert.equal(state.cases[0].latestBusinessStatus, "HIGH_RISK");
    await InterventionCasesService.setFollowUp(caseId, null, adminActor);
    const followEvents = state.events.filter((event) => event.eventType === "FOLLOW_UP_SCHEDULED");
    assert.equal(followEvents.length, 2);
    assert.equal(followEvents[1].details.cleared, true);
  } finally {
    cleanup();
  }
});

test("faculty assignment validates permission, advisor role, exact class-term, and appends reassignment", async () => {
  const state = createMemoryState();
  const cleanup = installMemoryDatabase(state);
  const facultyActor: Actor = {
    userId: "faculty-user",
    username: "faculty",
    fullName: "Faculty",
    grants: [
      { role: "faculty_manager", scope: "faculty", permission: "academic_warning.read" },
      { role: "faculty_manager", scope: "faculty", permission: "academic_warning.case.assign" },
    ],
  };
  const advisorB = "77777777-7777-4777-8777-777777777777";
  const nonAdvisor = "88888888-8888-4888-8888-888888888888";
  try {
    state.lecturers.push({ userId: facultyActor.userId, facultyCode: "FAC-A" });
    state.programs.push({ id: "program-a", s_faculty_code: "FAC-A", deletedAt: null, isActive: true });
    addRun(state, "assign-run", [{ studentId: IDS.studentA, classId: IDS.classA, status: "HIGH_RISK" }], "program-a");
    await InterventionCasesService.syncInterventionCasesForRun("assign-run");
    const caseId = state.cases[0].id;
    state.users.push(
      { id: IDS.advisor, fullName: "Advisor A", isActive: true, deletedAt: null },
      { id: advisorB, fullName: "Advisor B", isActive: true, deletedAt: null },
      { id: nonAdvisor, fullName: "Not Advisor", isActive: true, deletedAt: null },
    );
    state.userRoles.push({ userId: IDS.advisor, roleId: "advisor-role" });
    state.assignments.push({
      id: "assignment-a",
      userId: IDS.advisor,
      classId: IDS.classA,
      academicTermId: IDS.term,
      status: "active",
      revokedAt: null,
    });
    await InterventionCasesService.assign(caseId, IDS.advisor, facultyActor);
    assert.equal(state.cases[0].assignedUserId, IDS.advisor);
    assert.equal(state.events.at(-1)?.eventType, "ASSIGNED");

    await assert.rejects(
      InterventionCasesService.assign(caseId, nonAdvisor, facultyActor),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_ASSIGNEE",
    );
    state.userRoles.push({ userId: advisorB, roleId: "advisor-role" });
    state.assignments.push({
      id: "assignment-wrong",
      userId: advisorB,
      classId: IDS.classB,
      academicTermId: IDS.term,
      status: "active",
      revokedAt: null,
    });
    await assert.rejects(
      InterventionCasesService.assign(caseId, advisorB, facultyActor),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_ASSIGNEE",
    );
    state.assignments.at(-1).classId = IDS.classA;
    await InterventionCasesService.assign(caseId, advisorB, facultyActor);
    assert.equal(state.cases[0].assignedUserId, advisorB);
    assert.equal(state.events.at(-1)?.eventType, "REASSIGNED");
    assert.equal(state.events.at(-1)?.details.previousAssignedUserId, IDS.advisor);
  } finally {
    cleanup();
  }
});
