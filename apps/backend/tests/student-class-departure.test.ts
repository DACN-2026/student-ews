import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { resolveClassDeparture, syncStudentClassDepartures } from "../lib/services/student-class-departure";
import { monitoredStudentWhere, studentIsInClass, assertStudentSupportAllowed } from "../lib/student-monitoring-scope";
import { InterventionCasesService, EARLY_WARNING_CASE_TYPE } from "../lib/services/intervention-cases";
import type { StandingDecision, StandingTerm } from "../lib/services/academic-standing-rules";
import type { Actor } from "../lib/auth/types";

const now = new Date("2026-10-11T00:00:00Z");
const terms: StandingTerm[] = [
  { id: "before", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 1, isSummer: false, startDate: new Date("2025-09-01"), label: "HKI" },
  { id: "exit", academicYearId: "y1", academicYearCode: "2025-2026", termOrder: 2, isSummer: false, startDate: new Date("2026-02-01"), label: "HKII" },
  { id: "future", academicYearId: "y2", academicYearCode: "2026-2027", termOrder: 2, isSummer: false, startDate: new Date("2027-02-01"), label: "HKII" },
];
const decision: StandingDecision = { id: "decision", termId: "exit", number: "230/QĐ", signedAt: "2026-03-19T00:00:00Z", name: "Thôi học", typeName: "Thôi học" };
function replace(target: object, key: string, value: unknown) {
  const record = target as Record<string, unknown>, old = record[key]; record[key] = value;
  return () => { record[key] = old; };
}

test("signed withdrawals and outgoing transfers define departure; incoming transfers and approved leave do not", () => {
  assert.equal(resolveClassDeparture([decision], terms, now)?.decisionId, "decision");
  for (const name of ["Chuyển trường", "Chuyển trường đi", "Chuyển đi", "Buộc thôi học"]) {
    assert.equal(resolveClassDeparture([{ ...decision, name, typeName: name }], terms, now)?.termOrder, 2);
  }
  for (const name of ["Tiếp nhận Chuyển trường", "Nghỉ học tạm thời", "Bảo lưu kết quả học tập"]) {
    assert.equal(resolveClassDeparture([{ ...decision, name, typeName: name }], terms, now), null);
  }
  assert.equal(resolveClassDeparture([{ ...decision, name: "Tiếp nhận Chuyển trường", typeName: "Chuyển trường" }], terms, now), null);
});

test("unsigned, future-signed and revoked decisions never remove a student", () => {
  for (const row of [{ ...decision, number: "" }, { ...decision, signedAt: null },
    { ...decision, signedAt: "2027-01-01" }, { ...decision, fullText: "[Xóa quyết định 230/QĐ]" }]) {
    assert.equal(resolveClassDeparture([row], terms, now), null);
  }
});

test("explicit future departure keeps current membership and preserves pre-departure eligibility", () => {
  const result = resolveClassDeparture([{ ...decision, fullText: "Thôi học (từ HKII 2026-2027)" }], terms, now)!;
  assert.equal(result.yearCode, "2026-2027");
  assert.equal(result.effectiveAt.toISOString(), "2027-02-01T00:00:00.000Z");
  assert.equal(studentIsInClass({ sIsInClass: true, leftClassEffectiveAt: result.effectiveAt }, now), true);
  assert.equal(studentIsInClass({ sIsInClass: true, leftClassEffectiveAt: result.effectiveAt }, new Date("2027-02-02")), false);
  const before = monitoredStudentWhere({ yearCode: "2025-2026", termOrder: 1 });
  assert.deepEqual(before.OR, [{ leftClassFromYear: null }, { leftClassFromYear: { gt: "2025-2026" } },
    { leftClassFromYear: "2025-2026", leftClassFromTerm: { gt: 1 } }]);
});

test("an effective return clears departure, but future return and temporary leave do not", () => {
  const returned = { ...decision, id: "return", name: "Tiếp nhận Nghỉ học tạm thời", typeName: "Tiếp nhận Nghỉ học tạm thời", signedAt: "2026-04-01" };
  assert.equal(resolveClassDeparture([decision, returned], terms, now), null);
  assert.equal(resolveClassDeparture([decision, { ...returned, fullText: "Tiếp nhận trở lại (HKII 2026-2027)" }], terms, now)?.decisionId, "decision");
  assert.equal(resolveClassDeparture([decision, { ...returned, name: "Nghỉ học tạm thời", typeName: "Nghỉ học tạm thời" }], terms, now)?.decisionId, "decision");
});

test("departure materialization preserves source membership and history, audits once, and clears a revoked departure", async () => {
  const student = { id: "student", sStudentId: "SV", sFullName: "Student", sIsInClass: true,
    updatedAt: new Date(), leftClassDecisionId: null as string | null, leftClassFromYear: null as string | null,
    leftClassFromTerm: null as number | null, leftClassEffectiveAt: null as Date | null };
  let revoked = false, writes = 0, audits = 0;
  const tx = {
    $executeRaw: async () => 0,
    studentStudySuspension: { findMany: async () => [] },
    student: { findMany: async () => [student], updateMany: async ({ data }: { data: object }) => { writes++; Object.assign(student, data); return { count: 1 }; } },
    studentDecision: { findMany: async () => revoked ? [] : [{ id: decision.id, studentId: student.id, academicTermId: "exit", sDecisionNumber: decision.number,
      sSignDate: new Date(decision.signedAt!), sDecisionName: decision.name, decisionTypeId: 1, sourcePayload: {}, sFullText: "" }] },
    decisionType: { findMany: async () => [{ decisionTypeId: 1, decisionName: "Thôi học" }] },
    academicTerm: { findMany: async () => terms.map(t => ({ id: t.id, academicYearId: t.academicYearId, sTermOrder: t.termOrder,
      sIsSummer: t.isSummer, startDate: t.startDate, sTermName: t.label })) },
    academicYear: { findMany: async () => [{ id: "y1", sYearCode: "2025-2026" }, { id: "y2", sYearCode: "2026-2027" }] },
    auditLog: { create: async () => { audits++; } },
  };
  const restore = replace(prisma, "$transaction", async (callback: (client: unknown) => Promise<unknown>) => callback(tx));
  try {
    const plan = await syncStudentClassDepartures([student.id]); assert.equal(plan.changes.length, 1); assert.equal(writes, 0);
    await syncStudentClassDepartures([student.id], true); assert.equal(writes, 1); assert.equal(audits, 1);
    assert.equal(student.sIsInClass, true); assert.equal(studentIsInClass(student, now), false);
    assert.equal((await syncStudentClassDepartures([student.id], true)).changes.length, 0); assert.equal(writes, 1);
    revoked = true; await syncStudentClassDepartures([student.id], true);
    assert.equal(student.leftClassDecisionId, null); assert.equal(studentIsInClass(student, now), true);
    assert.equal(writes, 2); assert.equal(audits, 2);
  } finally { restore(); }
});

test("departed student support cannot be changed through the API, including by an administrator", async () => {
  let writes = 0;
  const restores = [
    replace(prisma.student, "findFirst", async () => ({ sIsInClass: true, leftClassEffectiveAt: new Date("2026-03-19") })),
    replace(prisma.warningAction, "findUnique", async () => ({ id: "case", studentId: "student", caseType: EARLY_WARNING_CASE_TYPE })),
    replace(prisma, "$transaction", async () => { writes++; }),
  ];
  const admin = { userId: "admin", grants: [{ role: "admin", scope: "system" }] } as Actor;
  try {
    await assert.rejects(assertStudentSupportAllowed("student"), (error: { code?: string }) => error.code === "STUDENT_LEFT_CLASS");
    await assert.rejects(InterventionCasesService.recordIntervention("case", { interventionType: "CONTACT", occurredAt: now, content: "Contact" }, admin),
      (error: { code?: string }) => error.code === "STUDENT_LEFT_CLASS");
    assert.equal(writes, 0);
  } finally { restores.reverse().forEach(restore => restore()); }
});
