import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/utils/api-error";
import { createQd600PolicyDefinition } from "../lib/services/academic-warning-policy";
import { AcademicWarningsService } from "../lib/services/academic-warnings";
import { InterventionCasesService } from "../lib/services/intervention-cases";
import { assertCohortTrainingProgramPair } from "../lib/services/academic-warning-scope";
import {
  AcademicWarningAutomationService,
  academicWarningRunAction,
  deriveQd600EvaluationScopes,
  isMainTermReadyForAutomaticWarning,
  pastMainTermsWithGradeData,
} from "../lib/services/academic-warning-automation";

const IDS = {
  term: "11111111-1111-4111-8111-111111111111",
  year: "22222222-2222-4222-8222-222222222222",
  cohort: "33333333-3333-4333-8333-333333333333",
  otherCohort: "44444444-4444-4444-8444-444444444444",
  program: "55555555-5555-4555-8555-555555555555",
  otherProgram: "88888888-8888-4888-8888-888888888888",
  policy: "66666666-6666-4666-8666-666666666666",
  run: "77777777-7777-4777-8777-777777777777",
  term2: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  currentTerm: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  summerTerm: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

function mockMethod<T extends object>(target: T, key: keyof T, replacement: unknown) {
  const record = target as Record<string | symbol, unknown>;
  const original = record[key as string | symbol];
  record[key as string | symbol] = replacement;
  return () => { record[key as string | symbol] = original; };
}

test("readiness is explicit and independent from GPA presence", () => {
  assert.equal(isMainTermReadyForAutomaticWarning({ isSummer: false, gradesFinalizedAt: null }), false);
  assert.equal(isMainTermReadyForAutomaticWarning({ isSummer: false, gradesFinalizedAt: new Date() }), true);
  assert.equal(isMainTermReadyForAutomaticWarning({ isSummer: true, gradesFinalizedAt: new Date() }), false);
});

test("historical reconciliation selects only past MAIN terms that contain grade summaries", () => {
  const base = { academicYearId: IDS.year, startDate: null, endDate: null };
  const terms = [
    { ...base, id: IDS.term, academicYearCode: "2024-2025", termOrder: 1, isSummer: false, isCurrent: false },
    { ...base, id: IDS.summerTerm, academicYearCode: "2024-2025", termOrder: 3, isSummer: true, isCurrent: false },
    { ...base, id: IDS.term2, academicYearCode: "2025-2026", termOrder: 1, isSummer: false, isCurrent: false },
    { ...base, id: IDS.currentTerm, academicYearCode: "2025-2026", termOrder: 2, isSummer: false, isCurrent: true },
  ];
  assert.deepEqual(
    pastMainTermsWithGradeData(terms, new Set([IDS.term, IDS.summerTerm, IDS.currentTerm])).map((term) => term.id),
    [IDS.term],
  );
});

test("historical reconciliation auto-finalizes and evaluates eligible terms chronologically", async () => {
  const evaluated: Array<{ termId: string; syncInterventions?: boolean }> = [];
  const finalized: string[] = [];
  const terms = [
    {
      id: IDS.term2, academicYearId: IDS.year, sTermCode: "HK02", sTermName: "Học kỳ 2", sTermOrder: 2,
      sIsSummer: false, isCurrent: false, startDate: null, endDate: null, gradesFinalizedAt: null,
      updatedAt: new Date("2025-06-01T00:00:00.000Z"), deletedAt: null,
    },
    {
      id: IDS.term, academicYearId: IDS.year, sTermCode: "HK01", sTermName: "Học kỳ 1", sTermOrder: 1,
      sIsSummer: false, isCurrent: false, startDate: null, endDate: null, gradesFinalizedAt: null,
      updatedAt: new Date("2025-01-01T00:00:00.000Z"), deletedAt: null,
    },
    {
      id: IDS.currentTerm, academicYearId: IDS.year, sTermCode: "HK03", sTermName: "Học kỳ hiện tại", sTermOrder: 3,
      sIsSummer: false, isCurrent: true, startDate: null, endDate: null, gradesFinalizedAt: null,
      updatedAt: new Date("2025-09-01T00:00:00.000Z"), deletedAt: null,
    },
  ];
  const cleanups = [
    mockMethod(prisma.academicTerm, "findMany", async () => terms),
    mockMethod(prisma.academicYear, "findMany", async () => [{ id: IDS.year, sYearCode: "2024-2025" }]),
    mockMethod(prisma.studentTermSummary, "groupBy", async () => [
      { academicTermId: IDS.term2, _count: { _all: 20 }, _max: { updatedAt: new Date("2025-07-01T00:00:00.000Z") } },
      { academicTermId: IDS.term, _count: { _all: 10 }, _max: { updatedAt: new Date("2025-02-01T00:00:00.000Z") } },
      { academicTermId: IDS.currentTerm, _count: { _all: 30 }, _max: { updatedAt: new Date("2025-09-02T00:00:00.000Z") } },
    ]),
    mockMethod(prisma, "$transaction", async (callback: unknown) => (
      callback as (tx: {
        academicTerm: { updateMany: (args: { where: { id: string } }) => Promise<{ count: number }> };
        auditLog: { create: () => Promise<Record<string, never>> };
      }) => Promise<unknown>
    )({
      academicTerm: { updateMany: async ({ where }) => { finalized.push(where.id); return { count: 1 }; } },
      auditLog: { create: async () => ({}) },
    })),
    mockMethod(AcademicWarningAutomationService, "runForFinalizedMainTerm", async (input: { termId: string; syncInterventions?: boolean }) => {
      evaluated.push(input);
      return { completed: 1, skipped: 0, failed: 0 };
    }),
  ];
  try {
    const result = await AcademicWarningAutomationService.reconcilePastTermsWithGrades({ actorId: IDS.run });
    assert.deepEqual(finalized, [IDS.term, IDS.term2]);
    assert.deepEqual(evaluated, [
      { termId: IDS.term, actorId: IDS.run, facultyCode: undefined, syncInterventions: true },
      { termId: IDS.term2, actorId: IDS.run, facultyCode: undefined, syncInterventions: true },
    ]);
    assert.equal(result.eligibleTermCount, 2);
    assert.equal(result.completedScopeCount, 2);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});

test("scope derivation uses configured cohort UUIDs and aggregates programs without Kxx inference", () => {
  const scopes = deriveQd600EvaluationScopes({
    applicableCohortIds: [IDS.cohort],
    facultyCode: "CNTT",
    classes: [
      { classId: "ITK46A", cohortId: IDS.cohort },
      { classId: "ITK99A", cohortId: IDS.otherCohort },
    ],
    students: [
      { sClassStudentId: "ITK46A", sStudyProgramId: "CNTT" },
      { sClassStudentId: "ITK46A", sStudyProgramId: "HTTT" },
      { sClassStudentId: "ITK99A", sStudyProgramId: "CNTT" },
    ],
    programs: [
      { id: IDS.program, sProgramCode: "CNTT", s_faculty_code: "CNTT" },
      { id: IDS.otherProgram, sProgramCode: "HTTT", s_faculty_code: "CNTT" },
    ],
    cohortProgramPairs: [{ cohortId: IDS.cohort, trainingProgramId: IDS.program }],
  });
  assert.deepEqual(scopes, [{
    cohortId: IDS.cohort,
    trainingProgramId: IDS.program,
    programCode: "CNTT",
    facultyCode: "CNTT",
  }]);
});

test("scope derivation rejects a program that is not configured for the student's cohort", () => {
  const scopes = deriveQd600EvaluationScopes({
    applicableCohortIds: [IDS.cohort],
    classes: [{ classId: "ITK46A", cohortId: IDS.cohort }],
    students: [{ sClassStudentId: "ITK46A", sStudyProgramId: "CQ24CT-PM" }],
    programs: [{ id: IDS.otherProgram, sProgramCode: "CQ24CT-PM", s_faculty_code: "CNTT" }],
    cohortProgramPairs: [{ cohortId: IDS.otherCohort, trainingProgramId: IDS.otherProgram }],
  });
  assert.deepEqual(scopes, []);
});

test("term-scoped orchestration includes only students with a matching program summary in that term", async () => {
  const studentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const otherStudentId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const cleanups = [
    mockMethod(prisma.class, "findMany", async () => [{ classId: "ITK46A", cohortId: IDS.cohort }]),
    mockMethod(prisma.student, "findMany", async () => [
      { id: studentId, sClassStudentId: "ITK46A", sStudyProgramId: "CNTT" },
      { id: otherStudentId, sClassStudentId: "ITK46A", sStudyProgramId: "HTTT" },
    ]),
    mockMethod(prisma.studentTermSummary, "findMany", async () => [
      { studentId, sProgramCode: "CNTT" },
      { studentId: otherStudentId, sProgramCode: "CNTT" },
    ]),
    mockMethod(prisma.trainingProgram, "findMany", async () => [
      { id: IDS.program, sProgramCode: "CNTT", s_faculty_code: "CNTT" },
    ]),
    mockMethod(prisma.trainingProgressPlan, "findMany", async () => [
      { cohortId: IDS.cohort, trainingProgramId: IDS.program },
    ]),
  ];
  try {
    const scopes = await AcademicWarningAutomationService.evaluationScopes([IDS.cohort], "CNTT", IDS.term);
    assert.deepEqual(scopes, [{
      cohortId: IDS.cohort,
      trainingProgramId: IDS.program,
      programCode: "CNTT",
      facultyCode: "CNTT",
    }]);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});

test("run creation guard rejects a cohort-program pair absent from training plans", async () => {
  const cleanup = mockMethod(prisma.trainingProgressPlan, "findFirst", async () => null);
  try {
    await assert.rejects(
      () => assertCohortTrainingProgramPair({
        cohortId: IDS.cohort,
        trainingProgramId: IDS.otherProgram,
      }),
      (error) => error instanceof ApiError && error.code === "COHORT_TRAINING_PROGRAM_MISMATCH",
    );
  } finally {
    cleanup();
  }
});

test("run action skips completed/running scopes and permits a failed retry", () => {
  assert.equal(academicWarningRunAction("completed"), "SKIP_COMPLETED");
  assert.equal(academicWarningRunAction("running"), "SKIP_RUNNING");
  assert.equal(academicWarningRunAction("failed"), "RETRY");
  assert.equal(academicWarningRunAction(null), "CREATE");
});

test("finalizing a MAIN term persists readiness then triggers automatic evaluation", async () => {
  const finalizedAt: Date[] = [];
  let automaticRuns = 0;
  const cleanups = [
    mockMethod(prisma.academicTerm, "findFirst", async () => ({
      id: IDS.term,
      academicYearId: IDS.year,
      sIsSummer: false,
      gradesFinalizedAt: null,
    })),
    mockMethod(prisma, "$transaction", async (callback: unknown) => (
      callback as (tx: {
        academicTerm: { update: (args: { data: { gradesFinalizedAt: Date } }) => Promise<number> };
        auditLog: { create: () => Promise<Record<string, never>> };
      }) => Promise<unknown>
    )({
      academicTerm: { update: async ({ data }) => finalizedAt.push(data.gradesFinalizedAt) },
      auditLog: { create: async () => ({}) },
    })),
    mockMethod(AcademicWarningAutomationService, "runForFinalizedMainTerm", async () => {
      automaticRuns += 1;
      return { scopeCount: 2, completed: 2, skipped: 0, failed: 0, status: "completed", results: [] };
    }),
  ];
  try {
    const result = await AcademicWarningAutomationService.finalizeGradesAndRun({
      termId: IDS.term,
      academicYearId: IDS.year,
      actorId: "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(finalizedAt.length, 1);
    assert.equal(automaticRuns, 1);
    assert.equal(result.alreadyFinalized, false);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});

test("summer finalization never persists readiness or triggers early warning", async () => {
  let transactionCalls = 0;
  let automaticRuns = 0;
  const cleanups = [
    mockMethod(prisma.academicTerm, "findFirst", async () => ({
      id: IDS.term,
      academicYearId: IDS.year,
      sIsSummer: true,
      gradesFinalizedAt: null,
    })),
    mockMethod(prisma, "$transaction", async () => { transactionCalls += 1; }),
    mockMethod(AcademicWarningAutomationService, "runForFinalizedMainTerm", async () => { automaticRuns += 1; }),
  ];
  try {
    await assert.rejects(
      () => AcademicWarningAutomationService.finalizeGradesAndRun({
        termId: IDS.term,
        academicYearId: IDS.year,
        actorId: "99999999-9999-4999-8999-999999999999",
      }),
      (error) => error instanceof ApiError && error.code === "SUMMER_EARLY_WARNING_NOT_ALLOWED",
    );
    assert.equal(transactionCalls, 0);
    assert.equal(automaticRuns, 0);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});

test("term orchestration skips an existing completed scope without creating another run", async () => {
  let createRunCalls = 0;
  const syncedRunIds: string[] = [];
  const definition = createQd600PolicyDefinition({ applicableCohortIds: [IDS.cohort] });
  const cleanups = [
    mockMethod(prisma.academicTerm, "findFirst", async () => ({
      id: IDS.term,
      sTermCode: "HK01",
      sTermName: "Học kỳ 1",
      sIsSummer: false,
      isCurrent: true,
      gradesFinalizedAt: new Date("2026-12-20T08:00:00.000Z"),
    })),
    mockMethod(prisma.academicWarningPolicy, "findMany", async () => [{
      id: IDS.policy,
      name: "QĐ600",
      version: 1,
      status: "draft",
      createdAt: new Date(),
      policyDefinition: definition,
    }]),
    mockMethod(AcademicWarningAutomationService, "evaluationScopes", async () => [{
      cohortId: IDS.cohort,
      trainingProgramId: IDS.program,
      programCode: "CNTT",
      facultyCode: "CNTT",
    }]),
    mockMethod(prisma.academicWarningRun, "findMany", async () => [{
      id: IDS.run,
      status: "completed",
      sourceSnapshot: { engineVersion: "academic-warning-qd600-article18-and-progress-v7" },
    }]),
    mockMethod(AcademicWarningsService, "createRun", async () => {
      createRunCalls += 1;
      return { id: IDS.run, status: "completed" };
    }),
    mockMethod(InterventionCasesService, "syncInterventionCasesForRun", async (runId: string) => {
      syncedRunIds.push(runId);
      return { runId, processedResults: 0, createdCases: 0, updatedCases: 0, unchangedResults: 0 };
    }),
  ];
  try {
    const result = await AcademicWarningAutomationService.runForFinalizedMainTerm({ termId: IDS.term });
    assert.equal(result.skipped, 1);
    assert.equal(result.completed, 0);
    assert.equal(createRunCalls, 0);
    assert.deepEqual(syncedRunIds, [IDS.run]);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});

test("a scope with no active completed run is retried through the existing AcademicWarningRun service", async () => {
  let createRunCalls = 0;
  const definition = createQd600PolicyDefinition({ applicableCohortIds: [IDS.cohort] });
  const cleanups = [
    mockMethod(prisma.academicTerm, "findFirst", async () => ({
      id: IDS.term,
      sTermCode: "HK01",
      sTermName: "Học kỳ 1",
      sIsSummer: false,
      isCurrent: true,
      gradesFinalizedAt: new Date("2026-12-20T08:00:00.000Z"),
    })),
    mockMethod(prisma.academicWarningPolicy, "findMany", async () => [{
      id: IDS.policy,
      name: "QĐ600",
      version: 1,
      status: "draft",
      createdAt: new Date(),
      policyDefinition: definition,
    }]),
    mockMethod(AcademicWarningAutomationService, "evaluationScopes", async () => [{
      cohortId: IDS.cohort,
      trainingProgramId: IDS.program,
      programCode: "CNTT",
      facultyCode: "CNTT",
    }]),
    mockMethod(prisma.academicWarningRun, "findMany", async () => []),
    mockMethod(AcademicWarningsService, "createRun", async () => {
      createRunCalls += 1;
      return { id: IDS.run, status: "completed" };
    }),
  ];
  try {
    const result = await AcademicWarningAutomationService.runForFinalizedMainTerm({ termId: IDS.term });
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);
    assert.equal(createRunCalls, 1);
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup());
  }
});
