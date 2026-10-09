import assert from "node:assert/strict";
import test from "node:test";
import { AcademicWarningEvidenceService, compareWarningEvidence, evidenceNumber, sameDebtEvidence } from "../lib/services/academic-warning-evidence";
import { InterventionCasesService } from "../lib/services/intervention-cases";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/utils/api-error";
import type { Actor } from "../lib/auth/types";

test("missing source values never become zero or a matching verification", () => {
  for (const value of [null, undefined, "", "  ", true, false, [], {}, "invalid"]) {
    assert.equal(evidenceNumber(value), null);
    assert.equal(compareWarningEvidence(0, evidenceNumber(value)), "UNAVAILABLE");
  }
  assert.equal(evidenceNumber(0), 0);
  assert.equal(evidenceNumber("0"), 0);
  assert.equal(evidenceNumber({ toString: () => "0.82" }), 0.82);
});

test("verification separates changed values, matching values and incomplete sources", () => {
  assert.equal(compareWarningEvidence(23, 23), "MATCHED");
  assert.equal(compareWarningEvidence(0.82, 0.820000001), "MATCHED");
  assert.equal(compareWarningEvidence(23, 21), "CHANGED");
  assert.equal(compareWarningEvidence(23, null), "UNAVAILABLE");
  assert.equal(compareWarningEvidence(null, 0), "UNAVAILABLE");
  assert.equal(compareWarningEvidence(23, 23, false), "UNAVAILABLE");
});

test("an out-of-scope case is rejected before reading any evidence", async () => {
  const previousDetail = InterventionCasesService.getDetail;
  const previousResultRead = prisma.academicWarningStudentResult.findUnique;
  let sourceReads = 0;
  InterventionCasesService.getDetail = async () => { throw new ApiError("Case outside assigned classes", "FORBIDDEN", 403); };
  prisma.academicWarningStudentResult.findUnique = (async () => { sourceReads++; throw new Error("Evidence must not be read"); }) as typeof previousResultRead;
  try {
    await assert.rejects(AcademicWarningEvidenceService.getForCase("outside-scope", { userId: "advisor", username: "advisor", fullName: "Advisor", grants: [] } as Actor), (error: unknown) => error instanceof ApiError && error.status === 403);
    assert.equal(sourceReads, 0);
  } finally {
    InterventionCasesService.getDetail = previousDetail;
    prisma.academicWarningStudentResult.findUnique = previousResultRead;
  }
});

test("equal debt totals cannot hide changed course membership or replacement allocation", () => {
  const selection = { semesterNo: 7, requiredCredits: 9, passedCredits: 3, failedCredits: 6, initialDebtCredits: 6, remainingDebtCredits: 6, failedCourseCodes: ["A", "B"] };
  const recorded = { accumulatedDebtCredits: 23, outstandingCourses: ["A", "B"], electiveSelections: [selection], replacements: [] };
  assert.equal(sameDebtEvidence(recorded, { ...recorded, outstandingCourses: ["B", "A"] }), true);
  assert.equal(sameDebtEvidence(recorded, { ...recorded, outstandingCourses: ["A", "C"] }), false);
  assert.equal(sameDebtEvidence(recorded, { ...recorded, electiveSelections: [{ ...selection, remainingDebtCredits: 5 }] }), false);
});

test("evidence stays pinned to the displayed result when reconciliation moves the case pointer", async () => {
  const previousDetail = InterventionCasesService.getDetail;
  const previousResultRead = prisma.academicWarningStudentResult.findUnique;
  const previousRunRead = prisma.academicWarningRun.findUniqueOrThrow;
  const calls: string[] = [];
  InterventionCasesService.getDetail = async () => ({ case: { student: { id: "student" } }, currentWarning: { resultId: "older-result" } }) as Awaited<ReturnType<typeof previousDetail>>;
  prisma.academicWarningStudentResult.findUnique = (async ({ where }: { where: { id: string } }) => { calls.push(where.id); return { id: where.id, studentId: "student", runId: "displayed-run" }; }) as unknown as typeof previousResultRead;
  prisma.academicWarningRun.findUniqueOrThrow = (async ({ where }: { where: { id: string } }) => { calls.push(where.id); throw new Error("Stop after pinned result"); }) as unknown as typeof previousRunRead;
  try {
    await assert.rejects(AcademicWarningEvidenceService.getForCase("case", { grants: [] } as unknown as Actor, "displayed-result"), /Stop after pinned result/);
    assert.deepEqual(calls, ["displayed-result", "displayed-run"]);
  } finally {
    InterventionCasesService.getDetail = previousDetail;
    prisma.academicWarningStudentResult.findUnique = previousResultRead;
    prisma.academicWarningRun.findUniqueOrThrow = previousRunRead;
  }
});

test("a pinned result from another student is rejected before loading its sources", async () => {
  const previousDetail = InterventionCasesService.getDetail;
  const previousResultRead = prisma.academicWarningStudentResult.findUnique;
  const previousRunRead = prisma.academicWarningRun.findUniqueOrThrow;
  let sourceReads = 0;
  InterventionCasesService.getDetail = async () => ({ case: { student: { id: "authorized-student" } }, currentWarning: { resultId: "current-result" } }) as Awaited<ReturnType<typeof previousDetail>>;
  prisma.academicWarningStudentResult.findUnique = (async () => ({ id: "other-result", studentId: "other-student", runId: "other-run" })) as unknown as typeof previousResultRead;
  prisma.academicWarningRun.findUniqueOrThrow = (async () => { sourceReads++; throw new Error("Sources must not be read"); }) as typeof previousRunRead;
  try {
    await assert.rejects(AcademicWarningEvidenceService.getForCase("case", { grants: [] } as unknown as Actor, "other-result"), (error: unknown) => error instanceof ApiError && error.status === 404);
    assert.equal(sourceReads, 0);
  } finally {
    InterventionCasesService.getDetail = previousDetail;
    prisma.academicWarningStudentResult.findUnique = previousResultRead;
    prisma.academicWarningRun.findUniqueOrThrow = previousRunRead;
  }
});
