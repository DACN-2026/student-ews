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
  const students = ["normal", "risk", "missing", "insufficient", "leave"].map((id, index) => ({ id, sStudentId: `SV${index}`, sFullName: id, sClassStudentId: "CLASS-A", sStudyProgramId: "PROGRAM-A" }));
  const policy = { id: "policy", status: "active", version: 1, name: "Policy", policyDefinition: { evaluationProfile: "QD600_ARTICLE_18" }, termGpaThreshold: 1, cumulativeGpaThreshold: 1 };
  const scope = { sClassStudentId: "CLASS-A" };
  let receivedStudentWhere: unknown;
  let summariesRequested = 0;
  const resultQueries: Array<{ select: Record<string, boolean>; where: { id?: { in: string[] } } }> = [];
  const exclusionQueries: unknown[][] = [];
  mock(prisma.student, "findMany", async ({ where }: { where: unknown }) => { receivedStudentWhere = where; return students; });
  mock(prisma.academicTerm, "findMany", async () => [{ id: "term", academicYearId: "year", sTermCode: "HK02", sTermOrder: 2, sIsSummer: false }]);
  mock(prisma.academicYear, "findMany", async () => [{ id: "year", sYearCode: "2025-2026" }]);
  mock(prisma.class, "findMany", async () => [{ classId: "CLASS-A", className: "Class A" }]);
  mock(prisma.academicWarningPolicy, "findMany", async () => [policy]);
  mock(prisma.academicWarningPolicy, "findUnique", async () => policy);
  const savedRuns = [
    { id: "run", cohortId: "cohort", trainingProgramId: "program", assessmentAcademicTermId: "term", policyId: "policy", sourceSnapshot: {
      excludedStandingStudents: [{ id: "leave", classId: "CLASS-A", exemption: { decisionId: "decision", number: "332", effect: "APPROVED_LEAVE", reason: "Nghỉ học tạm thời" } },
        { id: "outside-scope", exemption: { number: "999", effect: "APPROVED_LEAVE" } }],
    } },
    { id: "older-run", cohortId: "cohort", trainingProgramId: "program", assessmentAcademicTermId: "term", policyId: "policy", sourceSnapshot: {
      excludedStandingStudents: [{ id: "missing", exemption: { number: "old-decision", effect: "APPROVED_LEAVE" } }],
    } },
  ];
  mock(prisma.academicWarningRun, "findMany", async ({ omit }: { omit: Record<string, boolean> }) => {
    assert.equal(omit.sourceSnapshot, true);
    return savedRuns.map(({ sourceSnapshot, ...run }) => { void sourceSnapshot; return run; });
  });
  mock(prisma, "$queryRaw", async (_sql: TemplateStringsArray, ...values: unknown[]) => {
    exclusionQueries.push(values);
    const [studentIds, runIds] = values as string[][];
    return savedRuns.filter(run => runIds.includes(run.id)).map(run => ({
      id: run.id,
      sourceSnapshot: { excludedStandingStudents: run.sourceSnapshot.excludedStandingStudents.filter(entry => studentIds.includes(entry.id)) },
    }));
  });
  mock(prisma.academicWarningStudentResult, "findMany", async (query: typeof resultQueries[number]) => {
    resultQueries.push(query);
    const rows = [
    { id: "result-normal", runId: "run", studentId: "normal", businessStatus: "NORMAL", maxSeverity: "none", reasonCount: 0, dataError: null },
    { id: "result-risk", runId: "run", studentId: "risk", businessStatus: "MONITORING", maxSeverity: "medium", reasonCount: 1, dataError: null,
      ruleResults: [{ sourceType: "REGULATORY", evaluationStatus: "EVALUATED", isThresholdBreached: true }] },
    { id: "result-insufficient", runId: "run", studentId: "insufficient", businessStatus: "INSUFFICIENT_DATA", maxSeverity: "none", reasonCount: 0, dataError: "missing_student_term_summary" },
    ];
    return query.where.id ? rows.filter(row => query.where.id!.in.includes(row.id)) : rows;
  });
  mock(prisma.academicWarningReason, "findMany", async () => []);
  mock(prisma.warningAction, "findMany", async () => []);
  mock(prisma.studentTermSummary, "findMany", async () => { summariesRequested++; return []; });
  try {
    const overview = await ReportsService.academicWarningStudents({}, scope);
    assert.equal(overview.counts.students, 5);
    assert.equal(overview.counts.evaluated, 2);
    assert.equal(overview.counts.unassessed, 3);
    assert.equal(overview.evaluationState.excludedStandingCount, 1);
    assert.equal(overview.total, 1);
    assert.equal(overview.items[0].regulatoryAssessment, "BREACHED");
    assert.equal(resultQueries[0].select.ruleResults, undefined, "Trend queries must not load every historical rule payload");
    assert.deepEqual(resultQueries[1].select, { id: true, ruleResults: true });
    assert.deepEqual(exclusionQueries[0], [["missing", "leave"], ["run"]], "Only missing scoped students and the latest selected runs need exclusions");
    assert.equal(summariesRequested, 0);
    const list = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", academicTermId: "term", pageSize: 1 }, scope);
    assert.equal(list.total, 3);
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].studentId, "insufficient");
    assert.equal(list.items[0].hasPersistedResult, true);
    assert.match(list.items[0].assessmentIssue!, /Kết quả đã lưu/);
    const next = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", page: 2, pageSize: 1 }, scope);
    assert.equal(next.items[0].studentId, "leave");
    assert.equal(next.items[0].hasPersistedResult, false);
    assert.equal(next.items[0].assessmentCategory, "APPROVED_LEAVE");
    assert.match(next.items[0].assessmentIssue!, /quyết định 332/);
    assert.doesNotMatch(next.items[0].assessmentIssue!, /Chưa có bảng tổng hợp điểm/);
    assert.match(next.items[0].assessmentFollowUp!, /sinh viên vẫn thuộc lớp/);
    const searched = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", search: "SV2" }, scope);
    assert.equal(searched.total, 1);
    assert.equal(searched.items[0].assessmentCategory, "PENDING");
    assert.match(searched.items[0].assessmentIssue!, /Chưa có bảng tổng hợp điểm/);
    assert.deepEqual((receivedStudentWhere as { AND: unknown[] }).AND[1], scope);
    assert.equal(list.evaluationState.noPersistedResultCount, 2);
    assert.equal(list.evaluationState.persistedInsufficientDataCount, 1);
    // A fully excluded run may have no saved results at all. Its snapshot must
    // still explain the exclusion, even though it is absent from the trend.
    mock(prisma.academicWarningStudentResult, "findMany", async () => []);
    const emptyRun = await ReportsService.academicWarningStudents({ assessmentStatus: "unassessed", academicTermId: "term", search: "SV4" }, scope);
    assert.equal(emptyRun.items[0].assessmentCategory, "APPROVED_LEAVE");
    assert.equal(emptyRun.evaluationState.excludedStandingCount, 1);
    // A new run can omit frozen students before evaluation, without adding
    // snapshot exemptions. Projection must also hide older saved risk rows.
    mock(prisma.student, "findMany", async () => students.map(student => ({
      ...student,
      studySuspensions: student.id === "leave" ? [{
        decisionId: "decision", decisionNumber: "332", fromYear: "2025-2026", fromTerm: 2,
        effectiveAt: new Date("2026-04-03"), returnYear: null, returnTerm: null,
        returnEffectiveAt: null, isRevoked: false,
      }] : [],
    })));
    mock(prisma.academicWarningRun, "findMany", async () => [{
      id: "run", cohortId: "cohort", trainingProgramId: "program",
      assessmentAcademicTermId: "term", policyId: "policy", sourceSnapshot: {},
    }]);
    mock(prisma, "$queryRaw", async () => []);
    mock(prisma.academicWarningStudentResult, "findMany", async () => [{
      id: "old-leave-risk", runId: "run", studentId: "leave", businessStatus: "HIGH_RISK",
      maxSeverity: "high", reasonCount: 1, dataError: null,
    }]);
    const frozen = await ReportsService.academicWarningStudents({
      assessmentStatus: "unassessed", academicTermId: "term", search: "SV4",
    }, scope);
    assert.equal(frozen.items[0].assessmentCategory, "APPROVED_LEAVE");
    assert.equal(frozen.items[0].hasPersistedResult, false);
    assert.equal(frozen.counts.evaluated, 0);
    assert.equal(frozen.evaluationState.excludedStandingCount, 1);
    assert.match(frozen.items[0].assessmentFollowUp!, /đóng băng/);
  } finally { cleanups.reverse().forEach((cleanup) => cleanup()); }
});
