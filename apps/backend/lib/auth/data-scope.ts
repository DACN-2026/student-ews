import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/utils/api-response";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { requirePermission, type AuthResult } from "./authorize";
import type { Actor } from "./types";

function hasGlobalDataScope(actor: Actor) {
  const roles = new Set(actor.grants.map((grant) => grant.role));
  const scopes = new Set(actor.grants.map((grant) => grant.scope));
  return roles.has("admin") || scopes.has("system") || scopes.has("all_students");
}

async function facultyProgramIds(actor: Actor) {
  if (!actor.grants.some((grant) => grant.scope === "faculty")) return [];
  const lecturer = await prisma.lecturerProfile.findUnique({
    where: { userId: actor.userId },
    select: { facultyCode: true },
  });
  if (!lecturer?.facultyCode) return [];
  const programs = await prisma.trainingProgram.findMany({
    where: { s_faculty_code: lecturer.facultyCode, deletedAt: null, isActive: true },
    select: { id: true },
  });
  return programs.map((program) => program.id);
}

async function assignedCohortTerms(actor: Actor) {
  if (!actor.grants.some((grant) => grant.scope === "assigned_classes")) return [];
  const assignments = await prisma.classAdvisorAssignment.findMany({
    where: { userId: actor.userId, status: "active" },
    select: { classId: true, academicTermId: true },
  });
  const classes = await prisma.class.findMany({
    where: { id: { in: assignments.map((assignment) => assignment.classId) }, deletedAt: null },
    select: { id: true, cohortId: true },
  });
  const cohortByClass = new Map(classes.map((item) => [item.id, item.cohortId]));
  return assignments.flatMap((assignment) => {
    const cohortId = cohortByClass.get(assignment.classId);
    return cohortId ? [{ cohortId, academicTermId: assignment.academicTermId }] : [];
  });
}

export async function studentScopeWhere(actor: Actor): Promise<Prisma.StudentWhereInput> {
  const scopes = new Set(actor.grants.map((grant) => grant.scope));
  if (hasGlobalDataScope(actor)) return {};

  const alternatives: Prisma.StudentWhereInput[] = [];
  if (scopes.has("assigned_classes")) {
    const assignments = await prisma.classAdvisorAssignment.findMany({
      where: { userId: actor.userId, status: "active" },
      select: { classId: true },
    });
    const classes = await prisma.class.findMany({
      where: { id: { in: assignments.map((assignment) => assignment.classId) }, deletedAt: null },
      select: { classId: true },
    });
    alternatives.push({ sClassStudentId: { in: classes.map((item) => item.classId) } });
  }
  if (scopes.has("faculty")) {
    const lecturer = await prisma.lecturerProfile.findUnique({ where: { userId: actor.userId } });
    const programs = lecturer?.facultyCode
      ? await prisma.trainingProgram.findMany({
          where: { s_faculty_code: lecturer.facultyCode, deletedAt: null, isActive: true },
          select: { sProgramCode: true },
        })
      : [];
    alternatives.push({ sStudyProgramId: { in: programs.map((program) => program.sProgramCode) } });
  }
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function classScopeWhere(actor: Actor): Promise<Prisma.ClassWhereInput> {
  if (hasGlobalDataScope(actor)) return {};
  const scopes = new Set(actor.grants.map((grant) => grant.scope));
  const alternatives: Prisma.ClassWhereInput[] = [];

  if (scopes.has("assigned_classes")) {
    const assignments = await prisma.classAdvisorAssignment.findMany({
      where: { userId: actor.userId, status: "active", revokedAt: null },
      select: { classId: true },
    });
    const assignedClassIds = assignments.map((item) => item.classId);
    alternatives.push({ id: { in: assignedClassIds } });
  }

  if (scopes.has("faculty")) {
    const lecturer = await prisma.lecturerProfile.findUnique({
      where: { userId: actor.userId },
      select: { facultyCode: true },
    });
    if (lecturer?.facultyCode) {
      const programs = await prisma.trainingProgram.findMany({
        where: { s_faculty_code: lecturer.facultyCode, deletedAt: null, isActive: true },
        select: { sProgramCode: true },
      });
      const programCodes = programs.map((p) => p.sProgramCode);
      const facultyStudents = await prisma.student.findMany({
        where: { sStudyProgramId: { in: programCodes }, sClassStudentId: { not: null }, deletedAt: null },
        select: { sClassStudentId: true },
        distinct: ["sClassStudentId"],
      });
      const facultyClassCodes = facultyStudents
        .map((s) => s.sClassStudentId)
        .filter((code): code is string => Boolean(code));
      alternatives.push({ classId: { in: facultyClassCodes } });
    }
  }

  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function inaccessibleStudentTargetIndexes(
  actor: Actor,
  targets: Array<{ classStudentId?: string | null; studyProgramId?: string | null }>,
) {
  if (hasGlobalDataScope(actor)) return [];
  const scopes = new Set(actor.grants.map((grant) => grant.scope));
  const [assignments, programs] = await Promise.all([
    scopes.has("assigned_classes")
      ? prisma.classAdvisorAssignment.findMany({
          where: { userId: actor.userId, status: "active" },
          select: { classId: true },
        })
      : [],
    scopes.has("faculty")
      ? prisma.trainingProgram.findMany({
          where: { id: { in: await facultyProgramIds(actor) }, deletedAt: null, isActive: true },
          select: { sProgramCode: true },
        })
      : [],
  ]);
  const classes = assignments.length
    ? await prisma.class.findMany({
        where: { id: { in: assignments.map((assignment) => assignment.classId) }, deletedAt: null },
        select: { classId: true },
      })
    : [];
  const classCodes = new Set(classes.map((item) => item.classId));
  const programCodes = new Set(programs.map((item) => item.sProgramCode));
  return targets.flatMap((target, index) =>
    (target.classStudentId && classCodes.has(target.classStudentId)) ||
    (target.studyProgramId && programCodes.has(target.studyProgramId))
      ? []
      : [index],
  );
}

export async function progressPlanScopeWhere(actor: Actor): Promise<Prisma.TrainingProgressPlanWhereInput> {
  if (hasGlobalDataScope(actor)) return {};
  const [programIds, pairs] = await Promise.all([facultyProgramIds(actor), assignedCohortTerms(actor)]);
  const alternatives: Prisma.TrainingProgressPlanWhereInput[] = [];
  if (programIds.length) alternatives.push({ trainingProgramId: { in: programIds } });
  alternatives.push(...pairs.map((pair) => ({ cohortId: pair.cohortId, academicTermId: pair.academicTermId })));
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function completionRunScopeWhere(actor: Actor): Promise<Prisma.TrainingProgressCompletionRunWhereInput> {
  if (hasGlobalDataScope(actor)) return {};
  const [programIds, pairs] = await Promise.all([facultyProgramIds(actor), assignedCohortTerms(actor)]);
  const alternatives: Prisma.TrainingProgressCompletionRunWhereInput[] = [];
  if (programIds.length) alternatives.push({ trainingProgramId: { in: programIds } });
  alternatives.push(...pairs.map((pair) => ({
    cohortId: pair.cohortId,
    assessmentAcademicTermId: pair.academicTermId,
  })));
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function warningRunScopeWhere(actor: Actor): Promise<Prisma.AcademicWarningRunWhereInput> {
  if (hasGlobalDataScope(actor)) return {};
  const [programIds, pairs] = await Promise.all([facultyProgramIds(actor), assignedCohortTerms(actor)]);
  const alternatives: Prisma.AcademicWarningRunWhereInput[] = [];
  if (programIds.length) alternatives.push({ trainingProgramId: { in: programIds } });
  alternatives.push(...pairs.map((pair) => ({
    cohortId: pair.cohortId,
    assessmentAcademicTermId: pair.academicTermId,
  })));
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function graduationEvaluationScopeWhere(actor: Actor): Promise<Prisma.GraduationEvaluationWhereInput> {
  if (hasGlobalDataScope(actor)) return {};
  const [programIds, pairs] = await Promise.all([facultyProgramIds(actor), assignedCohortTerms(actor)]);
  const alternatives: Prisma.GraduationEvaluationWhereInput[] = [];
  if (programIds.length) alternatives.push({ trainingProgramId: { in: programIds } });
  alternatives.push(...pairs.map((pair) => ({
    cohortId: pair.cohortId,
    assessmentAcademicTermId: pair.academicTermId,
  })));
  return alternatives.length ? { OR: alternatives } : { id: { in: [] } };
}

export async function scopedClassIds(
  actor: Actor,
  academicTermId: string,
  cohortId: string,
  trainingProgramId: string,
): Promise<string[] | null> {
  if (hasGlobalDataScope(actor)) return null;
  const programIds = await facultyProgramIds(actor);
  if (programIds.includes(trainingProgramId)) return null;
  if (!actor.grants.some((grant) => grant.scope === "assigned_classes")) return [];
  const assignments = await prisma.classAdvisorAssignment.findMany({
    where: { userId: actor.userId, academicTermId, status: "active" },
    select: { classId: true },
  });
  const classes = await prisma.class.findMany({
    where: {
      id: { in: assignments.map((assignment) => assignment.classId) },
      cohortId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return classes.map((item) => item.id);
}

export async function runClassScopes(
  actor: Actor,
  runs: Array<{ id: string; academicTermId: string; cohortId: string; trainingProgramId: string }>,
) {
  const result = new Map<string, string[] | null>();
  if (hasGlobalDataScope(actor)) {
    for (const run of runs) result.set(run.id, null);
    return result;
  }
  const [programIds, assignments] = await Promise.all([
    facultyProgramIds(actor),
    actor.grants.some((grant) => grant.scope === "assigned_classes")
      ? prisma.classAdvisorAssignment.findMany({
          where: { userId: actor.userId, status: "active" },
          select: { classId: true, academicTermId: true },
        })
      : [],
  ]);
  const facultyPrograms = new Set(programIds);
  const classes = assignments.length
    ? await prisma.class.findMany({
        where: { id: { in: assignments.map((assignment) => assignment.classId) }, deletedAt: null },
        select: { id: true, cohortId: true },
      })
    : [];
  const cohortByClass = new Map(classes.map((item) => [item.id, item.cohortId]));
  for (const run of runs) {
    if (facultyPrograms.has(run.trainingProgramId)) {
      result.set(run.id, null);
      continue;
    }
    result.set(run.id, assignments.flatMap((assignment) =>
      assignment.academicTermId === run.academicTermId && cohortByClass.get(assignment.classId) === run.cohortId
        ? [assignment.classId]
        : [],
    ));
  }
  return result;
}

function scopedNotFound(message: string): AuthResult {
  return {
    authorized: false,
    response: errorResponse(message, "NOT_FOUND", 404),
  };
}

export async function requireProgressScopePermission(
  request: Request,
  scope: { cohortId: string; trainingProgramId: string; academicTermId: string },
  permission: string,
): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  if (hasGlobalDataScope(auth.actor)) return auth;
  const [programIds, pairs] = await Promise.all([facultyProgramIds(auth.actor), assignedCohortTerms(auth.actor)]);
  const allowed = programIds.includes(scope.trainingProgramId) || pairs.some((pair) =>
    pair.cohortId === scope.cohortId && pair.academicTermId === scope.academicTermId,
  );
  return allowed ? auth : scopedNotFound("Requested scope is not accessible");
}

export async function requirePlanPermission(request: Request, planId: string, permission: string): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const plan = await prisma.trainingProgressPlan.findFirst({
    where: { AND: [{ id: planId }, await progressPlanScopeWhere(auth.actor)] },
    select: { id: true },
  });
  return plan ? auth : scopedNotFound("Plan not found or outside data scope");
}

export async function requireProgramPermission(request: Request, programId: string, permission: string): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  if (hasGlobalDataScope(auth.actor)) return auth;
  const allowed = (await facultyProgramIds(auth.actor)).includes(programId);
  return allowed ? auth : scopedNotFound("Training program not found or outside data scope");
}

export async function requireProgressRunPermission(request: Request, runId: string, permission: string): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const run = await prisma.trainingProgressCalculationRun.findUnique({ where: { id: runId }, select: { planId: true } });
  if (!run) return scopedNotFound("Run not found or outside data scope");
  const plan = await prisma.trainingProgressPlan.findFirst({
    where: { AND: [{ id: run.planId }, await progressPlanScopeWhere(auth.actor)] },
    select: { id: true },
  });
  return plan ? auth : scopedNotFound("Run not found or outside data scope");
}

export async function requireCompletionRunPermission(request: Request, runId: string, permission: string): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const run = await prisma.trainingProgressCompletionRun.findFirst({
    where: { AND: [{ id: runId }, await completionRunScopeWhere(auth.actor)] },
    select: { id: true },
  });
  return run ? auth : scopedNotFound("Completion run not found or outside data scope");
}

export async function requireWarningRunPermission(request: Request, runId: string, permission: string): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const run = await prisma.academicWarningRun.findFirst({
    where: { AND: [{ id: runId }, await warningRunScopeWhere(auth.actor)] },
    select: { id: true },
  });
  return run ? auth : scopedNotFound("Warning run not found or outside data scope");
}

export async function requireGraduationEvaluationPermission(
  request: Request,
  evaluationId: string,
  permission: string,
): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const evaluation = await prisma.graduationEvaluation.findFirst({
    where: { AND: [{ id: evaluationId }, await graduationEvaluationScopeWhere(auth.actor)] },
    select: { id: true },
  });
  return evaluation ? auth : scopedNotFound("Graduation evaluation not found or outside data scope");
}

export async function progressRunClassScope(actor: Actor, runId: string) {
  const run = await prisma.trainingProgressCalculationRun.findUnique({
    where: { id: runId },
    select: { planId: true },
  });
  if (!run) return [];
  const plan = await prisma.trainingProgressPlan.findUnique({
    where: { id: run.planId },
    select: { academicTermId: true, cohortId: true, trainingProgramId: true },
  });
  return plan
    ? scopedClassIds(actor, plan.academicTermId, plan.cohortId, plan.trainingProgramId)
    : [];
}

export async function planClassScope(actor: Actor, planId: string) {
  const plan = await prisma.trainingProgressPlan.findUnique({
    where: { id: planId },
    select: { academicTermId: true, cohortId: true, trainingProgramId: true },
  });
  return plan
    ? scopedClassIds(actor, plan.academicTermId, plan.cohortId, plan.trainingProgramId)
    : [];
}

export async function completionRunClassScope(actor: Actor, runId: string) {
  const run = await prisma.trainingProgressCompletionRun.findUnique({
    where: { id: runId },
    select: { assessmentAcademicTermId: true, cohortId: true, trainingProgramId: true },
  });
  return run
    ? scopedClassIds(actor, run.assessmentAcademicTermId, run.cohortId, run.trainingProgramId)
    : [];
}

export async function warningRunClassScope(actor: Actor, runId: string) {
  const run = await prisma.academicWarningRun.findUnique({
    where: { id: runId },
    select: { assessmentAcademicTermId: true, cohortId: true, trainingProgramId: true },
  });
  return run
    ? scopedClassIds(actor, run.assessmentAcademicTermId, run.cohortId, run.trainingProgramId)
    : [];
}

export async function graduationEvaluationClassScope(actor: Actor, evaluationId: string) {
  const evaluation = await prisma.graduationEvaluation.findUnique({
    where: { id: evaluationId },
    select: { assessmentAcademicTermId: true, cohortId: true, trainingProgramId: true },
  });
  return evaluation
    ? scopedClassIds(actor, evaluation.assessmentAcademicTermId, evaluation.cohortId, evaluation.trainingProgramId)
    : [];
}

export async function requireStudentPermission(
  request: Request,
  studentIdentifier: string,
  permission: string,
): Promise<AuthResult> {
  const auth = await requirePermission(permission, request);
  if (!auth.authorized) return auth;
  const scope = await studentScopeWhere(auth.actor);
  const student = await prisma.student.findFirst({
    where: { AND: [{ ...studentIdWhere(studentIdentifier), deletedAt: null }, scope] },
    select: { id: true },
  });
  if (!student) {
    return {
      authorized: false,
      response: errorResponse("Student not found or outside data scope", "NOT_FOUND", 404),
    };
  }
  return auth;
}
