import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/types";
import { ApiError } from "@/lib/utils/api-error";
import {
  AcademicTermResolutionError,
  assertAcademicWarningAssessmentTermAllowed,
  compareAcademicTerms,
} from "@/lib/academic-terms";
import { parseAcademicWarningPolicyDefinition } from "@/lib/services/academic-warning-policy";
import { QD600_EXECUTION_PROFILE, QD600_RULE_ENGINE_VERSION } from "@/lib/services/academic-warning-qd600-rules";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import {
  cohortTrainingProgramKey,
  type CohortTrainingProgramPair,
} from "@/lib/services/academic-warning-scope";

export type AcademicWarningEvaluationScope = {
  cohortId: string;
  trainingProgramId: string;
  programCode: string;
  facultyCode: string | null;
};

type ScopeSource = {
  applicableCohortIds: string[];
  facultyCode?: string | null;
  classes: Array<{ classId: string; cohortId: string | null }>;
  students: Array<{ id?: string; sClassStudentId: string | null; sStudyProgramId: string | null }>;
  programs: Array<{ id: string; sProgramCode: string; s_faculty_code: string | null }>;
  cohortProgramPairs: CohortTrainingProgramPair[];
};

export type WarningReconciliationTerm = {
  id: string;
  academicYearId: string;
  academicYearCode: string;
  termOrder: number;
  isSummer: boolean;
  isCurrent: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
};

export function pastMainTermsWithGradeData(
  terms: WarningReconciliationTerm[],
  gradeTermIds: ReadonlySet<string>,
) {
  const currentMainTerms = terms.filter((term) => term.isCurrent && !term.isSummer);
  if (currentMainTerms.length !== 1) {
    throw new ApiError(
      currentMainTerms.length
        ? "Có nhiều hơn một kỳ chính được đánh dấu là kỳ hiện tại."
        : "Không có kỳ chính hiện tại được cấu hình.",
      currentMainTerms.length ? "MULTIPLE_CURRENT_MAIN_TERMS" : "CURRENT_MAIN_TERM_UNAVAILABLE",
      422,
    );
  }
  const current = currentMainTerms[0];
  return terms
    .filter((term) => !term.isSummer && gradeTermIds.has(term.id) && compareAcademicTerms(term, current) < 0)
    .sort(compareAcademicTerms);
}

export function isMainTermReadyForAutomaticWarning(term: {
  isSummer: boolean;
  gradesFinalizedAt: Date | string | null;
}) {
  return !term.isSummer && Boolean(term.gradesFinalizedAt);
}

/**
 * Derive the existing AcademicWarningRun scopes from real student membership.
 * QĐ600 applicability is intentionally based only on configured cohort UUIDs;
 * cohort codes such as K46 are never parsed or inferred at runtime.
 */
export function deriveQd600EvaluationScopes(input: ScopeSource): AcademicWarningEvaluationScope[] {
  const applicable = new Set(input.applicableCohortIds);
  const configuredPairs = new Set(input.cohortProgramPairs.map(cohortTrainingProgramKey));
  const cohortByClassCode = new Map(
    input.classes
      .filter((item) => item.cohortId && applicable.has(item.cohortId))
      .map((item) => [item.classId, item.cohortId!]),
  );
  const programByCode = new Map(input.programs
    .filter((program) => !input.facultyCode || program.s_faculty_code === input.facultyCode)
    .map((program) => [program.sProgramCode, program]));
  const scopes = new Map<string, AcademicWarningEvaluationScope>();

  for (const student of input.students) {
    if (!student.sClassStudentId || !student.sStudyProgramId) continue;
    const cohortId = cohortByClassCode.get(student.sClassStudentId);
    const program = programByCode.get(student.sStudyProgramId);
    if (!cohortId || !program) continue;
    const key = cohortTrainingProgramKey({ cohortId, trainingProgramId: program.id });
    if (!configuredPairs.has(key)) continue;
    scopes.set(key, {
      cohortId,
      trainingProgramId: program.id,
      programCode: program.sProgramCode,
      facultyCode: program.s_faculty_code,
    });
  }

  return [...scopes.values()].sort((left, right) =>
    left.cohortId.localeCompare(right.cohortId) || left.programCode.localeCompare(right.programCode),
  );
}

export function academicWarningRunAction(status?: string | null) {
  if (status === "completed") return "SKIP_COMPLETED" as const;
  if (status === "running") return "SKIP_RUNNING" as const;
  if (status === "failed") return "RETRY" as const;
  return "CREATE" as const;
}

async function findQd600Policy() {
  const candidates = await prisma.academicWarningPolicy.findMany({
    where: { status: "draft" },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  for (const policy of candidates) {
    try {
      const definition = parseAcademicWarningPolicyDefinition(policy.policyDefinition);
      if (definition.evaluationProfile === "QD600_ARTICLE_18") return { policy, definition };
    } catch {
      // Ignore unrelated or invalid draft policies while locating the configured QĐ600 definition.
    }
  }
  throw new ApiError(
    "Không tìm thấy chính sách QĐ600 Điều 18 để đánh giá cảnh báo.",
    "QD600_POLICY_NOT_FOUND",
    422,
  );
}

async function facultyCodeForActor(actor: Actor) {
  if (actor.grants.some((grant) => grant.role === "admin" || grant.scope === "system")) return null;
  if (!actor.grants.some((grant) => grant.scope === "faculty")) {
    throw new ApiError("Only system or faculty scope can retry warning evaluation", "FORBIDDEN", 403);
  }
  const lecturer = await prisma.lecturerProfile.findUnique({
    where: { userId: actor.userId },
    select: { facultyCode: true },
  });
  if (!lecturer?.facultyCode) {
    throw new ApiError("Faculty scope is not configured for this account", "FACULTY_SCOPE_UNAVAILABLE", 403);
  }
  return lecturer.facultyCode;
}

export class AcademicWarningAutomationService {
  static async actorFacultyCode(actor: Actor) {
    return facultyCodeForActor(actor);
  }

  static async evaluationScopes(
    applicableCohortIds: string[],
    facultyCode?: string | null,
    assessmentTermId?: string,
  ) {
    const classes = await prisma.class.findMany({
      where: {
        cohortId: { in: applicableCohortIds },
        deletedAt: null,
        isActive: true,
      },
      select: { classId: true, cohortId: true },
    });
    const classCodes = classes.map((item) => item.classId);
    const students = classCodes.length
      ? await prisma.student.findMany({
          where: {
            deletedAt: null,
            sIsInClass: true,
            sClassStudentId: { in: classCodes },
            sStudyProgramId: { not: null },
          },
          select: { id: true, sClassStudentId: true, sStudyProgramId: true },
        })
      : [];
    const termParticipants = assessmentTermId && students.length
      ? await prisma.studentTermSummary.findMany({
          where: {
            academicTermId: assessmentTermId,
            studentId: { in: students.map((student) => student.id) },
          },
          select: { studentId: true, sProgramCode: true },
        })
      : null;
    const participantKeys = termParticipants
      ? new Set(termParticipants.map((item) => `${item.studentId}:${item.sProgramCode}`))
      : null;
    const eligibleStudents = participantKeys
      ? students.filter((student) => Boolean(
          student.sStudyProgramId && participantKeys.has(`${student.id}:${student.sStudyProgramId}`),
        ))
      : students;
    const programCodes = [...new Set(eligibleStudents.flatMap((item) => item.sStudyProgramId ? [item.sStudyProgramId] : []))];
    const programs = programCodes.length
      ? await prisma.trainingProgram.findMany({
          where: {
            sProgramCode: { in: programCodes },
            deletedAt: null,
            isActive: true,
            ...(facultyCode ? { s_faculty_code: facultyCode } : {}),
          },
          select: { id: true, sProgramCode: true, s_faculty_code: true },
        })
      : [];
    const trainingProgramIds = programs.map((program) => program.id);
    const cohortProgramPairs = trainingProgramIds.length
      ? await prisma.trainingProgressPlan.findMany({
          where: {
            cohortId: { in: applicableCohortIds },
            trainingProgramId: { in: trainingProgramIds },
          },
          select: { cohortId: true, trainingProgramId: true },
          distinct: ["cohortId", "trainingProgramId"],
        })
      : [];
    return deriveQd600EvaluationScopes({
      applicableCohortIds,
      facultyCode,
      classes,
      students: eligibleStudents,
      programs,
      cohortProgramPairs,
    });
  }

  static async runForFinalizedMainTerm(input: {
    termId: string;
    actorId?: string | null;
    facultyCode?: string | null;
    syncInterventions?: boolean;
  }) {
    const term = await prisma.academicTerm.findFirst({
      where: { id: input.termId, deletedAt: null },
    });
    if (!term) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
    try {
      assertAcademicWarningAssessmentTermAllowed({
        isCurrent: term.isCurrent,
        isSummer: term.sIsSummer,
        gradesFinalizedAt: term.gradesFinalizedAt,
      }, "OFFICIAL");
    } catch (error) {
      if (error instanceof AcademicTermResolutionError) {
        throw new ApiError(error.message, error.code, 422);
      }
      throw error;
    }

    const { policy, definition } = await findQd600Policy();
    if (definition.evaluationProfile !== "QD600_ARTICLE_18") {
      throw new ApiError("Selected policy is not QĐ600 Article 18", "QD600_POLICY_TYPE_REQUIRED", 422);
    }
    const scopes = await this.evaluationScopes(
      definition.regulatory.applicableCohortIds,
      input.facultyCode,
      term.id,
    );
    const results: Array<{
      cohortId: string;
      trainingProgramId: string;
      programCode: string;
      status: "completed" | "running" | "skipped" | "failed";
      runId: string | null;
      errorCode?: string;
      errorMessage?: string;
    }> = [];

    for (const scope of scopes) {
      const existingRuns = await prisma.academicWarningRun.findMany({
        where: {
          cohortId: scope.cohortId,
          trainingProgramId: scope.trainingProgramId,
          assessmentAcademicTermId: term.id,
          runMode: "OFFICIAL",
          executionProfile: QD600_EXECUTION_PROFILE,
          status: { in: ["completed", "running"] },
        },
        orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
      });
      const existing = existingRuns.find((run) => {
        if (run.status === "running") return true;
        const snapshot = run.sourceSnapshot;
        return snapshot !== null && !Array.isArray(snapshot) && typeof snapshot === "object" &&
          snapshot.engineVersion === QD600_RULE_ENGINE_VERSION;
      });
      const action = academicWarningRunAction(existing?.status);
      if (action === "SKIP_COMPLETED" || action === "SKIP_RUNNING") {
        // Một đợt đánh giá OFFICIAL đã tồn tại vẫn phải được đồng bộ vào
        // lịch sử can thiệp. Bỏ qua tính toán không có nghĩa là bỏ qua
        // cảnh báo của học kỳ đó.
        if (action === "SKIP_COMPLETED" && input.syncInterventions !== false) {
          await InterventionCasesService.syncInterventionCasesForRun(existing!.id);
        }
        results.push({
          ...scope,
          status: action === "SKIP_COMPLETED" ? "skipped" : "running",
          runId: existing!.id,
        });
        continue;
      }

      try {
        const run = await AcademicWarningsService.createRun({
          cohortId: scope.cohortId,
          trainingProgramId: scope.trainingProgramId,
          assessmentAcademicTermId: term.id,
          expectedAssessmentAcademicTermId: term.id,
          createdBy: input.actorId || null,
          runMode: "OFFICIAL",
          executionProfile: QD600_EXECUTION_PROFILE,
          policyId: policy.id,
          syncInterventions: input.syncInterventions,
        });
        results.push({ ...scope, status: run.status === "completed" ? "completed" : "running", runId: run.id });
      } catch (error) {
        results.push({
          ...scope,
          status: "failed",
          runId: null,
          errorCode: error instanceof ApiError ? error.code : "WARNING_EVALUATION_FAILED",
          errorMessage: error instanceof Error ? error.message : "Warning evaluation failed",
        });
      }
    }

    const completed = results.filter((item) => item.status === "completed").length;
    const skipped = results.filter((item) => item.status === "skipped" || item.status === "running").length;
    const failed = results.filter((item) => item.status === "failed").length;
    return {
      term: {
        id: term.id,
        termCode: term.sTermCode,
        termName: term.sTermName,
        gradesFinalizedAt: term.gradesFinalizedAt,
      },
      policy: { id: policy.id, version: policy.version, name: policy.name },
      scopeCount: scopes.length,
      completed,
      skipped,
      failed,
      status: failed ? (completed || skipped ? "partial_failure" : "failed") : "completed",
      results,
    };
  }

  /**
   * Backfill immutable OFFICIAL results for every past MAIN term that already
   * has imported term summaries. The configured current term is never inferred
   * as finalized because its grade data may still be partial.
   */
  static async reconcilePastTermsWithGrades(input: {
    actorId: string;
    facultyCode?: string | null;
  }) {
    const [terms, years] = await Promise.all([
      prisma.academicTerm.findMany({ where: { deletedAt: null } }),
      prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
    ]);
    const yearCodeById = new Map(years.map((year) => [year.id, year.sYearCode]));
    const normalizedTerms: WarningReconciliationTerm[] = terms.map((term) => ({
      id: term.id,
      academicYearId: term.academicYearId,
      academicYearCode: yearCodeById.get(term.academicYearId) || "",
      termOrder: term.sTermOrder,
      isSummer: term.sIsSummer,
      isCurrent: term.isCurrent,
      startDate: term.startDate,
      endDate: term.endDate,
    }));
    const mainTermIds = normalizedTerms.filter((term) => !term.isSummer).map((term) => term.id);
    const gradeEvidence = mainTermIds.length
      ? await prisma.studentTermSummary.groupBy({
          by: ["academicTermId"],
          where: { academicTermId: { in: mainTermIds } },
          _count: { _all: true },
          _max: { updatedAt: true },
        })
      : [];
    const evidenceByTerm = new Map(gradeEvidence.map((item) => [item.academicTermId, item]));
    const candidates = pastMainTermsWithGradeData(normalizedTerms, new Set(evidenceByTerm.keys()));
    const termById = new Map(terms.map((term) => [term.id, term]));
    const results = [];

    for (const candidate of candidates) {
      const term = termById.get(candidate.id)!;
      const evidence = evidenceByTerm.get(candidate.id)!;
      const inferredFinalizedAt = evidence._max.updatedAt || term.updatedAt;
      let autoFinalized = false;
      if (!term.gradesFinalizedAt) {
        await prisma.$transaction(async (tx) => {
          const updated = await tx.academicTerm.updateMany({
            where: { id: term.id, gradesFinalizedAt: null },
            data: { gradesFinalizedAt: inferredFinalizedAt },
          });
          if (updated.count) {
            autoFinalized = true;
            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                action: "academic_term.grades_auto_finalize",
                resourceType: "AcademicTerm",
                resourceId: term.id,
                details: {
                  source: "historical_student_term_summaries",
                  summaryCount: evidence._count._all,
                  gradesFinalizedAt: inferredFinalizedAt.toISOString(),
                  automaticWarningEvaluation: true,
                  evaluationFacultyCode: input.facultyCode || null,
                },
              },
            });
          }
        });
      }
      const evaluation = await this.runForFinalizedMainTerm({
        termId: term.id,
        actorId: input.actorId,
        facultyCode: input.facultyCode,
        // Mỗi học kỳ chính đã có điểm phải lưu cảnh báo của chính học kỳ đó.
        syncInterventions: true,
      });
      results.push({
        termId: term.id,
        termCode: term.sTermCode,
        academicYearCode: candidate.academicYearCode,
        summaryCount: evidence._count._all,
        autoFinalized,
        evaluation,
      });
    }

    return {
      eligibleTermCount: candidates.length,
      processedTermCount: results.length,
      completedScopeCount: results.reduce((sum, item) => sum + item.evaluation.completed, 0),
      skippedScopeCount: results.reduce((sum, item) => sum + item.evaluation.skipped, 0),
      failedScopeCount: results.reduce((sum, item) => sum + item.evaluation.failed, 0),
      results,
    };
  }

  static async finalizeGradesAndRun(input: {
    termId: string;
    academicYearId?: string;
    actorId: string;
    facultyCode?: string | null;
  }) {
    const term = await prisma.academicTerm.findFirst({
      where: {
        id: input.termId,
        deletedAt: null,
        ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
      },
    });
    if (!term) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
    if (term.sIsSummer) {
      throw new ApiError(
        "Học kỳ hè không thuộc phạm vi Cảnh báo sớm học vụ.",
        "SUMMER_EARLY_WARNING_NOT_ALLOWED",
        422,
      );
    }

    const finalizedAt = term.gradesFinalizedAt || new Date();
    if (!term.gradesFinalizedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.academicTerm.update({
          where: { id: term.id },
          data: { gradesFinalizedAt: finalizedAt },
        });
        await tx.auditLog.create({
          data: {
            actorId: input.actorId,
            action: "academic_term.grades_finalize",
            resourceType: "AcademicTerm",
            resourceId: term.id,
            details: {
              gradesFinalizedAt: finalizedAt.toISOString(),
              automaticWarningEvaluation: true,
              evaluationFacultyCode: input.facultyCode || null,
            },
          },
        });
      });
    }

    const evaluation = await this.runForFinalizedMainTerm({
      termId: term.id,
      actorId: input.actorId,
      facultyCode: input.facultyCode,
    });
    return {
      gradesFinalizedAt: finalizedAt,
      alreadyFinalized: Boolean(term.gradesFinalizedAt),
      evaluation,
    };
  }
}
