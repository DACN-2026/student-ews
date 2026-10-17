import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/auth/jwt";
import type { Actor } from "../lib/auth/types";
import { proxy, hasInvalidUuidSegment } from "../proxy";
import { GET as coursesGet, POST as coursesPost } from "../app/api/v1/courses/route";
import { GET as profileGet } from "../app/api/v1/students/[id]/route";
import { GET as evaluationsGet } from "../app/api/v1/graduation-evaluations/route";
import { StudentsService } from "../lib/services/students";
import { TrainingProgramsService } from "../lib/services/training-programs";
import { GradesService } from "../lib/services/grades";
import { FeePoliciesService } from "../lib/services/fee-policies";

process.env.JWT_SECRET ||= "system-integrity-test-secret-at-least-32-characters";
function mockMethod(context: TestContext, target: object, key: string, replacement: (...args: never[]) => unknown) {
  const record = target as Record<string, unknown>;
  const original = record[key];
  const mocked = context.mock.fn(replacement);
  record[key] = mocked;
  context.after(() => { record[key] = original; });
  return mocked;
}
const id = "11111111-1111-4111-8111-111111111111";
const termId = "22222222-2222-4222-8222-222222222222";
const classId = "33333333-3333-4333-8333-333333333333";
const actor: Actor = { userId: id, username: "test", fullName: "Test", grants: [{ role: "staff", scope: "all_students", permission: "student.read" }] };
function actorRows(current: Actor) { return current.grants.map(grant => ({ id, username: current.username, full_name: current.fullName, role_code: grant.role, data_scope: grant.scope, permission_code: grant.permission })); }
async function request(path: string, current = actor, method = "GET", body?: unknown) {
  const { token } = await signAccessToken(id, current.username, current);
  return new NextRequest(`http://localhost/api/v1/${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test("catalog handlers reject absent/locked identities and use changed grants immediately", async context => {
  let currentRows = actorRows(actor);
  mockMethod(context, prisma, "$queryRaw", async () => currentRows);
  const list = mockMethod(context, TrainingProgramsService, "listCourses", async () => ({ items: [], total: 0 }));
  const create = mockMethod(context, TrainingProgramsService, "createCourse", async () => ({ id: "new", courseCode: "C", courseName: "Course" }));
  const oldAdmin = { ...actor, grants: [{ role: "admin", scope: "system", permission: "*" }] };
  const staleRequest = await request("courses", oldAdmin, "POST", { courseCode: "C", courseName: "Course" });
  assert.equal((await coursesPost(staleRequest)).status, 403);
  assert.equal(create.mock.callCount(), 0);
  currentRows = [];
  assert.equal((await coursesGet(await request("courses", oldAdmin))).status, 401);
  assert.equal(list.mock.callCount(), 0);
  currentRows = actorRows({ ...actor, grants: [{ role: "staff", scope: "faculty", permission: "academic_term.manage" }] });
  const newlyAllowed = await request("courses", actor, "POST", { courseCode: "C", courseName: "Course" });
  assert.equal((await proxy(newlyAllowed)).headers.get("x-middleware-next"), "1", "stale JWT cannot veto newly granted permission");
  assert.equal((await coursesPost(newlyAllowed)).status, 201);
  assert.equal(create.mock.callCount(), 1);
});

test("student.read cannot retrieve GPA through the profile endpoint", async context => {
  mockMethod(context, prisma, "$queryRaw", async () => actorRows(actor));
  mockMethod(context, prisma.student, "findFirst", async () => ({ id }));
  mockMethod(context, StudentsService, "getById", async () => ({ id, fullName: "Test", cumulative: { cumulativeGpa4: 2.5 }, termSummaries: [{ gpa4: 2 }] }) as never);
  const response = await profileGet(await request(`students/${id}`), { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.fullName, "Test");
  assert.equal("cumulative" in data, false);
  assert.equal("termSummaries" in data, false);
});

test("advisor evaluation counts are restricted to the same assigned classes as details", async context => {
  const advisor: Actor = { ...actor, grants: [{ role: "class_advisor", scope: "assigned_classes", permission: "graduation.read" }] };
  mockMethod(context, prisma, "$queryRaw", async () => actorRows(advisor));
  mockMethod(context, prisma.classAdvisorAssignment, "findMany", async () => [{ classId, academicTermId: termId }]);
  mockMethod(context, prisma.class, "findMany", async () => [{ id: classId, cohortId: id }]);
  mockMethod(context, prisma.student, "findMany", async () => []);
  mockMethod(context, prisma.graduationEvaluation, "count", async () => 1);
  mockMethod(context, prisma.graduationEvaluation, "findMany", async () => [{ id, cohortId: id, trainingProgramId: id, assessmentAcademicTermId: termId, totalStudents: 20, sourceSnapshot: { readiness: { studentCount: 20 }, rules: [] } }]);
  mockMethod(context, prisma.graduationEvaluationStudent, "groupBy", async (args: { where: { OR: { evaluationId: string; classId?: { in: string[] } }[] } }) => {
    const scoped = args.where.OR[0].classId?.in.includes(classId);
    return [{ evaluationId: id, finalStatus: "NOT_ELIGIBLE", _count: { _all: scoped ? 7 : 20 } }];
  });
  mockMethod(context, prisma.cohort, "findMany", async () => []);
  mockMethod(context, prisma.trainingProgram, "findMany", async () => []);
  mockMethod(context, prisma.academicTerm, "findMany", async () => []);
  mockMethod(context, prisma.academicYear, "findMany", async () => []);
  const response = await evaluationsGet(await request("graduation-evaluations", advisor));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items[0].totalStudents, 7);
  assert.equal(data.items[0].notEligibleStudents, 7);
  assert.equal("readiness" in data.items[0].sourceSnapshot, false);
});

test("preview endpoints are not mistaken for malformed UUIDs", () => {
  assert.equal(hasInvalidUuidSegment("/api/v1/graduation-evaluations/preview"), false);
  assert.equal(hasInvalidUuidSegment("/api/v1/training-progress/completion-runs/preview"), false);
  assert.equal(hasInvalidUuidSegment("/api/v1/graduation-evaluations/not-an-id"), true);
});

test("term-grade queries preserve the failed attempt even after a later passing attempt", async context => {
  mockMethod(context, prisma.student, "findFirst", async () => ({ id }));
  mockMethod(context, prisma.studentCourseOffering, "findMany", async () => [
    { id: "old", studentId: id, sStudentId: "SV", academicTermId: "t1", academicYearId: "y1", sCurriculumId: "C1", sCourseName: "Course", sCredits: 3 },
    { id: "new", studentId: id, sStudentId: "SV", academicTermId: "t2", academicYearId: "y2", sCurriculumId: "C1", sCourseName: "Course", sCredits: 3 },
  ]);
  mockMethod(context, prisma.studentCourseGrade, "findMany", async () => [
    { offeringId: "old", isPass: false, score10: 2, score4: 0, letterCode: "F" },
    { offeringId: "new", isPass: true, score10: 6, score4: 2, letterCode: "C" },
  ]);
  mockMethod(context, prisma.academicTerm, "findMany", async () => [
    { id: "t1", academicYearId: "y1", sTermCode: "HK01", sTermOrder: 1, sIsSummer: false },
    { id: "t2", academicYearId: "y2", sTermCode: "HK01", sTermOrder: 1, sIsSummer: false },
  ]);
  mockMethod(context, prisma.academicYear, "findMany", async () => [{ id: "y1", sYearCode: "2022-2023" }, { id: "y2", sYearCode: "2023-2024" }]);
  mockMethod(context, prisma, "$queryRaw", async () => [{ s_curriculum_id: "C1" }]);
  const period = await GradesService.list(id, { academicYear: "2022-2023", termCode: "HK01" });
  assert.equal(period.length, 1); assert.equal(period[0].id, "old"); assert.equal(period[0].letterGrade, "F");
  assert.equal((await GradesService.list(id, { view: "attempts" })).length, 2);
  assert.equal((await GradesService.list(id))[0].id, "new", "default accumulated view remains compatible");
});

test("creating and editing Vietnamese name parts keeps fullName consistent", async context => {
  let row: Record<string, unknown> = {};
  mockMethod(context, prisma.student, "create", async (args: { data: Record<string, unknown> }) => { row = { id, ...args.data }; return row; });
  mockMethod(context, prisma.student, "findFirst", async () => row);
  mockMethod(context, prisma.student, "update", async (args: { data: Record<string, unknown> }) => { row = { ...row, ...args.data }; return row; });
  assert.equal((await StudentsService.create({ studentId: "SV", firstName: "Nguyễn Văn", lastName: "An", birthDate: "2003-01-01" })).fullName, "Nguyễn Văn An");
  assert.equal((await StudentsService.update(id, { lastName: "Bình" })).fullName, "Nguyễn Văn Bình");
  await assert.rejects(StudentsService.create({ studentId: "SV", firstName: "Họ", lastName: "Tên", birthDate: "2003-02-31" }), /Ngày sinh/);
});

test("student imports preview without writes, preserve omitted fields and never resurrect deleted profiles", async context => {
  const row = { id, sStudentId: "SV", sClassStudentId: "L1", sStudyProgramId: "P1", sPermanentResidence: "Địa chỉ cũ", sGender: "Nữ", sIsInClass: false, deletedAt: null };
  mockMethod(context, prisma.student, "findMany", async () => [row, { id: classId, sStudentId: "ARCHIVED", deletedAt: new Date() }]);
  let writes = 0;
  mockMethod(context, prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback({ student: {
    createMany: async () => { writes++; },
    update: async ({ data }: { data: Record<string, unknown> }) => { writes++; Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return row; },
  } }));
  const items = ["SV", "ARCHIVED"].map(studentId => ({ studentId, firstName: "Nguyễn Văn", lastName: "An", birthDate: "2003-01-01" }));
  const preview = await StudentsService.importBatch(items, {}, true);
  assert.equal(writes, 0); assert.equal(preview.updated, 1); assert.equal(preview.errors.length, 1);
  const imported = await StudentsService.importBatch(items);
  assert.equal(writes, 1); assert.equal(imported.imported, 1);
  assert.equal(row.sClassStudentId, "L1"); assert.equal(row.sStudyProgramId, "P1"); assert.equal(row.sPermanentResidence, "Địa chỉ cũ"); assert.equal(row.sIsInClass, false);
});

test("fee policies use the real catalog name, accept zero and reject invalid types/rates without writes", async context => {
  mockMethod(context, prisma.feePolicyType, "findFirst", async (args: { where: { feeObjectDicId: string } }) => args.where.feeObjectDicId === "TN" ? { feeObjectDicId: "TN", feeObjectDicName: "Đối tượng TN" } : null);
  mockMethod(context, prisma.student, "findFirst", async () => ({ id, sStudentId: "SV" }));
  mockMethod(context, prisma.academicTerm, "findFirst", async () => ({ id: termId, academicYearId: id, sTermCode: "HK01" }));
  mockMethod(context, prisma.academicYear, "findUnique", async () => ({ sYearCode: "2026-2027" }));
  let saved: Record<string, unknown> = {};
  const create = mockMethod(context, prisma.studentFeePolicy, "create", async ({ data }: { data: Record<string, unknown> }) => { saved = { id, ...data }; return saved; });
  mockMethod(context, prisma.studentFeePolicy, "findUnique", async () => saved);
  const policy = await FeePoliciesService.create(id, { feeObjectDicId: "TN", coefficient: 0, feeObjectName: "Untrusted name", decisionNumber: "QD1" });
  assert.equal(policy!.policyName, "Đối tượng TN"); assert.equal(policy!.coefficientPercent, 0);
  await assert.rejects(FeePoliciesService.create(id, { feeObjectDicId: "UNKNOWN", coefficient: 0.5, decisionNumber: "QD1" }), /Đối tượng/);
  await assert.rejects(FeePoliciesService.create(id, { feeObjectDicId: "TN", reductionPercent: 101, decisionNumber: "QD1" }), /Tỷ lệ/);
  assert.equal(create.mock.callCount(), 1);
});
