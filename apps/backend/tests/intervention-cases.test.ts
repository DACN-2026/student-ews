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
  if (where.studentId !== undefined && row.studentId !== where.studentId) return false;
  if (where.caseType !== undefined && row.caseType !== where.caseType) return false;
  if (typeof where.status === "string" && row.status !== where.status) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.status?.not && row.status === where.status.not) return false;
  if (where.latestBusinessStatus !== undefined && row.latestBusinessStatus !== where.latestBusinessStatus) return false;
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
    findMany: async ({ where }: any) => state.events.filter((row) => row.warningActionId === where.warningActionId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
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
  const tx = { warningAction, warningActionEvent, classAdvisorAssignment };

  cleanups.push(mockMethod(prisma.academicWarningRun, "findUnique", async ({ where }: any) => state.runs.get(where.id) ?? null));
  cleanups.push(mockMethod(prisma.academicWarningRun, "findMany", async ({ where }: any) =>
    [...state.runs.values()].filter((row) => !where.id?.in || where.id.in.includes(row.id)),
  ));
  cleanups.push(mockMethod(prisma.academicWarningStudentResult, "findMany", async ({ where }: any) =>
    state.results.filter((row) => (!where.runId || row.runId === where.runId) && (
      !where.id?.in || where.id.in.includes(row.id)
    ) && (
      !where.businessStatus?.in || where.businessStatus.in.includes(row.businessStatus)
    ) && (
      !where.businessStatus?.notIn || !where.businessStatus.notIn.includes(row.businessStatus)
    ) && (
      !where.studentId?.in || where.studentId.in.includes(row.studentId)
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

const adminActor: Actor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "admin",
  fullName: "Admin",
  grants: [{ role: "admin", scope: "system", permission: "academic_warning.action.update" }],
};

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
    state.cases[0].resolvedAt = new Date();
    addRun(state, "run-new", [{ studentId: IDS.studentA, status: "HIGH_RISK" }]);
    await InterventionCasesService.syncInterventionCasesForRun("run-new");
    assert.equal(state.cases.length, 2);
    assert.notEqual(state.cases[0].episodeKey, state.cases[1].episodeKey);
    assert.equal(state.cases[1].episodeKey, createInterventionEpisodeKey(IDS.studentA, "run-new"));
  } finally {
    cleanup();
  }
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
  assert.match(warningSource, /caseType: \{ not: EARLY_WARNING_CASE_TYPE \}/);
  assert.match(legacyRouteSource, /caseType: \{ not: "EARLY_WARNING_CASE" \}/);
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
    assert.equal("sourceSnapshot" in detail, false);
    await assert.rejects(
      InterventionCasesService.getDetail(interventionCase.id, outsideAdvisor),
      (error: unknown) => error instanceof ApiError && error.code === "NOT_FOUND" && error.status === 404,
    );
  } finally {
    cleanup();
  }
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
