import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/auth/jwt";
import type { Actor } from "../lib/auth/types";
import { ApiError } from "../lib/utils/api-error";
import { InterventionCasesService } from "../lib/services/intervention-cases";
import { AcademicWarningAutomationService } from "../lib/services/academic-warning-automation";
import { AcademicWarningEvidenceService } from "../lib/services/academic-warning-evidence";
import { ReportsService } from "../lib/services/reports";
import { GET as getWarningReport } from "../app/api/v1/reports/academic-warnings/route";
import { GET as listInterventions } from "../app/api/v1/academic-warnings/interventions/route";
import { GET as summarizeInterventions } from "../app/api/v1/academic-warnings/interventions/summary/route";
import { GET as getIntervention } from "../app/api/v1/academic-warnings/interventions/[caseId]/route";
import { GET as getInterventionEvidence } from "../app/api/v1/academic-warnings/interventions/[caseId]/evidence/route";
import { PATCH as patchInterventionStatus } from "../app/api/v1/academic-warnings/interventions/[caseId]/status/route";
import { POST as postInterventionActivity } from "../app/api/v1/academic-warnings/interventions/[caseId]/activities/route";
import { PATCH as patchInterventionFollowUp } from "../app/api/v1/academic-warnings/interventions/[caseId]/follow-up/route";
import { PATCH as patchInterventionAssignment } from "../app/api/v1/academic-warnings/interventions/[caseId]/assignment/route";
import { POST as postWarningTermRetry } from "../app/api/v1/academic-warnings/terms/[termId]/retry/route";
import { POST as postWarningReconcile } from "../app/api/v1/academic-warnings/reconcile/route";
import { hasInvalidUuidSegment, requiredPermission } from "../proxy";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const ADVISOR_ID = "22222222-2222-4222-8222-222222222222";

function mockMethod<T extends object>(target: T, key: keyof T, replacement: unknown) {
  const record = target as Record<string | symbol, unknown>;
  const original = record[key as string | symbol];
  record[key as string | symbol] = replacement;
  return () => { record[key as string | symbol] = original; };
}

async function requestFor(actor: Actor, url: string, init?: { method?: string; body?: BodyInit; headers?: HeadersInit }) {
  const signed = await signAccessToken(actor.userId, actor.username, actor);
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: `sms_access_token=${signed.token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

function installActor(actor: Actor) {
  return mockMethod(prisma, "$queryRaw", async () => actor.grants.map((grant) => ({
    id: actor.userId,
    username: actor.username,
    full_name: actor.fullName,
    role_code: grant.role,
    data_scope: grant.scope,
    permission_code: grant.permission,
  })));
}

test("intervention route permission matrix is narrow and validates case UUID segments", () => {
  assert.equal(requiredPermission("/api/v1/academic-warnings/interventions", "GET"), "academic_warning.read");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}`, "GET"), "academic_warning.read");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}/evidence`, "GET"), "academic_warning.read");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}/activities`, "POST"), "academic_warning.action.create");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}/status`, "PATCH"), "academic_warning.action.update");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}/follow-up`, "PATCH"), "academic_warning.action.update");
  assert.equal(requiredPermission(`/api/v1/academic-warnings/interventions/${CASE_ID}/assignment`, "PATCH"), "academic_warning.case.assign");
  assert.equal(hasInvalidUuidSegment("/api/v1/academic-warnings/interventions/not-a-uuid"), true);
  assert.equal(hasInvalidUuidSegment("/api/v1/academic-warnings/interventions/summary"), false);
  assert.equal(requiredPermission(`/api/v1/academic-warnings/terms/${CASE_ID}/retry`, "POST"), "academic_warning.calculate");
  assert.equal(requiredPermission("/api/v1/academic-warnings/reconcile", "POST"), "academic_warning.calculate");
});

test("faculty warning reconciliation automatically uses the faculty data scope", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "warning-reconcile-secret-32-characters";
  const actor: Actor = {
    userId: ADVISOR_ID,
    username: "faculty.reconcile",
    fullName: "Faculty Reconciliation Manager",
    grants: [{ role: "faculty_manager", scope: "faculty", permission: "academic_warning.calculate" }],
  };
  let received: { actorId: string; facultyCode?: string | null } | null = null;
  const cleanups: Array<() => void> = [
    installActor(actor),
    mockMethod(AcademicWarningAutomationService, "actorFacultyCode", async () => "CT"),
    mockMethod(AcademicWarningAutomationService, "reconcilePastTermsWithGrades", async (input: { actorId: string; facultyCode?: string | null }) => {
      received = input;
      return { eligibleTermCount: 8, processedTermCount: 8, completedScopeCount: 12, skippedScopeCount: 4, failedScopeCount: 0, results: [] };
    }),
  ];
  try {
    const response = await postWarningReconcile(await requestFor(
      actor,
      "http://backend:3001/api/v1/academic-warnings/reconcile",
      { method: "POST" },
    ));
    assert.equal(response.status, 200);
    assert.deepEqual(received, { actorId: ADVISOR_ID, facultyCode: "CT" });
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("faculty warning action can explicitly finalize a main term or safely retry it", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "warning-term-action-secret-32-characters";
  const actor: Actor = {
    userId: ADVISOR_ID,
    username: "faculty.warning",
    fullName: "Faculty Warning Manager",
    grants: [{ role: "faculty_manager", scope: "faculty", permission: "academic_warning.calculate" }],
  };
  const calls: string[] = [];
  const cleanups: Array<() => void> = [
    installActor(actor),
    mockMethod(AcademicWarningAutomationService, "actorFacultyCode", async () => "CT"),
    mockMethod(AcademicWarningAutomationService, "finalizeGradesAndRun", async (input: { facultyCode?: string | null }) => {
      calls.push(`finalize:${input.facultyCode}`);
      return { evaluation: { scopeCount: 7, completed: 7, skipped: 0, failed: 0 } };
    }),
    mockMethod(AcademicWarningAutomationService, "runForFinalizedMainTerm", async (input: { facultyCode?: string | null }) => {
      calls.push(`retry:${input.facultyCode}`);
      return { scopeCount: 7, completed: 0, skipped: 7, failed: 0 };
    }),
  ];
  try {
    const params = { params: Promise.resolve({ termId: CASE_ID }) };
    const finalizeResponse = await postWarningTermRetry(await requestFor(
      actor,
      `http://backend:3001/api/v1/academic-warnings/terms/${CASE_ID}/retry`,
      { method: "POST", body: JSON.stringify({ confirmGradesFinalized: true }) },
    ), params);
    const retryResponse = await postWarningTermRetry(await requestFor(
      actor,
      `http://backend:3001/api/v1/academic-warnings/terms/${CASE_ID}/retry`,
      { method: "POST", body: JSON.stringify({ confirmGradesFinalized: false }) },
    ), params);
    assert.equal(finalizeResponse.status, 200);
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(calls, ["finalize:CT", "retry:CT"]);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("work queue list and summary require academic_warning.read and pass scoped filters to service", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "intervention-api-list-secret-32-characters";
  const actor: Actor = {
    userId: ADVISOR_ID,
    username: "advisor.api",
    fullName: "Advisor API",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.read" }],
  };
  const cleanups: Array<() => void> = [installActor(actor)];
  let captured: any;
  try {
    cleanups.push(mockMethod(InterventionCasesService, "list", async (filters: any, receivedActor: Actor) => {
      captured = { filters, receivedActor };
      return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize, totalPages: 0 };
    }));
    cleanups.push(mockMethod(InterventionCasesService, "summary", async () => ({ open: 0, total: 0 })));
    const response = await listInterventions(await requestFor(
      actor,
      "http://backend:3001/api/v1/academic-warnings/interventions?status=OPEN&businessStatus=HIGH_RISK&overdue=true&search=SV001&page=2&pageSize=10",
    ));
    assert.equal(response.status, 200);
    assert.deepEqual(captured.filters, {
      status: "OPEN",
      businessStatus: "HIGH_RISK",
      classId: undefined,
      academicTermId: undefined,
      overdue: true,
      search: "SV001",
      page: 2,
      pageSize: 10,
    });
    assert.equal(captured.receivedActor.userId, actor.userId);
    assert.equal((await summarizeInterventions(await requestFor(actor, "http://backend:3001/api/v1/academic-warnings/interventions/summary"))).status, 200);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("report coverage and intervention summary validate filters and retain warning permission", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "warning-counts-api-secret-32-characters";
  const actor: Actor = { userId: ADVISOR_ID, username: "admin", fullName: "Admin", grants: [{ role: "admin", scope: "system", permission: "academic_warning.read" }] };
  const reports: Array<Record<string, unknown>> = [];
  const summaries: Array<Record<string, unknown>> = [];
  const cleanups = [
    installActor(actor),
    mockMethod(prisma.academicTerm, "findFirst", async ({ where }: { where: { id: string } }) => where.id === CASE_ID ? { id: CASE_ID } : null),
    mockMethod(ReportsService, "academicWarningStudents", async (filters: Record<string, unknown>) => { reports.push(filters); return { items: [], total: 0 }; }),
    mockMethod(InterventionCasesService, "summary", async (_actor: Actor, filters: Record<string, unknown>) => { summaries.push(filters); return { total: 0 }; }),
  ];
  try {
    assert.equal((await getWarningReport(await requestFor(actor, `http://backend/api/v1/reports/academic-warnings?assessmentStatus=unassessed&academicTermId=${CASE_ID}`))).status, 200);
    assert.equal(reports[0].assessmentStatus, "unassessed");
    assert.equal(reports[0].academicTermId, CASE_ID);
    assert.equal((await getWarningReport(await requestFor(actor, "http://backend/api/v1/reports/academic-warnings?assessmentStatus=anything"))).status, 400);
    assert.equal(reports.length, 1);
    assert.equal((await summarizeInterventions(await requestFor(actor, "http://backend/api/v1/academic-warnings/interventions/summary?academicTermId=invalid"))).status, 400);
    assert.equal((await summarizeInterventions(await requestFor(actor, `http://backend/api/v1/academic-warnings/interventions/summary?academicTermId=${ADVISOR_ID}`))).status, 400);
    assert.equal((await summarizeInterventions(await requestFor(actor, `http://backend/api/v1/academic-warnings/interventions/summary?academicTermId=${CASE_ID}`))).status, 200);
    assert.deepEqual(summaries, [{ academicTermId: CASE_ID }]);
    actor.grants = [{ role: "class_advisor", scope: "assigned_classes", permission: "student.read" }];
    assert.equal((await getWarningReport(await requestFor(actor, "http://backend/api/v1/reports/academic-warnings?assessmentStatus=unassessed"))).status, 403);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("student.read alone cannot access intervention list or sensitive detail", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "intervention-api-denied-secret-32-characters";
  const actor: Actor = {
    userId: ADVISOR_ID,
    username: "student.reader",
    fullName: "Student Reader",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "student.read" }],
  };
  const cleanup = installActor(actor);
  try {
    const listResponse = await listInterventions(await requestFor(actor, "http://backend:3001/api/v1/academic-warnings/interventions"));
    const detailResponse = await getIntervention(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}`),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    assert.equal(listResponse.status, 403);
    assert.equal(detailResponse.status, 403);
    const evidenceResponse = await getInterventionEvidence(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/evidence`),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    assert.equal(evidenceResponse.status, 403);
  } finally {
    cleanup();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("evidence validates the pinned result id and forwards it without caching the response", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "warning-evidence-api-pinned-secret";
  const actor: Actor = { userId: ADVISOR_ID, username: "advisor.read", fullName: "Advisor", grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.read" }] };
  const calls: Array<[string, string, string | null | undefined]> = [];
  const cleanups = [installActor(actor), mockMethod(AcademicWarningEvidenceService, "getForCase", async (caseId: string, currentActor: Actor, resultId?: string | null) => { calls.push([caseId, currentActor.userId, resultId]); return { context: { resultId } }; })];
  try {
    const invalid = await getInterventionEvidence(await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/evidence?resultId=invalid`), { params: Promise.resolve({ caseId: CASE_ID }) });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 0);
    const valid = await getInterventionEvidence(await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/evidence?resultId=${ADVISOR_ID}`), { params: Promise.resolve({ caseId: CASE_ID }) });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(calls, [[CASE_ID, ADVISOR_ID, ADVISOR_ID]]);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("detail, status, activity, and follow-up routes delegate to guarded core services", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "intervention-api-mutation-secret";
  const actor: Actor = {
    userId: ADVISOR_ID,
    username: "advisor.mutate",
    fullName: "Advisor Mutate",
    grants: [
      { role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.read" },
      { role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.action.create" },
      { role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.action.update" },
    ],
  };
  const cleanups: Array<() => void> = [installActor(actor)];
  const calls: string[] = [];
  try {
    cleanups.push(mockMethod(InterventionCasesService, "getDetail", async () => ({ case: { caseId: CASE_ID }, history: [], activities: [] })));
    cleanups.push(mockMethod(InterventionCasesService, "transitionStatus", async (_id: string, status: string) => {
      calls.push(`status:${status}`);
      return { id: CASE_ID, status, resolvedAt: null, updatedAt: new Date() };
    }));
    cleanups.push(mockMethod(InterventionCasesService, "recordIntervention", async (_id: string, data: any) => {
      calls.push(`activity:${data.interventionType}`);
      return { id: CASE_ID, status: "IN_PROGRESS", nextFollowUpAt: null, updatedAt: new Date() };
    }));
    cleanups.push(mockMethod(InterventionCasesService, "setFollowUp", async (_id: string, value: string | null) => {
      calls.push(`follow-up:${value}`);
      return { id: CASE_ID, nextFollowUpAt: value ? new Date(value) : null, updatedAt: new Date() };
    }));
    assert.equal((await getIntervention(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}`),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    )).status, 200);
    assert.equal((await patchInterventionStatus(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    )).status, 200);
    assert.equal((await postInterventionActivity(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/activities`, {
        method: "POST",
        body: JSON.stringify({ interventionType: "REMINDER", occurredAt: "2026-09-01T00:00:00Z", content: "Reminder" }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    )).status, 201);
    assert.equal((await patchInterventionFollowUp(
      await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/follow-up`, {
        method: "PATCH",
        body: JSON.stringify({ nextFollowUpAt: "2026-10-01T00:00:00Z" }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    )).status, 200);
    assert.deepEqual(calls, ["status:IN_PROGRESS", "activity:REMINDER", "follow-up:2026-10-01T00:00:00Z"]);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("activity API accepts missing or empty notes and validates required time and optional text", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "optional-intervention-note-secret";
  const actor: Actor = { userId: ADVISOR_ID, username: "advisor.note", fullName: "Advisor", grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.action.create" }] };
  const calls: any[] = [];
  const cleanups = [installActor(actor), mockMethod(InterventionCasesService, "recordIntervention", async (_id: string, data: any) => { calls.push(data); return { id: CASE_ID, status: "IN_PROGRESS", nextFollowUpAt: null, updatedAt: new Date() }; })];
  const base = { interventionType: "CONTACT", occurredAt: "2026-10-09T01:12:00Z" };
  const post = async (body: unknown) => postInterventionActivity(await requestFor(actor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/activities`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ caseId: CASE_ID }) });
  try {
    for (const body of [base, { ...base, note: null }, { ...base, note: "" }, { ...base, note: "Ghi chú\nHai dòng" }]) assert.equal((await post(body)).status, 201);
    assert.equal(calls.length, 4);
    assert.equal(calls[3].note, "Ghi chú\nHai dòng");
    assert.ok(calls.every(data => data.content === undefined && data.result === undefined && data.nextFollowUpAt === undefined));
    for (const body of [{ ...base, occurredAt: undefined }, { ...base, interventionType: undefined }, { ...base, note: 1 }, { ...base, content: {} }]) assert.equal((await post(body)).status, 400);
    assert.equal(calls.length, 4);
  } finally { cleanups.reverse().forEach(cleanup => cleanup()); if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; }
});

test("invalid transitions preserve 409 and assignment requires the dedicated permission", async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "intervention-api-assignment-secret";
  const facultyActor: Actor = {
    userId: "33333333-3333-4333-8333-333333333333",
    username: "faculty.assign",
    fullName: "Faculty Assign",
    grants: [{ role: "faculty_manager", scope: "faculty", permission: "academic_warning.case.assign" }],
  };
  const advisorActor: Actor = {
    userId: ADVISOR_ID,
    username: "advisor.noassign",
    fullName: "Advisor No Assign",
    grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "academic_warning.action.update" }],
  };
  const cleanups: Array<() => void> = [];
  try {
    cleanups.push(installActor(advisorActor));
    cleanups.push(mockMethod(InterventionCasesService, "transitionStatus", async () => {
      throw new ApiError("Invalid transition", "INVALID_STATUS_TRANSITION", 409);
    }));
    const invalid = await patchInterventionStatus(
      await requestFor(advisorActor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "RESOLVED" }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    assert.equal(invalid.status, 409);

    cleanups.pop()?.();
    cleanups.push(installActor(facultyActor));
    cleanups.push(mockMethod(InterventionCasesService, "assign", async () => ({ id: CASE_ID, assignedUserId: ADVISOR_ID, updatedAt: new Date() })));
    const assigned = await patchInterventionAssignment(
      await requestFor(facultyActor, `http://backend:3001/api/v1/academic-warnings/interventions/${CASE_ID}/assignment`, {
        method: "PATCH",
        body: JSON.stringify({ assignedUserId: ADVISOR_ID }),
      }),
      { params: Promise.resolve({ caseId: CASE_ID }) },
    );
    assert.equal(assigned.status, 200);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
