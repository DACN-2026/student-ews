import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudySuspensions, type StandingDecision, type StandingTerm } from "../lib/services/academic-standing-rules";
import { studentSuspension, studentIsInClass, assertStudentSupportAllowed, monitoredStudentWhere, studentMonitoringSql } from "../lib/student-monitoring-scope";
import { syncStudentStudySuspensions } from "../lib/services/student-study-suspension";
import { prisma } from "../lib/prisma";

const now = new Date("2026-10-11T00:00:00Z");
const terms: StandingTerm[] = [
  { id: "before", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 1, isSummer: false, startDate: new Date("2025-09-01"), label: "HKI" },
  { id: "leave", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 2, isSummer: false, startDate: new Date("2026-02-01"), label: "HKII" },
  { id: "current", academicYearId: "y2", academicYearCode: "2026-2027", termOrder: 1, isSummer: false, startDate: new Date("2026-09-01"), label: "HKI" },
  { id: "future", academicYearId: "y2", academicYearCode: "2026-2027", termOrder: 2, isSummer: false, startDate: new Date("2027-02-01"), label: "HKII" },
];
const leave: StandingDecision = { id: "leave-decision", termId: "leave", number: "332/QĐ", signedAt: "2026-04-03", name: "Nghỉ học tạm thời", typeName: "Nghỉ học tạm thời", fullText: "Nghỉ học tạm thời (HKII 2025-2026 => HKI 2026-2027)" };
const returned: StandingDecision = { id: "return-decision", termId: "current", number: "947/QĐ", signedAt: "2026-07-23", name: "Tiếp nhận Nghỉ học tạm thời", typeName: "Tiếp nhận Nghỉ học tạm thời" };
function replace(target: object, key: string, value: unknown) { const record = target as Record<string, unknown>, old = record[key]; record[key] = value; return () => { record[key] = old; }; }

test("leave stays frozen after its stated end, retains class membership and preserves pre-leave eligibility", () => {
  const studySuspensions = resolveStudySuspensions([leave], terms, now);
  assert.equal(studySuspensions.length, 1);
  assert.equal(studySuspensions[0].returnYear, null);
  assert.equal(studentIsInClass({ sIsInClass: true }), true);
  assert.equal(studentSuspension({ studySuspensions }, { yearCode: "2025-2026", termOrder: 1 }), null);
  assert.ok(studentSuspension({ studySuspensions }, { yearCode: "2025-2026", termOrder: 2 }));
  assert.ok(studentSuspension({ studySuspensions }, { yearCode: "2028-2029", termOrder: 1 }));
  assert.ok(studentSuspension({ studySuspensions }, undefined, now));
  assert.ok(monitoredStudentWhere().studySuspensions);
  for (const period of [undefined, { yearCode: "2025-2026", termOrder: 2 }, "leave"]) assert.match(studentMonitoringSql(period).sql, /student_study_suspensions/);
});

test("return resumes only its effective semester; earlier leave semesters remain frozen", () => {
  const studySuspensions = resolveStudySuspensions([leave, returned], terms, now);
  assert.ok(studentSuspension({ studySuspensions }, { yearCode: "2025-2026", termOrder: 2 }));
  assert.equal(studentSuspension({ studySuspensions }, { yearCode: "2026-2027", termOrder: 1 }), null);
  assert.equal(studentSuspension({ studySuspensions }, undefined, now), null);
  const future = resolveStudySuspensions([leave, { ...returned, termId: "future" }], terms, now);
  assert.ok(studentSuspension({ studySuspensions: future }, undefined, now));
  assert.equal(studentSuspension({ studySuspensions: future }, undefined, new Date("2027-02-02")), null);
});

test("a revoked or unsigned return does not thaw the profile; revoked and unsigned leave does not freeze it", () => {
  for (const invalid of [{ ...returned, fullText: "[Xóa quyết định 947]" }, { ...returned, number: "" }, { ...returned, signedAt: "2099-01-01" }]) {
    assert.ok(studentSuspension({ studySuspensions: resolveStudySuspensions([leave, invalid], terms, now) }, undefined, now));
  }
  for (const invalid of [{ ...leave, fullText: "[Xóa quyết định 332]" }, { ...leave, signedAt: null }, { ...leave, name: "Tiếp nhận Chuyển trường", typeName: "Chuyển trường" }]) assert.equal(resolveStudySuspensions([invalid], terms, now).length, 0);
});

test("repeated leave intervals survive until return and a later leave freezes a new episode", () => {
  const nextLeave = { ...leave, id: "second-leave", termId: "future", fullText: "Nghỉ học tạm thời (HKII 2026-2027)", signedAt: "2026-10-01" };
  const studySuspensions = resolveStudySuspensions([leave, returned, nextLeave], terms, now);
  assert.equal(studySuspensions.length, 2);
  assert.equal(studentSuspension({ studySuspensions }, undefined, now), null);
  assert.equal(studentSuspension({ studySuspensions }, { yearCode: "2026-2027", termOrder: 2 })?.decisionId, "second-leave");
});

test("support writes are rejected during leave without marking the student as departed", async () => {
  const restore = replace(prisma.student, "findFirst", async () => ({ sIsInClass: true, leftClassEffectiveAt: null, studySuspensions: resolveStudySuspensions([leave], terms, now) }));
  try { await assert.rejects(assertStudentSupportAllowed("student"), (error: { code?: string }) => error.code === "STUDENT_STUDY_SUSPENDED"); }
  finally { restore(); }
});

test("projection sync is idempotent, audits changes, resumes after return and preserves a revoked interval", async () => {
  type IntervalRow = ReturnType<typeof resolveStudySuspensions>[number] & { id: string; studentId: string; isRevoked: boolean; fromCalendarActive: boolean; returnCalendarActive: boolean };
  const rows: IntervalRow[] = [];
  let source: StandingDecision[] = [leave], audits = 0, writes = 0, currentTermId = "current";
  const tx = {
    $executeRaw: async () => 0,
    student: { findMany: async () => [{ id: "student", sStudentId: "SV" }] },
    studentDecision: { findMany: async () => source.map(row => ({ id: row.id, studentId: "student", academicTermId: row.termId, sDecisionNumber: row.number, sSignDate: new Date(row.signedAt!), sDecisionName: row.name, decisionTypeId: row.id === leave.id ? 1 : 2, sFullText: row.fullText, sourcePayload: {} })) },
    decisionType: { findMany: async () => [{ decisionTypeId: 1, decisionName: leave.typeName }, { decisionTypeId: 2, decisionName: returned.typeName }] },
    academicTerm: { findMany: async () => terms.map(row => ({ id: row.id, academicYearId: row.academicYearId, sTermOrder: row.termOrder, sIsSummer: row.isSummer, startDate: row.startDate, isCurrent: row.id === currentTermId })) },
    academicYear: { findMany: async () => [{ id: "y1", sYearCode: "2025-2026" }, { id: "y2", sYearCode: "2026-2027" }] },
    studentStudySuspension: { findMany: async () => rows,
      upsert: async ({ create, update }: { create: Omit<IntervalRow, "id">; update: Omit<IntervalRow, "id"> }) => { writes++; const previous = rows.find(row => row.decisionId === create.decisionId); if (previous) Object.assign(previous, update); else rows.push({ id: "interval", ...create }); },
      update: async ({ data }: { data: Partial<IntervalRow> }) => { writes++; Object.assign(rows[0], data); } },
    auditLog: { create: async () => { audits++; } },
  };
  const restore = replace(prisma, "$transaction", async (callback: (client: unknown) => unknown) => callback(tx));
  try {
    assert.equal((await syncStudentStudySuspensions(undefined, false)).changes.length, 1); assert.equal(writes, 0);
    await syncStudentStudySuspensions(undefined, true); assert.equal(writes, 1); assert.equal(audits, 1);
    assert.equal((await syncStudentStudySuspensions(undefined, true)).changes.length, 0);
    source = [leave, returned]; await syncStudentStudySuspensions(undefined, true);
    assert.equal(rows[0].returnDecisionId, returned.id); assert.equal(studentSuspension({ studySuspensions: rows }, undefined, now), null);
    // Source periods may have no calendar dates: a signed return for a future
    // semester must wait for that configured semester, rather than its signing date.
    source = [leave, { ...returned, termId: "future" }]; await syncStudentStudySuspensions(undefined, true);
    assert.equal(rows[0].returnCalendarActive, false);
    assert.ok(studentSuspension({ studySuspensions: rows }, undefined, new Date("2027-02-02")));
    currentTermId = "future"; await syncStudentStudySuspensions(undefined, true);
    assert.equal(rows[0].returnCalendarActive, true);
    assert.equal(studentSuspension({ studySuspensions: rows }, undefined, new Date("2027-02-02")), null);
    source = []; await syncStudentStudySuspensions(undefined, true); assert.equal(rows[0].isRevoked, true); assert.equal(rows.length, 1);
    assert.equal(writes, 5); assert.equal(audits, 5);
  } finally { restore(); }
});
