import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { ReportsService } from "../lib/services/reports";

test("unassessed list includes both missing results and saved insufficient results within student scope", async () => {
  const cleanups: Array<() => void> = [];
  function mock(target: object, key: string, value: unknown) {
    const record = target as Record<string, unknown>;
    const original = record[key]; record[key] = value;
    cleanups.push(() => { record[key] = original; });
  }
  const students = ["normal", "risk", "missing", "insufficient"].map((id, index) => ({ id, sStudentId: `SV${index}`, sFullName: id, sClassStudentId: "CLASS-A", sStudyProgramId: "PROGRAM-A" }));
  const policy = { id: "policy", status: "active", version: 1, name: "Policy", policyDefinition: { evaluationProfile: "QD600_ARTICLE_18" }, termGpaThreshold: 1, cumulativeGpaThreshold: 1 };
  const scope = { sClassStudentId: "CLASS-A" };
  let receivedStudentWhere: unknown;
  let summariesRequested = 0;
  mock(prisma.student, "findMany", async ({ where }: { where: unknown }) => { receivedStudentWhere = where; return students; });
  mock(prisma.academicTerm, "findMany", async () => [{ id: "term", academicYearId: "year", sTermCode: "HK02", sTermOrder: 2, sIsSummer: false }]);
  mock(prisma.academicYear, "findMany", async () => [{ id: "year", sYearCode: "2025-2026" }]);
  mock(prisma.class, "findMany", async () => [{ classId: "CLASS-A", className: "Class A" }]);
  mock(prisma.academicWarningPolicy, "findMany", async () => [policy]);
  mock(prisma.academicWarningPolicy, "findUnique", async () => policy);
  mock(prisma.academicWarningRun, "findMany", async () => [{ id: "run", cohortId: "cohort", trainingProgramId: "program", assessmentAcademicTermId: "term", policyId: "policy" }]);
  mock(prisma.academicWarningStudentResult, "findMany", async () => [
    { id: "result-normal", runId: "run", studentId: "normal", businessStatus: "NORMAL", maxSeverity: "none", reasonCount: 0, dataError: null },
    { id: "result-risk", runId: "run", studentId: "risk", businessStatus: "MONITORING", maxSeverity: "medium", reasonCount: 1, dataError: null },
    { id: "result-insufficient", runId: "run", studentId: "insufficient", businessStatus: "INSUFFICIENT_DATA", maxSeverity: "none", reasonCount: 0, dataError: "missing_student_term_summary" },
  ]);
  mock(prisma.academicWarningReason, "findMany", async () => []);
  mock(prisma.warningAction, "findMany", async () => []);
  mock(prisma.studentTermSummary, "findMany", async () => { summariesRequested++; return []; });
  try {
    const overview = await ReportsService.academicWarningStudents({}, scope);
    assert.equal(overview.counts.students, 4);
    assert.equal(overview.counts.evaluated, 2);
    assert.equal(overview.counts.unassessed, 2);
    assert.equal(overview.total, 1);
    assert.equal(summariesRequested, 0);
    const list = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", academicTermId: "term", pageSize: 1 }, scope);
    assert.equal(list.total, 2);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].studentId, "insufficient");
    assert.equal(list.items[0].hasPersistedResult, true);
    assert.match(list.items[0].assessmentIssue!, /Kết quả đã lưu/);
    const next = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", page: 2, pageSize: 1 }, scope);
    assert.equal(next.items[0].studentId, "missing");
    assert.equal(next.items[0].hasPersistedResult, false);
    assert.match(next.items[0].assessmentIssue!, /Chưa có bảng tổng hợp điểm/);
    const searched = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", search: "SV2" }, scope);
    assert.equal(searched.total, 1);
    assert.deepEqual((receivedStudentWhere as { AND: unknown[] }).AND[1], scope);
    assert.equal(list.evaluationState.noPersistedResultCount, 1);
    assert.equal(list.evaluationState.persistedInsufficientDataCount, 1);
  } finally { cleanups.reverse().forEach((cleanup) => cleanup()); }
});
