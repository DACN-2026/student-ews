import { academicOfferingPredicate } from "../academic-course-sql";
import { loadAcademicDebt } from "./academic-debt";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { ApiError } from "@/lib/utils/api-error";
import { sha256Hex } from "@/lib/utils/crypto";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import {
  evaluateAcademicWarning,
  evaluateSummerMonitoring,
  warningDataStatusFromStored,
  warningPresentationState,
  normalizeWarningBusinessStatus,
  type SummerMonitoringSource,
  type WarningCompletionSource as CompletionSource,
  type WarningConductSource as ConductSource,
  type WarningDecisionSource as DecisionSource,
  type WarningProgressSource as ProgressSource,
  type WarningStudentSource as StudentSource,
  type WarningSummarySource as SummarySource,
} from "@/lib/services/academic-warning-rules";
import {
  academicWarningPolicyDefinitionHash,
  assertPolicyDefinitionMutable,
  assertPolicyExecutable,
  createAcademicWarningPolicySnapshot,
  createLegacyAdvisoryPolicyDefinition,
  normalizeAcademicWarningPolicyInput,
  parseAcademicWarningPolicyDefinition,
  PolicyDefinitionError,
} from "@/lib/services/academic-warning-policy";
import {
  createAcademicWarningCapabilitySnapshot,
  createQd600StudentCapabilityData,
  type AssessmentTermCourseAttempt,
} from "@/lib/services/academic-warning-capabilities";
import {
  evaluateQd600ForCohort,
  QD600_EXECUTION_PROFILE,
  QD600_RULE_ENGINE_VERSION,
  resolveQd600PolicyApplicability,
  type Qd600EvaluationResult,
  type Qd600PolicyApplicability,
  type Qd600RuleEvaluation,
} from "@/lib/services/academic-warning-qd600-rules";
import { EARLY_WARNING_CASE_TYPE, InterventionCasesService } from "@/lib/services/intervention-cases";
import { loadWarningActionHistory } from "./warning-action-history";
import { assertCohortTrainingProgramPair } from "@/lib/services/academic-warning-scope";
import { calculateAcademicWarningProgressSignals } from "@/lib/services/academic-warning-progress";
import {
  AcademicTermResolutionError,
  assertAcademicWarningAssessmentTermAllowed,
  resolvePreviousMainAssessmentTerm,
  type AcademicWarningRunMode,
} from "@/lib/academic-terms";

export type AcademicWarningExecutionProfile = "LEGACY_SCALAR_RULES" | typeof QD600_EXECUTION_PROFILE;

type AcademicWarningRunPolicyContract = {
  executionProfile?: string;
  runMode?: AcademicWarningRunMode;
  policyId?: string;
  cohortId: string | null;
  policy: {
    id: string;
    status: string;
    policyDefinition: unknown;
  } | null;
};

export function resolveAcademicWarningExecutionProfile(value?: string): AcademicWarningExecutionProfile {
  if (value === undefined || value === "LEGACY_SCALAR_RULES") return "LEGACY_SCALAR_RULES";
  if (value === QD600_EXECUTION_PROFILE) return QD600_EXECUTION_PROFILE;
  throw new ApiError("Unsupported academic warning execution profile", "INVALID_EXECUTION_PROFILE", 422);
}

/**
 * Validate the explicit execution contract before any run context is loaded.
 * QĐ600 remains a controlled partial-regulatory profile backed by a draft
 * definition; it is not the default and can never be inferred from policyId.
 */
export function validateAcademicWarningRunPolicyContract(input: AcademicWarningRunPolicyContract) {
  const executionProfile = resolveAcademicWarningExecutionProfile(input.executionProfile);
  const definition = input.policy ? parsePolicyDefinitionOrThrow(input.policy.policyDefinition) : null;

  if (executionProfile === QD600_EXECUTION_PROFILE) {
    if (input.runMode !== "OFFICIAL") {
      throw new ApiError(
        "QĐ600 partial regulatory runs require explicit runMode OFFICIAL",
        "QD600_RUN_MODE_REQUIRED",
        422,
      );
    }
    if (!input.policyId) {
      throw new ApiError("policyId is required for a controlled QĐ600 run", "QD600_POLICY_REQUIRED", 422);
    }
    if (!input.policy) {
      throw new ApiError("Selected QĐ600 policy was not found", "QD600_POLICY_NOT_FOUND", 404);
    }
    if (definition?.evaluationProfile !== "QD600_ARTICLE_18") {
      throw new ApiError(
        "Selected policy is not a QĐ600 Điều 18 definition",
        "QD600_POLICY_TYPE_REQUIRED",
        422,
      );
    }
    // QĐ600 is intentionally not globally active. A draft definition is the
    // only lifecycle state accepted by this explicit controlled run profile.
    if (input.policy.status !== "draft") {
      throw new ApiError(
        "QĐ600 partial regulatory runs require a draft policy definition",
        "QD600_POLICY_LIFECYCLE_INVALID",
        422,
      );
    }
    const applicability = resolveQd600PolicyApplicability(definition, input.cohortId);
    if (applicability.status !== "APPLICABLE") {
      throw new ApiError(
        "Selected QĐ600 policy is not explicitly configured for this cohort",
        applicability.reasonCode || "REGULATORY_POLICY_NOT_APPLICABLE",
        422,
      );
    }
    return { executionProfile, definition, applicability };
  }

  if (definition?.evaluationProfile === "QD600_ARTICLE_18") {
    throw new ApiError(
      "QĐ600 policy requires explicit executionProfile QD600_PARTIAL_REGULATORY",
      "QD600_EXECUTION_PROFILE_REQUIRED",
      422,
    );
  }
  return { executionProfile, definition, applicability: null };
}

function asAcademicTermApiError(error: unknown): never {
  if (error instanceof AcademicTermResolutionError) {
    throw new ApiError(error.message, error.code, 422);
  }
  throw error;
}

export function sanitizeWarningSourceSnapshot(
  snapshot: Prisma.JsonValue,
  allowedClassIds?: string[] | null,
): Prisma.JsonValue {
  if (allowedClassIds === undefined || allowedClassIds === null) return snapshot;
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const source = snapshot as Prisma.JsonObject;
  const students = Array.isArray(source.students) ? source.students : [];
  const allowed = new Set(allowedClassIds);
  return {
    ...source,
    students: students.filter((item) => {
      if (!item || Array.isArray(item) || typeof item !== "object") return false;
      const classId = (item as Prisma.JsonObject).classId;
      return typeof classId === "string" && allowed.has(classId);
    }),
    scopeRestriction: {
      type: "assigned_classes",
      classIds: allowedClassIds,
    },
  };
}

export function projectQd600EvaluationForPersistence(result: Qd600EvaluationResult) {
  const debtRegulatoryBreach = result.rules.some((rule) => rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS" && rule.isThresholdBreached);
  const actionableRules = result.rules.filter((rule) => (rule.isThresholdBreached || rule.isNearThreshold)
    && !(debtRegulatoryBreach && rule.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK"));
  const maxSeverity = result.businessStatus === "VERIFY_REQUIRED" || result.businessStatus === "HIGH_RISK"
    ? "high"
    : result.businessStatus === "MONITORING"
      ? "medium"
      : "none";
  const titleForRule = (rule: Qd600RuleEvaluation) => {
    if (rule.ruleCode === "QD600_FAILED_CREDIT_RATIO") return "Không đạt quá nhiều tín chỉ trong học kỳ";
    if (rule.ruleCode === "QD600_CUMULATIVE_GPA_BY_YEAR") return "Điểm trung bình tích lũy (GPA) dưới chuẩn năm học";
    if (rule.ruleCode === "QD600_TERM_GPA") return "Điểm trung bình học kỳ (GPA) thấp";
    if (rule.ruleCode === "QD600_ACCUMULATED_DEBT_CREDITS" || rule.ruleCode === "ACCUMULATED_DEBT_CREDIT_RISK") return `Nợ tín chỉ tích lũy ${rule.observedValue ?? 0} tín chỉ`;
    if (rule.ruleCode === "TRAINING_PROGRESS_CREDIT_DEFICIT") {
      return `Chậm tiến độ học tập ${rule.observedValue ?? 0} tín chỉ`;
    }
    return "Điểm GPA tích lũy tiệm cận mức nguy cơ";
  };
  return {
    businessStatus: normalizeWarningBusinessStatus(result.businessStatus),
    regulatoryCoverage: result.regulatoryCoverage.status,
    maxSeverity,
    reasonCount: actionableRules.length,
    dataError: result.regulatoryCoverage.status === "FULL"
      ? null
      : `qd600_regulatory_coverage_${result.regulatoryCoverage.status.toLowerCase()}`,
    ruleResults: result.rules,
    reasons: actionableRules.map((rule) => ({
      reasonCode: rule.reasonCode || rule.ruleCode,
      severity: rule.sourceType === "REGULATORY" || rule.riskLevel === "RED" ? "high" : "medium",
      title: titleForRule(rule),
      details: {
        ...rule,
        businessStatus: normalizeWarningBusinessStatus(result.businessStatus),
        regulatoryCoverage: result.regulatoryCoverage.status,
        executionProfile: result.executionProfile,
        engineVersion: result.engineVersion,
      },
      sourceType: rule.ruleCode === "TRAINING_PROGRESS_CREDIT_DEFICIT"
        ? "training_progress_completion_run"
        : rule.sourceType,
      sourceId: null,
    })),
  };
}

export async function findLatestOfficialWarningResult(studentId: string) {
  const [candidates, mainTerms] = await Promise.all([
    prisma.academicWarningStudentResult.findMany({
      where: { studentId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.academicTerm.findMany({
      where: { deletedAt: null, sIsSummer: false },
      select: { id: true },
    }),
  ]);
  if (!candidates.length || !mainTerms.length) return null;
  const officialRuns = await prisma.academicWarningRun.findMany({
    where: {
      id: { in: [...new Set(candidates.map((result) => result.runId))] },
      status: "completed",
      runMode: "OFFICIAL",
      assessmentAcademicTermId: { in: mainTerms.map((term) => term.id) },
    },
    select: { id: true },
  });
  const officialRunIds = new Set(officialRuns.map((run) => run.id));
  const result = candidates.find((result) => officialRunIds.has(result.runId));
  return result ? { ...result, businessStatus: normalizeWarningBusinessStatus(result.businessStatus) } : null;
}

async function loadAssessmentTermCourseAttempts(
  studentIds: string[],
  programCode: string,
  assessmentTermId: string,
) {
  const attempts = new Map<string, AssessmentTermCourseAttempt[]>();
  if (!studentIds.length) return attempts;

  const rows: Array<{
    student_id: string;
    offering_id: string;
    academic_term_id: string;
    credits: number;
    score_status: string | null;
    has_final_grade: boolean;
    is_pass: boolean | null;
    special_code: string | null;
    course_code: string;
    course_name: string;
  }> = await prisma.$queryRaw`
    SELECT o.student_id::text, o.id::text AS offering_id, o.academic_term_id::text,
           o.s_credits AS credits, o.s_curriculum_id AS course_code, o.s_course_name AS course_name, g.score_status, g.special_code,
           (g.offering_id IS NOT NULL AND (
             (g.score_status = 'graded' AND
               (g.score_10 IS NOT NULL OR g.score_4 IS NOT NULL OR NULLIF(BTRIM(g.letter_code), '') IS NOT NULL))
             OR (g.score_status = 'special' AND UPPER(BTRIM(COALESCE(g.special_code, ''))) = 'VT' AND NOT g.not_score)
           )) AS has_final_grade,
           g.is_pass
    FROM student_course_offerings o
    LEFT JOIN student_course_grades g ON g.offering_id = o.id
    WHERE o.academic_term_id = ${assessmentTermId}::uuid
      AND o.s_program_code = ${programCode}
      AND o.student_id = ANY(${studentIds}::uuid[])
    ORDER BY o.student_id, o.id
  `;
  for (const row of rows) {
    const studentAttempts = attempts.get(row.student_id) || [];
    studentAttempts.push({
      offeringId: row.offering_id,
      academicTermId: row.academic_term_id,
      credits: Number(row.credits),
      scoreStatus: row.score_status,
      hasFinalGrade: row.has_final_grade,
      isPass: row.is_pass,
      specialCode: row.special_code,
      courseCode: row.course_code,
      courseName: row.course_name,
    });
    attempts.set(row.student_id, studentAttempts);
  }
  return attempts;
}

// ============================================================================
// DB Context Loader (ported from SWE service.go loadContext())
// ============================================================================

async function loadWarningContext(
  cohortId: string,
  trainingProgramId: string,
  assessmentTermId: string,
  policyId?: string,
  requireLegacyProgressSnapshots = true,
) {
  const policy = policyId
    ? await prisma.academicWarningPolicy.findUnique({ where: { id: policyId } })
    : await prisma.academicWarningPolicy.findFirst({
        where: { status: "active" },
        orderBy: { version: "desc" },
      });
  if (!policy) throw new Error("No active academic warning policy found");

  // Get program code
  const program = await prisma.trainingProgram.findUnique({ where: { id: trainingProgramId } });
  if (!program) throw new Error("Training program not found");

  // Find latest completed completion run
  const completionRun: any[] = await prisma.$queryRaw`
    SELECT r.id::text FROM training_progress_completion_runs r
    WHERE r.cohort_id = ${cohortId}::uuid AND r.training_program_id = ${trainingProgramId}::uuid
      AND r.assessment_academic_term_id = ${assessmentTermId}::uuid AND r.status = 'completed'
    ORDER BY r.completed_at DESC NULLS LAST, r.id DESC LIMIT 1
  `;
  if (completionRun.length === 0 && requireLegacyProgressSnapshots) {
    throw new Error("No completed completion run found. Run a completion evaluation first.");
  }
  const completionRunId = completionRun[0]?.id || null;

  // Find latest completed progress run
  const progressRun: any[] = await prisma.$queryRaw`
    SELECT r.id::text FROM training_progress_calculation_runs r
    JOIN training_progress_plans p ON p.id = r.plan_id
    WHERE p.cohort_id = ${cohortId}::uuid AND p.training_program_id = ${trainingProgramId}::uuid
      AND p.academic_term_id = ${assessmentTermId}::uuid AND p.status = 'locked' AND p.is_current
      AND r.status = 'completed'
    ORDER BY r.completed_at DESC NULLS LAST, r.id DESC LIMIT 1
  `;
  if (progressRun.length === 0 && requireLegacyProgressSnapshots) {
    throw new Error("No completed progress calculation run found. Run a calculation first.");
  }
  const progressRunId = progressRun[0]?.id || null;

  // Load students
  const studentRows: any[] = await prisma.$queryRaw`
    SELECT s.id::text, COALESCE(c.id::text,'') as class_uuid, COALESCE(c.cohort_id::text,'') as cohort_uuid,
           s.s_student_id, s.s_full_name, COALESCE(c.class_id,'') as class_code, COALESCE(c.class_name,'') as class_name,
           COALESCE(s.s_study_program_id,'') as program_code
    FROM students s
    LEFT JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    WHERE s.s_study_program_id = ${program.sProgramCode} AND s.deleted_at IS NULL
      AND c.cohort_id = ${cohortId}::uuid
      AND EXISTS (
        SELECT 1
        FROM student_term_summaries sts
        WHERE sts.student_id = s.id
          AND sts.academic_term_id = ${assessmentTermId}::uuid
          AND sts.s_program_code = ${program.sProgramCode}
      )
    ORDER BY s.s_student_id
  `;

  const students: StudentSource[] = studentRows.map((r) => ({
    id: r.id,
    classId: r.class_uuid || null,
    cohortId: r.cohort_uuid || null,
    code: r.s_student_id,
    name: r.s_full_name,
    classCode: r.class_code,
    className: r.class_name,
    programCode: r.program_code,
  }));

  const studentIds = students.map((s) => s.id);

  // Load progress results
  const progress = new Map<string, ProgressSource>();
  if (studentIds.length > 0 && progressRunId) {
    const progRows: any[] = await prisma.$queryRaw`
      SELECT student_id::text, status FROM training_progress_student_results
      WHERE run_id = ${progressRunId}::uuid AND student_id = ANY(${studentIds}::uuid[])
    `;
    for (const r of progRows) {
      progress.set(r.student_id, { status: r.status, runId: progressRunId });
    }
  }

  // Load completion results
  const completion = new Map<string, CompletionSource>();
  if (studentIds.length > 0 && completionRunId) {
    const compRows: Array<{
      student_id: string;
      schedule_status: string;
      data_error_reason: string | null;
      pending_result_courses: number;
      credit_deficit: number | null;
    }> = await prisma.$queryRaw`
      SELECT sr.student_id::text, sr.schedule_status, sr.data_error_reason, sr.pending_result_courses,
             CASE
               WHEN sr.data_error_reason IS NOT NULL OR sr.schedule_status = 'data_error' THEN NULL
               WHEN sr.pending_result_courses > 0 OR sr.schedule_status = 'pending_result' THEN NULL
               ELSE
                 COALESCE((
                   SELECT SUM(cr.s_credits)
                   FROM training_progress_completion_plan_results pr
                   JOIN training_progress_completion_course_results cr ON cr.plan_result_id = pr.id
                   WHERE pr.student_result_id = sr.id AND pr.is_due
                     AND cr.requirement_type = 'mandatory' AND NOT cr.passed AND NOT cr.pending_result
                 ), 0)
                 + COALESCE((
                   SELECT SUM(pr.missing_elective_credits)
                   FROM training_progress_completion_plan_results pr
                   WHERE pr.student_result_id = sr.id AND pr.is_due
                 ), 0)
             END AS credit_deficit
      FROM training_progress_completion_student_results sr
      WHERE sr.run_id = ${completionRunId}::uuid AND sr.student_id = ANY(${studentIds}::uuid[])
    `;
    for (const r of compRows) {
      const hasDataError = Boolean(r.data_error_reason) || r.schedule_status === "data_error";
      const hasPendingResult = Number(r.pending_result_courses) > 0 || r.schedule_status === "pending_result";
      completion.set(r.student_id, {
        scheduleStatus: r.schedule_status,
        runId: completionRunId,
        creditDeficit: r.credit_deficit == null ? null : Number(r.credit_deficit),
        dataStatus: hasDataError ? "INSUFFICIENT" : hasPendingResult ? "PARTIAL" : "COMPLETE",
        reasonCode: hasDataError
          ? r.data_error_reason || "TRAINING_PROGRESS_DATA_ERROR"
          : hasPendingResult ? "TRAINING_PROGRESS_PENDING_RESULTS" : null,
      });
    }
  }

  // Load term summaries
  const summaries = new Map<string, SummarySource>();
  const cumulativeCredits = new Map<string, number | null>();
  const firstMainTermIds = new Map<string, string>();
  if (studentIds.length > 0) {
    const sumRows: any[] = await prisma.$queryRaw`
      SELECT s.id::text, s.student_id::text, s.registered_credits, s.gpa_4, s.gpa_10,
             COALESCE(c.cumulative_credits, s.cumulative_credits) AS cumulative_credits,
             COALESCE(c.cumulative_gpa_4, s.cumulative_gpa_4) AS cumulative_gpa_4,
             COALESCE(c.cumulative_gpa_10, s.cumulative_gpa_10) AS cumulative_gpa_10,
             c.id::text AS cumulative_summary_id
      FROM student_term_summaries s
      LEFT JOIN student_cumulative_summaries c
        ON c.student_id = s.student_id AND c.s_program_code = s.s_program_code
       AND c.source_academic_term_id = s.academic_term_id
      WHERE s.academic_term_id = ${assessmentTermId}::uuid
        AND s.s_program_code = ${program.sProgramCode}
        AND s.student_id = ANY(${studentIds}::uuid[])
    `;
    for (const r of sumRows) {
      cumulativeCredits.set(r.student_id, r.cumulative_credits != null ? Number(r.cumulative_credits) : null);
      summaries.set(r.student_id, {
        termSummaryId: r.id,
        cumulativeSummaryId: r.cumulative_summary_id || null,
        registered: r.registered_credits != null ? Number(r.registered_credits) : null,
        termGPA4: r.gpa_4 != null ? Number(r.gpa_4) : null,
        termGPA10: r.gpa_10 != null ? Number(r.gpa_10) : null,
        cumulativeGPA4: r.cumulative_gpa_4 != null ? Number(r.cumulative_gpa_4) : null,
        cumulativeGPA10: r.cumulative_gpa_10 != null ? Number(r.cumulative_gpa_10) : null,
      });
    }
    const firstTermRows: Array<{ student_id: string; academic_term_id: string }> = await prisma.$queryRaw`
      SELECT DISTINCT ON (s.student_id) s.student_id::text, s.academic_term_id::text
      FROM student_term_summaries s
      JOIN academic_terms t ON t.id = s.academic_term_id AND t.deleted_at IS NULL AND NOT t.s_is_summer
      JOIN academic_years y ON y.id = t.academic_year_id AND y.deleted_at IS NULL
      JOIN cohorts co ON co.id = ${cohortId}::uuid
      WHERE s.student_id = ANY(${studentIds}::uuid[])
        AND co.s_cohort_code ~ '^K[0-9]+$'
        AND LEFT(y.s_year_code, 4)::int = 1976 + SUBSTRING(co.s_cohort_code FROM 2)::int
        AND t.s_term_order = 1
      ORDER BY s.student_id, y.s_year_code, t.s_term_order, t.id
    `;
    for (const row of firstTermRows) firstMainTermIds.set(row.student_id, row.academic_term_id);
  }
  const assessmentTermCourseAttempts = await loadAssessmentTermCourseAttempts(
    studentIds,
    program.sProgramCode,
    assessmentTermId,
  );
  const trainingProgressSignals = await calculateAcademicWarningProgressSignals({
    students,
    cohortId,
    trainingProgramId,
    assessmentTermId,
    programCode: program.sProgramCode,
  });

  // Load academic warning decisions
  const decisions = new Map<string, DecisionSource[]>();
  if (studentIds.length > 0) {
    const decRows: any[] = await prisma.$queryRaw`
      SELECT d.student_id::text, d.id::text, COALESCE(d.s_decision_number,'') as num, COALESCE(d.s_decision_name,'') as name,
             COALESCE(d.s_full_text,'') as full_text, d.s_sign_date
      FROM student_decisions d
      JOIN academic_terms t ON t.id = d.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE d.student_id = ANY(${studentIds}::uuid[]) AND d.deleted_at IS NULL AND d.is_academic_warning
        AND (y.s_year_code < (SELECT y2.s_year_code FROM academic_terms t2 JOIN academic_years y2 ON y2.id = t2.academic_year_id WHERE t2.id = ${assessmentTermId}::uuid)
          OR (y.s_year_code = (SELECT y2.s_year_code FROM academic_terms t2 JOIN academic_years y2 ON y2.id = t2.academic_year_id WHERE t2.id = ${assessmentTermId}::uuid)
            AND t.s_term_order <= (SELECT t2.s_term_order FROM academic_terms t2 WHERE t2.id = ${assessmentTermId}::uuid)))
      ORDER BY d.student_id, d.s_sign_date DESC NULLS LAST
    `;
    for (const r of decRows) {
      const arr = decisions.get(r.student_id) || [];
      arr.push({ id: r.id, number: r.num, name: r.name, fullText: r.full_text, signDate: r.s_sign_date });
      decisions.set(r.student_id, arr);
    }
  }

  const conduct = new Map<string, ConductSource>();
  if (studentIds.length > 0) {
    const conductRows: Array<{ id: string; student_id: string; last_score: unknown; status_id: string }> = await prisma.$queryRaw`
      SELECT id::text, student_id::text, last_score, status_id
      FROM student_conduct_records
      WHERE academic_term_id = ${assessmentTermId}::uuid
        AND student_id = ANY(${studentIds}::uuid[])
        AND status_id = '1' AND last_score IS NOT NULL
    `;
    for (const row of conductRows) {
      conduct.set(row.student_id, { id: row.id, score: Number(row.last_score), statusId: row.status_id });
    }
  }

  const [progressRunSource, completionRunSource] = await Promise.all([
    progressRunId
      ? prisma.trainingProgressCalculationRun.findUnique({
          where: { id: progressRunId },
          select: { sourceSnapshotHash: true, sourceCapturedAt: true, completedAt: true },
        })
      : null,
    completionRunId
      ? prisma.trainingProgressCompletionRun.findUnique({
          where: { id: completionRunId },
          select: {
            sourceSnapshotHash: true,
            sourceCapturedAt: true,
            completedAt: true,
            evaluationMode: true,
            evaluation_scope: true,
          },
        })
      : null,
  ]);

  return {
    policy,
    program,
    completionRunId,
    progressRunId,
    progressRunSource,
    completionRunSource,
    students,
    progress,
    completion,
    summaries,
    decisions,
    conduct,
    summerMonitoring: new Map<string, SummerMonitoringSource>(),
    cumulativeCredits,
    firstMainTermIds,
    assessmentTermCourseAttempts,
    academicDebt: await loadAcademicDebt(studentIds, trainingProgramId, assessmentTermId),
    trainingProgressSignals,
  };
}

async function loadSummerMonitoringContext(
  cohortId: string,
  trainingProgramId: string,
  assessmentTermId: string,
) {
  const [policy, program] = await Promise.all([
    prisma.academicWarningPolicy.findFirst({
      where: { status: "active" },
      orderBy: { version: "desc" },
    }),
    prisma.trainingProgram.findUnique({ where: { id: trainingProgramId } }),
  ]);
  if (!policy) throw new ApiError("No active academic warning policy found", "WARNING_POLICY_REQUIRED", 422);
  if (!program) throw new ApiError("Training program not found", "NOT_FOUND", 404);

  const studentRows: Array<{
    id: string; class_uuid: string; cohort_uuid: string; s_student_id: string; s_full_name: string;
    class_code: string; class_name: string; program_code: string;
  }> = await prisma.$queryRaw`
    SELECT s.id::text, COALESCE(c.id::text,'') as class_uuid, COALESCE(c.cohort_id::text,'') as cohort_uuid,
           s.s_student_id, s.s_full_name, COALESCE(c.class_id,'') as class_code, COALESCE(c.class_name,'') as class_name,
           COALESCE(s.s_study_program_id,'') as program_code
    FROM students s
    LEFT JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    WHERE s.s_study_program_id = ${program.sProgramCode} AND s.deleted_at IS NULL
      AND c.cohort_id = ${cohortId}::uuid
    ORDER BY s.s_student_id
  `;
  const students: StudentSource[] = studentRows.map((row) => ({
    id: row.id,
    classId: row.class_uuid || null,
    cohortId: row.cohort_uuid || null,
    code: row.s_student_id,
    name: row.s_full_name,
    classCode: row.class_code,
    className: row.class_name,
    programCode: row.program_code,
  }));
  const studentIds = students.map((student) => student.id);
  const summaries = new Map<string, SummarySource>();
  const summerMonitoring = new Map<string, SummerMonitoringSource>();
  const cumulativeCredits = new Map<string, number | null>();
  const firstMainTermIds = new Map<string, string>();

  if (studentIds.length) {
    const [summaryRows, monitoringRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        id: string; student_id: string; registered_credits: unknown; gpa_4: unknown; gpa_10: unknown;
        cumulative_credits: unknown; cumulative_gpa_4: unknown; cumulative_gpa_10: unknown;
      }>>`
        SELECT id::text, student_id::text, registered_credits, gpa_4, gpa_10,
               cumulative_credits, cumulative_gpa_4, cumulative_gpa_10
        FROM student_term_summaries
        WHERE academic_term_id = ${assessmentTermId}::uuid
          AND s_program_code = ${program.sProgramCode}
          AND student_id = ANY(${studentIds}::uuid[])
      `,
      prisma.$queryRaw<Array<{
        student_id: string; offering_count: bigint; registered_credits: bigint;
        pending_results: bigint; failed_courses: bigint;
      }>>`
        SELECT o.student_id::text,
               COUNT(*) AS offering_count,
               COALESCE(SUM(o.s_credits) FILTER (WHERE ${academicOfferingPredicate}), 0) AS registered_credits,
               COUNT(*) FILTER (WHERE g.offering_id IS NULL OR g.score_status = 'pending') AS pending_results,
               COUNT(*) FILTER (WHERE g.offering_id IS NOT NULL AND g.score_status <> 'pending' AND NOT g.is_pass) AS failed_courses
        FROM student_course_offerings o
        LEFT JOIN student_course_grades g ON g.offering_id = o.id
        WHERE o.academic_term_id = ${assessmentTermId}::uuid
          AND o.student_id = ANY(${studentIds}::uuid[])
        GROUP BY o.student_id
      `,
    ]);
    for (const row of summaryRows) {
      cumulativeCredits.set(row.student_id, row.cumulative_credits == null ? null : Number(row.cumulative_credits));
      summaries.set(row.student_id, {
        termSummaryId: row.id,
        cumulativeSummaryId: null,
        registered: row.registered_credits == null ? null : Number(row.registered_credits),
        termGPA4: row.gpa_4 == null ? null : Number(row.gpa_4),
        termGPA10: row.gpa_10 == null ? null : Number(row.gpa_10),
        cumulativeGPA4: row.cumulative_gpa_4 == null ? null : Number(row.cumulative_gpa_4),
        cumulativeGPA10: row.cumulative_gpa_10 == null ? null : Number(row.cumulative_gpa_10),
      });
    }
    for (const row of monitoringRows) {
      summerMonitoring.set(row.student_id, {
        offeringCount: Number(row.offering_count),
        registeredCredits: Number(row.registered_credits),
        pendingResults: Number(row.pending_results),
        failedCourses: Number(row.failed_courses),
      });
    }
  }
  const assessmentTermCourseAttempts = await loadAssessmentTermCourseAttempts(
    studentIds,
    program.sProgramCode,
    assessmentTermId,
  );

  return {
    policy,
    program,
    completionRunId: null,
    progressRunId: null,
    progressRunSource: null,
    completionRunSource: null,
    students,
    progress: new Map<string, ProgressSource>(),
    completion: new Map<string, CompletionSource>(),
    summaries,
    decisions: new Map<string, DecisionSource[]>(),
    conduct: new Map<string, ConductSource>(),
    summerMonitoring,
    cumulativeCredits,
    firstMainTermIds,
    assessmentTermCourseAttempts,
    academicDebt: await loadAcademicDebt(studentIds, trainingProgramId, assessmentTermId),
    trainingProgressSignals: new Map(),
  };
}

function parsePolicyDefinitionOrThrow(value: unknown) {
  try {
    return parseAcademicWarningPolicyDefinition(value);
  } catch (error) {
    if (error instanceof PolicyDefinitionError) {
      throw new ApiError(error.message, error.code, 422);
    }
    throw error;
  }
}

function warningPolicyView(policy: Prisma.AcademicWarningPolicyGetPayload<Record<string, never>>) {
  const definition = parsePolicyDefinitionOrThrow(policy.policyDefinition);
  return {
    id: policy.id,
    name: policy.name,
    schemaVersion: policy.schemaVersion,
    engineVersion: policy.engineVersion,
    evaluationProfile: definition.evaluationProfile,
    executionMode: definition.executionMode,
    policyDefinition: policy.policyDefinition,
    definitionHash: policy.definitionHash,
    termGpaThreshold: Number(policy.termGpaThreshold),
    cumulativeGpaThreshold: Number(policy.cumulativeGpaThreshold),
    conductScoreThreshold: Number(policy.conductScoreThreshold),
    policyVersion: policy.version,
    version: policy.version,
    status: policy.status,
    createdBy: policy.createdBy,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

// ============================================================================
// Service Class
// ============================================================================

export class AcademicWarningsService {
  static async scopeRunItems<TRun extends {
    id: string;
    totalStudents: number;
    warningStudents: number;
    mediumStudents: number;
    highStudents: number;
  }>(items: TRun[], classScopes: Map<string, string[] | null>) {
    const restricted = items.filter((item) => classScopes.get(item.id) !== null);
    if (!restricted.length) return items;
    const results = await prisma.academicWarningStudentResult.findMany({
      where: { runId: { in: restricted.map((item) => item.id) } },
      select: { runId: true, classId: true, maxSeverity: true, reasonCount: true },
    });
    return items.map((item) => {
      const scope = classScopes.get(item.id);
      if (scope === null) return item;
      const allowed = new Set(scope || []);
      const scoped = results.filter((result) => result.runId === item.id && result.classId && allowed.has(result.classId));
      return {
        ...item,
        totalStudents: scoped.length,
        warningStudents: scoped.filter((result) => result.reasonCount > 0).length,
        mediumStudents: scoped.filter((result) => result.maxSeverity === "medium").length,
        highStudents: scoped.filter((result) => result.maxSeverity === "high").length,
      };
    });
  }


  // ===================== Policy CRUD =====================

  static async listPolicies() {
    const policies = await prisma.academicWarningPolicy.findMany({
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    });
    return policies.map(warningPolicyView);
  }

  static async createPolicy(data: {
    name: string;
    policyDefinition?: unknown;
    definition?: unknown;
    termGpaThreshold?: number;
    cumulativeGpaThreshold?: number;
    conductScoreThreshold?: number;
    status?: string;
  }, actorId?: string | null) {
    const name = (data.name || "").trim();
    if (!name) throw new ApiError("Policy name is required", "INVALID_REQUEST", 400);
    let normalized: ReturnType<typeof normalizeAcademicWarningPolicyInput>;
    try {
      normalized = normalizeAcademicWarningPolicyInput(data);
    } catch (error) {
      if (error instanceof PolicyDefinitionError) throw new ApiError(error.message, error.code, 422);
      throw error;
    }
    const { definition, termGpaThreshold, cumulativeGpaThreshold, conductScoreThreshold } = normalized;
    const status = data.status || (definition.evaluationProfile === "LEGACY_ADVISORY" ? "active" : "draft");
    if (!["draft", "active"].includes(status)) {
      throw new ApiError("Unsupported policy status", "INVALID_STATUS", 400);
    }
    if (status === "active") {
      try {
        assertPolicyExecutable(definition);
      } catch (error) {
        if (error instanceof PolicyDefinitionError) throw new ApiError(error.message, error.code, 422);
        throw error;
      }
    }
    const executionThresholds = definition.evaluationProfile === "LEGACY_ADVISORY"
      ? definition.thresholds
      : null;

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('academic_warning_policy_version'))`;
      const latest = await tx.academicWarningPolicy.findFirst({ orderBy: { version: "desc" } });
      const nextVersion = (latest?.version || 0) + 1;
      if (status === "active") {
        await tx.academicWarningPolicy.updateMany({
          where: { status: "active" },
          data: { status: "archived", updatedAt: new Date() },
        });
      }
      const created = await tx.academicWarningPolicy.create({
        data: {
          name,
          schemaVersion: definition.schemaVersion,
          engineVersion: definition.engineVersion,
          policyDefinition: definition as unknown as Prisma.InputJsonValue,
          definitionHash: academicWarningPolicyDefinitionHash(definition),
          termGpaThreshold: executionThresholds?.termGpa4Below ?? termGpaThreshold,
          cumulativeGpaThreshold: executionThresholds?.cumulativeGpa4Below ?? cumulativeGpaThreshold,
          conductScoreThreshold: executionThresholds?.conductScoreBelow ?? conductScoreThreshold,
          version: nextVersion,
          status,
          createdBy: actorId || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actorId || null,
          action: status === "active" ? "warning_policy.activate" : "warning_policy.create",
          resourceType: "AcademicWarningPolicy",
          resourceId: created.id,
          details: {
            policyVersion: created.version,
            evaluationProfile: definition.evaluationProfile,
            executionMode: definition.executionMode,
            schemaVersion: definition.schemaVersion,
            engineVersion: definition.engineVersion,
            definitionHash: created.definitionHash,
            status,
          },
        },
      });
      return warningPolicyView(created);
    });
  }

  static async updatePolicy(
    policyId: string,
    data: {
      name?: string;
      policyDefinition?: unknown;
      definition?: unknown;
      termGpaThreshold?: number;
      cumulativeGpaThreshold?: number;
      conductScoreThreshold?: number;
      status?: string;
    },
    actorId?: string | null,
  ) {
    const current = await prisma.academicWarningPolicy.findUnique({ where: { id: policyId } });
    if (!current) throw new ApiError("Policy not found", "NOT_FOUND", 404);
    const completedOfficialRunCount = await prisma.academicWarningRun.count({
      where: { policyId, status: "completed", runMode: "OFFICIAL" },
    });
    try {
      assertPolicyDefinitionMutable({ completedOfficialRunCount });
    } catch (error) {
      if (error instanceof PolicyDefinitionError) throw new ApiError(error.message, error.code, 422);
      throw error;
    }
    const currentDefinition = parsePolicyDefinitionOrThrow(current.policyDefinition);
    const suppliedDefinition = data.policyDefinition ?? data.definition;
    const definition = suppliedDefinition === undefined && currentDefinition.evaluationProfile === "LEGACY_ADVISORY"
      ? createLegacyAdvisoryPolicyDefinition({
          label: data.name?.trim() || currentDefinition.advisory.label,
          description: currentDefinition.advisory.description,
          engineVersion: currentDefinition.engineVersion,
          termGpaThreshold: data.termGpaThreshold ?? Number(current.termGpaThreshold),
          cumulativeGpaThreshold: data.cumulativeGpaThreshold ?? Number(current.cumulativeGpaThreshold),
          conductScoreThreshold: data.conductScoreThreshold ?? Number(current.conductScoreThreshold),
        })
      : suppliedDefinition === undefined
        ? currentDefinition
        : parsePolicyDefinitionOrThrow(suppliedDefinition);
    const status = data.status || current.status;
    if (!["draft", "active", "archived"].includes(status)) {
      throw new ApiError("Unsupported policy status", "INVALID_STATUS", 400);
    }
    if (status === "active") {
      try {
        assertPolicyExecutable(definition);
      } catch (error) {
        if (error instanceof PolicyDefinitionError) throw new ApiError(error.message, error.code, 422);
        throw error;
      }
    }
    const executionThresholds = definition.evaluationProfile === "LEGACY_ADVISORY"
      ? definition.thresholds
      : null;
    const updated = await prisma.$transaction(async (tx) => {
      if (status === "active") {
        await tx.academicWarningPolicy.updateMany({
          where: { status: "active", id: { not: current.id } },
          data: { status: "archived", updatedAt: new Date() },
        });
      }
      const result = await tx.academicWarningPolicy.update({
        where: { id: current.id },
        data: {
          name: data.name?.trim() || current.name,
          schemaVersion: definition.schemaVersion,
          engineVersion: definition.engineVersion,
          policyDefinition: definition as unknown as Prisma.InputJsonValue,
          definitionHash: academicWarningPolicyDefinitionHash(definition),
          termGpaThreshold: executionThresholds?.termGpa4Below ?? data.termGpaThreshold ?? current.termGpaThreshold,
          cumulativeGpaThreshold: executionThresholds?.cumulativeGpa4Below ?? data.cumulativeGpaThreshold ?? current.cumulativeGpaThreshold,
          conductScoreThreshold: executionThresholds?.conductScoreBelow ?? data.conductScoreThreshold ?? current.conductScoreThreshold,
          status,
          updatedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actorId || null,
          action: "warning_policy.update",
          resourceType: "AcademicWarningPolicy",
          resourceId: result.id,
          details: {
            policyVersion: result.version,
            evaluationProfile: definition.evaluationProfile,
            executionMode: definition.executionMode,
            definitionHash: result.definitionHash,
          },
        },
      });
      return result;
    });
    return warningPolicyView(updated);
  }

  // ===================== REAL Warning Run Engine =====================

  static async listRuns(
    cohortId?: string,
    trainingProgramId?: string,
    termId?: string,
    academicYearId?: string,
    status?: string,
    page = 1,
    pageSize = 20,
    scope: Prisma.AcademicWarningRunWhereInput = {},
  ) {
    const where: Prisma.AcademicWarningRunWhereInput = { AND: [scope] };
    if (cohortId) where.cohortId = cohortId;
    if (trainingProgramId) where.trainingProgramId = trainingProgramId;
    if (termId) where.assessmentAcademicTermId = termId;
    if (academicYearId) {
      const terms = await prisma.academicTerm.findMany({
        where: { academicYearId, deletedAt: null },
        select: { id: true },
      });
      const termIds = terms.map((term) => term.id);
      where.assessmentAcademicTermId = termId && termIds.includes(termId) ? termId : { in: termIds };
    }
    if (status) where.status = status;

    const [total, runs] = await Promise.all([
      prisma.academicWarningRun.count({ where }),
      prisma.academicWarningRun.findMany({
        where,
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Enrich with cohort/program/term names
    const cohortIds = [...new Set(runs.map((r) => r.cohortId))];
    const programIds = [...new Set(runs.map((r) => r.trainingProgramId))];
    const termIds = [...new Set(runs.map((r) => r.assessmentAcademicTermId))];

    const [cohorts, programs, terms, years] = await Promise.all([
      prisma.cohort.findMany({ where: { id: { in: cohortIds } } }),
      prisma.trainingProgram.findMany({ where: { id: { in: programIds } } }),
      prisma.academicTerm.findMany({ where: { id: { in: termIds } } }),
      prisma.academicYear.findMany({ where: { deletedAt: null } }),
    ]);

    const cohortMap = Object.fromEntries(cohorts.map((c) => [c.id, c]));
    const programMap = Object.fromEntries(programs.map((p) => [p.id, p]));
    const termMap = Object.fromEntries(terms.map((t) => [t.id, t]));
    const yearMap = Object.fromEntries(years.map((year) => [year.id, year]));

    return {
      items: runs.map((r) => ({
        id: r.id,
        cohortId: r.cohortId,
        cohortCode: cohortMap[r.cohortId]?.sCohortCode,
        trainingProgramId: r.trainingProgramId,
        programCode: programMap[r.trainingProgramId]?.sProgramCode,
        assessmentAcademicTermId: r.assessmentAcademicTermId,
        termCode: termMap[r.assessmentAcademicTermId]?.sTermCode,
        assessmentTermCode: termMap[r.assessmentAcademicTermId]?.sTermCode,
        assessmentAcademicYear: yearMap[termMap[r.assessmentAcademicTermId]?.academicYearId]?.sYearCode || null,
        isSummer: Boolean(termMap[r.assessmentAcademicTermId]?.sIsSummer),
        runMode: r.runMode,
        executionProfile: r.executionProfile,
        isOfficial: r.runMode === "OFFICIAL" && !termMap[r.assessmentAcademicTermId]?.sIsSummer,
        policyId: r.policyId,
        policyVersion: r.policyVersion,
        completionRunId: r.completionRunId,
        progressRunId: r.progressRunId,
        status: r.status,
        totalStudents: r.totalStudents,
        warningStudents: r.warningStudents,
        mediumStudents: r.mediumStudents,
        highStudents: r.highStudents,
        errorMessage: r.errorMessage,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        sourceSnapshotHash: r.sourceSnapshotHash,
        sourceCapturedAt: r.sourceCapturedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  static async resolveRunAssessmentTerm(data: {
    assessmentAcademicTermId?: string;
    runMode?: AcademicWarningRunMode;
  }) {
    const runMode: AcademicWarningRunMode = data.runMode === "SUMMER_MONITORING" ? "SUMMER_MONITORING" : "OFFICIAL";
    if (data.assessmentAcademicTermId) {
      const assessmentTerm = await prisma.academicTerm.findFirst({
        where: { id: data.assessmentAcademicTermId, deletedAt: null },
      });
      if (!assessmentTerm) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
      try {
        assertAcademicWarningAssessmentTermAllowed({
          isCurrent: assessmentTerm.isCurrent,
          isSummer: assessmentTerm.sIsSummer,
          gradesFinalizedAt: assessmentTerm.gradesFinalizedAt,
        }, runMode);
      } catch (error) {
        asAcademicTermApiError(error);
      }
      const year = await prisma.academicYear.findFirst({
        where: { id: assessmentTerm.academicYearId, deletedAt: null },
        select: { sYearCode: true },
      });
      return { runMode, selectionMode: "EXPLICIT" as const, assessmentTerm, currentMainTerm: null, academicYearCode: year?.sYearCode || null };
    }

    if (runMode === "SUMMER_MONITORING") {
      throw new ApiError(
        "assessmentAcademicTermId is required for summer monitoring",
        "INVALID_REQUEST",
        400,
      );
    }

    const [terms, years] = await Promise.all([
      prisma.academicTerm.findMany({ where: { deletedAt: null } }),
      prisma.academicYear.findMany({ where: { deletedAt: null }, select: { id: true, sYearCode: true } }),
    ]);
    const yearCodes = new Map(years.map((year) => [year.id, year.sYearCode]));
    try {
      const resolved = resolvePreviousMainAssessmentTerm(terms.map((term) => ({
        id: term.id,
        academicYearId: term.academicYearId,
        academicYearCode: yearCodes.get(term.academicYearId) || "",
        termOrder: term.sTermOrder,
        isSummer: term.sIsSummer,
        isCurrent: term.isCurrent,
        gradesFinalizedAt: term.gradesFinalizedAt,
        startDate: term.startDate,
        endDate: term.endDate,
        source: term,
      })));
      assertAcademicWarningAssessmentTermAllowed({
        isCurrent: resolved.assessmentTerm.source.isCurrent,
        isSummer: resolved.assessmentTerm.source.sIsSummer,
        gradesFinalizedAt: resolved.assessmentTerm.source.gradesFinalizedAt,
      }, runMode);
      return {
        runMode,
        selectionMode: "AUTO_PREVIOUS_MAIN" as const,
        assessmentTerm: resolved.assessmentTerm.source,
        currentMainTerm: resolved.currentMainTerm.source,
        academicYearCode: resolved.assessmentTerm.academicYearCode,
        currentAcademicYearCode: resolved.currentMainTerm.academicYearCode,
      };
    } catch (error) {
      asAcademicTermApiError(error);
    }
  }

  static async createRun(data: {
    cohortId: string;
    trainingProgramId: string;
    assessmentAcademicTermId?: string;
    expectedAssessmentAcademicTermId?: string;
    createdBy?: string | null;
    runMode?: AcademicWarningRunMode;
    executionProfile?: AcademicWarningExecutionProfile;
    policyId?: string;
    syncInterventions?: boolean;
  }) {
    if (!data.cohortId || !data.trainingProgramId) {
      throw new Error("cohortId and trainingProgramId are required");
    }

    await assertCohortTrainingProgramPair({
      cohortId: data.cohortId,
      trainingProgramId: data.trainingProgramId,
    });

    const executionProfile = resolveAcademicWarningExecutionProfile(data.executionProfile);
    if (executionProfile === QD600_EXECUTION_PROFILE && !data.policyId) {
      throw new ApiError("policyId is required for a controlled QĐ600 run", "QD600_POLICY_REQUIRED", 422);
    }
    const requestedPolicy = data.policyId
      ? await prisma.academicWarningPolicy.findUnique({ where: { id: data.policyId } })
      : null;
    validateAcademicWarningRunPolicyContract({
      executionProfile: data.executionProfile,
      runMode: data.runMode,
      policyId: data.policyId,
      cohortId: data.cohortId,
      policy: requestedPolicy,
    });
    const resolvedTerm = await this.resolveRunAssessmentTerm(data);
    const assessmentTerm = resolvedTerm.assessmentTerm;
    const assessmentAcademicTermId = assessmentTerm.id;
    if (data.expectedAssessmentAcademicTermId && data.expectedAssessmentAcademicTermId !== assessmentAcademicTermId) {
      throw new ApiError(
        "Academic term configuration changed while the warning run was being authorized. Please retry.",
        "ACADEMIC_TERM_CONFIGURATION_CHANGED",
        409,
      );
    }
    const runMode = resolvedTerm.runMode;
    // Official runs require locked progress snapshots. Summer monitoring reads
    // registrations and grade outcomes directly because summer has no plan or
    // minimum-credit requirement of its own.
    const ctx = runMode === "SUMMER_MONITORING"
      ? await loadSummerMonitoringContext(data.cohortId, data.trainingProgramId, assessmentAcademicTermId)
      : await loadWarningContext(
          data.cohortId,
          data.trainingProgramId,
          assessmentAcademicTermId,
          data.policyId,
          executionProfile === "LEGACY_SCALAR_RULES",
        );

    const storedDefinition = parsePolicyDefinitionOrThrow(ctx.policy.policyDefinition);
    let definition: ReturnType<typeof parseAcademicWarningPolicyDefinition>;
    if (executionProfile === QD600_EXECUTION_PROFILE) {
      const validatedContract = validateAcademicWarningRunPolicyContract({
        executionProfile: data.executionProfile,
        runMode: data.runMode,
        policyId: data.policyId,
        cohortId: data.cohortId,
        policy: {
          id: ctx.policy.id,
          status: ctx.policy.status,
          policyDefinition: ctx.policy.policyDefinition,
        },
      });
      if (!validatedContract.definition || validatedContract.definition.evaluationProfile !== "QD600_ARTICLE_18") {
        throw new ApiError("Validated QĐ600 policy definition is unavailable", "QD600_POLICY_TYPE_REQUIRED", 422);
      }
      definition = validatedContract.definition;
    } else {
      try {
        assertPolicyExecutable(storedDefinition);
      } catch (error) {
        if (error instanceof PolicyDefinitionError) throw new ApiError(error.message, error.code, 422);
        throw error;
      }
      definition = createLegacyAdvisoryPolicyDefinition({
        label: storedDefinition.advisory.label,
        description: storedDefinition.advisory.description,
        engineVersion: ctx.policy.engineVersion,
        termGpaThreshold: Number(ctx.policy.termGpaThreshold),
        cumulativeGpaThreshold: Number(ctx.policy.cumulativeGpaThreshold),
        conductScoreThreshold: Number(ctx.policy.conductScoreThreshold),
      });
    }
    const policySnapshot = createAcademicWarningPolicySnapshot({
      id: ctx.policy.id,
      name: ctx.policy.name,
      policyVersion: ctx.policy.version,
      definition,
    });

    const capabilitySnapshot = createAcademicWarningCapabilitySnapshot({ debtVerified: true });
    const capabilityDataByStudent = new Map(ctx.students.map((student) => [
      student.id,
      createQd600StudentCapabilityData({
        debt: ctx.academicDebt.get(student.id),
        cumulativeCredits: ctx.cumulativeCredits.get(student.id) ?? null,
        assessmentTermId: assessmentAcademicTermId,
        attempts: ctx.assessmentTermCourseAttempts.get(student.id) || [],
        isFirstMainSemester: ctx.firstMainTermIds.get(student.id) === assessmentAcademicTermId
          ? true
          : ctx.firstMainTermIds.has(student.id) ? false : null,
      }),
    ]));
    const qd600Evaluations = new Map<string, {
      applicability: Qd600PolicyApplicability;
      result: Qd600EvaluationResult | null;
    }>();
    if (executionProfile === QD600_EXECUTION_PROFILE && definition.evaluationProfile === "QD600_ARTICLE_18") {
      for (const student of ctx.students) {
        qd600Evaluations.set(student.id, evaluateQd600ForCohort({
          cohortId: student.cohortId,
          policyDefinition: definition,
          capabilities: capabilitySnapshot,
          capabilityData: capabilityDataByStudent.get(student.id)!,
          termGpa4: ctx.summaries.get(student.id)?.termGPA4 ?? null,
          cumulativeGpa4: ctx.summaries.get(student.id)?.cumulativeGPA4 ?? null,
          termKind: assessmentTerm.sIsSummer ? "SUMMER" : "MAIN",
          trainingProgress: ctx.trainingProgressSignals.has(student.id)
            ? {
                creditDeficit: ctx.trainingProgressSignals.get(student.id)?.creditDeficit ?? null,
                dataStatus: ctx.trainingProgressSignals.get(student.id)?.dataStatus || "INSUFFICIENT",
                reasonCode: ctx.trainingProgressSignals.get(student.id)?.reasonCode || null,
                runId: ctx.trainingProgressSignals.get(student.id)!.sourceId,
                expectedCreditsToDate: ctx.trainingProgressSignals.get(student.id)?.expectedCreditsToDate ?? null,
                earnedCreditsToDate: ctx.trainingProgressSignals.get(student.id)?.earnedCreditsToDate ?? null,
              }
            : null,
        }));
      }
    }
    const qd600CoverageCounts = executionProfile === QD600_EXECUTION_PROFILE
      ? Object.fromEntries(["FULL", "PARTIAL", "INSUFFICIENT"].map((status) => [
          status,
          [...qd600Evaluations.values()].filter((evaluation) => status === "INSUFFICIENT"
            ? !evaluation.result || evaluation.result.regulatoryCoverage.status === status
            : evaluation.result?.regulatoryCoverage.status === status).length,
        ]))
      : null;

    const sourceCapturedAt = new Date();
    const sourceSnapshot = {
      schemaVersion: 5,
      runMode,
      executionProfile,
      engineVersion: executionProfile === QD600_EXECUTION_PROFILE
        ? QD600_RULE_ENGINE_VERSION
        : definition.engineVersion,
      scope: {
        cohortId: data.cohortId,
        trainingProgramId: data.trainingProgramId,
        assessmentAcademicTermId,
      },
      policy: policySnapshot,
      capabilities: capabilitySnapshot,
      regulatoryCoverage: qd600CoverageCounts == null ? null : {
        status: qd600CoverageCounts.INSUFFICIENT > 0
          ? "INSUFFICIENT"
          : qd600CoverageCounts.PARTIAL > 0
            ? "PARTIAL"
            : "FULL",
        studentCounts: qd600CoverageCounts,
        fullEvaluationClaimed: qd600CoverageCounts.PARTIAL === 0 && qd600CoverageCounts.INSUFFICIENT === 0,
      },
      progressRun: {
        id: ctx.progressRunId,
        sourceSnapshotHash: ctx.progressRunSource?.sourceSnapshotHash || null,
        sourceCapturedAt: ctx.progressRunSource?.sourceCapturedAt?.toISOString() || null,
        completedAt: ctx.progressRunSource?.completedAt?.toISOString() || null,
      },
      completionRun: {
        id: ctx.completionRunId,
        sourceSnapshotHash: ctx.completionRunSource?.sourceSnapshotHash || null,
        sourceCapturedAt: ctx.completionRunSource?.sourceCapturedAt?.toISOString() || null,
        completedAt: ctx.completionRunSource?.completedAt?.toISOString() || null,
        evaluationMode: ctx.completionRunSource?.evaluationMode || null,
        evaluationScope: ctx.completionRunSource?.evaluation_scope || null,
      },
      students: ctx.students.map((student) => ({
        id: student.id,
        code: student.code,
        name: student.name,
        classId: student.classId,
        classCode: student.classCode,
        cohortId: student.cohortId,
        programCode: student.programCode,
        termSummary: ctx.summaries.get(student.id) || null,
        progress: ctx.progress.get(student.id) || null,
        completion: ctx.completion.get(student.id) || null,
        decisions: (ctx.decisions.get(student.id) || []).map((decision) => ({
          ...decision,
          signDate: decision.signDate?.toISOString() || null,
        })),
        conduct: ctx.conduct.get(student.id) || null,
        summerMonitoring: ctx.summerMonitoring.get(student.id) || null,
        qd600CapabilityData: {
          ...capabilityDataByStudent.get(student.id)!,
          trainingProgress: ctx.trainingProgressSignals.get(student.id) || null,
          usedForEvaluation: executionProfile === QD600_EXECUTION_PROFILE,
        },
        qd600Applicability: qd600Evaluations.get(student.id)?.applicability || null,
      })),
    };
    const sourceSnapshotHash = sha256Hex(JSON.stringify(sourceSnapshot));

    const runData: Prisma.AcademicWarningRunCreateInput = {
      cohortId: data.cohortId,
      trainingProgramId: data.trainingProgramId,
      assessmentAcademicTermId,
      policyId: ctx.policy.id,
      policyVersion: ctx.policy.version,
      completionRunId: ctx.completionRunId,
      progressRunId: ctx.progressRunId,
      runMode,
      executionProfile,
      sourceSnapshot: sourceSnapshot as Prisma.InputJsonValue,
      sourceSnapshotHash,
      sourceCapturedAt,
      createdBy: data.createdBy || null,
      status: "running",
      startedAt: new Date(),
    };

    // An OFFICIAL evaluation is immutable once completed. Serialize the small
    // claim step per assessment term + internal scope so repeated finalization,
    // retry clicks, or concurrent requests reuse the existing run. Failed runs
    // are deliberately excluded so a later retry can create a new attempt.
    const claimed = runMode === "OFFICIAL"
      ? await prisma.$transaction(async (tx) => {
          const claimKey = `academic-warning:${assessmentAcademicTermId}:${data.cohortId}:${data.trainingProgramId}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claimKey}))`;
          const existingRuns = await tx.academicWarningRun.findMany({
            where: {
              cohortId: data.cohortId,
              trainingProgramId: data.trainingProgramId,
              assessmentAcademicTermId,
              runMode: "OFFICIAL",
              executionProfile,
              status: { in: ["running", "completed"] },
            },
            orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
          });
          const existing = existingRuns.find((candidate) => {
            if (candidate.status === "running" || executionProfile !== QD600_EXECUTION_PROFILE) return true;
            const snapshot = candidate.sourceSnapshot;
            return snapshot !== null && !Array.isArray(snapshot) && typeof snapshot === "object" &&
              snapshot.engineVersion === QD600_RULE_ENGINE_VERSION;
          });
          if (existing) return { run: existing, shouldEvaluate: false as const };
          return {
            run: await tx.academicWarningRun.create({ data: runData }),
            shouldEvaluate: true as const,
          };
        })
      : {
          run: await prisma.academicWarningRun.create({ data: runData }),
          shouldEvaluate: true as const,
        };
    if (!claimed.shouldEvaluate) return claimed.run;
    const run = claimed.run;

    let totalWarning = 0, totalMedium = 0, totalHigh = 0;
    const groups = new Map<string, { code: string; name: string; total: number; warnings: number; medium: number; high: number }>();
    const studentRows: Prisma.AcademicWarningStudentResultCreateManyInput[] = [];
    const reasonRows: Prisma.AcademicWarningReasonCreateManyInput[] = [];

    for (const student of ctx.students) {
      const summary = ctx.summaries.get(student.id);
      const qd600Evaluation = qd600Evaluations.get(student.id);
      const legacyEvaluation = executionProfile === "LEGACY_SCALAR_RULES"
        ? runMode === "SUMMER_MONITORING"
          ? evaluateSummerMonitoring({
              student,
              summary,
              monitoring: ctx.summerMonitoring.get(student.id),
            })
          : evaluateAcademicWarning({
              student,
              progress: ctx.progress.get(student.id),
              completion: ctx.completion.get(student.id),
              summary,
              decisions: ctx.decisions.get(student.id),
              policy: {
                termGpaThreshold: Number(ctx.policy.termGpaThreshold),
                cumulativeGpaThreshold: Number(ctx.policy.cumulativeGpaThreshold),
                conductScoreThreshold: Number(ctx.policy.conductScoreThreshold),
              },
              conduct: ctx.conduct.get(student.id),
            })
        : null;
      const qd600Projection = qd600Evaluation?.result
        ? projectQd600EvaluationForPersistence(qd600Evaluation.result)
        : executionProfile === QD600_EXECUTION_PROFILE
          ? {
              businessStatus: "INSUFFICIENT_DATA" as const,
              regulatoryCoverage: "INSUFFICIENT" as const,
              maxSeverity: "none",
              reasonCount: 0,
              dataError: qd600Evaluation?.applicability.reasonCode || "REGULATORY_POLICY_COHORT_UNRESOLVED",
              ruleResults: [] as Qd600RuleEvaluation[],
              reasons: [],
            }
          : null;
      const businessStatus = qd600Projection?.businessStatus || warningPresentationState({
        maxSeverity: legacyEvaluation!.maxSeverity,
        reasonCount: legacyEvaluation!.reasonCount,
        dataStatus: legacyEvaluation!.dataStatus,
      });
      const maxSeverity = qd600Projection?.maxSeverity || legacyEvaluation!.maxSeverity;
      const reasonCount = qd600Projection?.reasonCount ?? legacyEvaluation!.reasonCount;
      const persistedReasons = qd600Projection?.reasons || legacyEvaluation!.reasons;
      const studentResultId = crypto.randomUUID();
      studentRows.push({
        id: studentResultId,
        runId: run.id,
        studentId: student.id,
        classId: student.classId,
        cohortId: student.cohortId,
        sStudentId: student.code,
        sStudentName: student.name,
        sClassName: student.className || null,
        sProgramCode: student.programCode || null,
        termRegisteredCredits: qd600Projection
          ? capabilityDataByStudent.get(student.id)!.failedCreditCalculation.registeredCredits
          : legacyEvaluation!.termRegisteredCredits,
        termGpa4: summary?.termGPA4 ?? legacyEvaluation?.termGPA4 ?? null,
        termGpa10: summary?.termGPA10 ?? legacyEvaluation?.termGPA10 ?? null,
        cumulativeGpa4: summary?.cumulativeGPA4 ?? legacyEvaluation?.cumulativeGPA4 ?? null,
        cumulativeGpa10: summary?.cumulativeGPA10 ?? legacyEvaluation?.cumulativeGPA10 ?? null,
        registrationStatus: qd600Projection
          ? ctx.progress.get(student.id)?.status || "unavailable"
          : legacyEvaluation!.registrationStatus,
        scheduleStatus: qd600Projection
          ? ctx.completion.get(student.id)?.scheduleStatus || "unavailable"
          : legacyEvaluation!.scheduleStatus,
        academicWarningDecisions: qd600Projection
          ? (ctx.decisions.get(student.id) || []).length
          : legacyEvaluation!.academicWarningDecisions,
        maxSeverity,
        reasonCount,
        dataError: qd600Projection ? qd600Projection.dataError : legacyEvaluation!.dataError,
        businessStatus,
        regulatoryCoverage: qd600Projection?.regulatoryCoverage || null,
        ruleResults: (qd600Projection?.ruleResults || []) as unknown as Prisma.InputJsonValue,
      });

      for (const reason of persistedReasons) {
        reasonRows.push({
          id: crypto.randomUUID(),
          studentResultId,
          reasonCode: reason.reasonCode,
          severity: reason.severity,
          title: reason.title,
          details: reason.details as Prisma.InputJsonValue,
          sourceType: reason.sourceType,
          sourceId: reason.sourceId,
        });
      }

      // Accumulate counts
      if (reasonCount > 0) totalWarning++;
      if (maxSeverity === "medium") totalMedium++;
      if (maxSeverity === "high") totalHigh++;

      // Accumulate class groups
      if (student.classId) {
        let group = groups.get(student.classId);
        if (!group) {
          group = { code: student.classCode, name: student.className, total: 0, warnings: 0, medium: 0, high: 0 };
          groups.set(student.classId, group);
        }
        group.total++;
        if (reasonCount > 0) group.warnings++;
        if (maxSeverity === "medium") group.medium++;
        if (maxSeverity === "high") group.high++;
      }
    }

    const groupRows: Prisma.AcademicWarningGroupResultCreateManyInput[] = [];
    for (const [classId, group] of groups) {
      groupRows.push({
        id: crypto.randomUUID(),
        runId: run.id,
        groupType: "class",
        groupId: classId,
        groupCode: group.code,
        groupName: group.name,
        totalStudents: group.total,
        warningStudents: group.warnings,
        mediumStudents: group.medium,
        highStudents: group.high,
      });
    }

    let completedRun;
    try {
      completedRun = await prisma.$transaction(async (tx) => {
        if (studentRows.length) await tx.academicWarningStudentResult.createMany({ data: studentRows });
        if (reasonRows.length) await tx.academicWarningReason.createMany({ data: reasonRows });
        if (groupRows.length) await tx.academicWarningGroupResult.createMany({ data: groupRows });
        return tx.academicWarningRun.update({
          where: { id: run.id },
          data: {
            totalStudents: ctx.students.length,
            warningStudents: totalWarning,
            mediumStudents: totalMedium,
            highStudents: totalHigh,
            status: "completed",
            completedAt: new Date(),
          },
        });
      });
    } catch (error) {
      await prisma.academicWarningRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Warning calculation failed",
          completedAt: new Date(),
        },
      });
      throw error;
    }
    if (runMode === "OFFICIAL" && data.syncInterventions !== false) {
      await InterventionCasesService.syncInterventionCasesForRun(run.id);
    }
    return completedRun;
  }

  // ===================== Run Detail =====================

  static async getRunDetail(runId: string, allowedClassIds?: string[] | null) {
    const run = await prisma.academicWarningRun.findUnique({ where: { id: runId } });
    if (!run) return null;

    // Enrich with names
    const [cohort, program, term, policy] = await Promise.all([
      prisma.cohort.findUnique({ where: { id: run.cohortId } }),
      prisma.trainingProgram.findUnique({ where: { id: run.trainingProgramId } }),
      prisma.academicTerm.findUnique({ where: { id: run.assessmentAcademicTermId } }),
      run.policyId ? prisma.academicWarningPolicy.findUnique({ where: { id: run.policyId } }) : null,
    ]);

    const scopedResults = allowedClassIds !== undefined && allowedClassIds !== null
      ? await prisma.academicWarningStudentResult.findMany({
          where: { runId, classId: { in: allowedClassIds } },
          select: { maxSeverity: true, reasonCount: true },
        })
      : null;
    return {
      id: run.id,
      cohortId: run.cohortId,
      cohortCode: cohort?.sCohortCode,
      trainingProgramId: run.trainingProgramId,
      programCode: program?.sProgramCode,
      assessmentAcademicTermId: run.assessmentAcademicTermId,
      termCode: term?.sTermCode,
      isSummer: Boolean(term?.sIsSummer),
      runMode: run.runMode,
      executionProfile: run.executionProfile,
      isOfficial: run.runMode === "OFFICIAL" && !term?.sIsSummer,
      policy: policy ? warningPolicyView(policy) : null,
      completionRunId: run.completionRunId,
      progressRunId: run.progressRunId,
      status: run.status,
      totalStudents: scopedResults?.length ?? run.totalStudents,
      warningStudents: scopedResults?.filter((result) => result.reasonCount > 0).length ?? run.warningStudents,
      mediumStudents: scopedResults?.filter((result) => result.maxSeverity === "medium").length ?? run.mediumStudents,
      highStudents: scopedResults?.filter((result) => result.maxSeverity === "high").length ?? run.highStudents,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      sourceSnapshot: sanitizeWarningSourceSnapshot(run.sourceSnapshot, allowedClassIds),
      sourceSnapshotHash: run.sourceSnapshotHash,
      sourceCapturedAt: run.sourceCapturedAt,
    };
  }

  // ===================== Student Results (paginated, filtered) =====================

  static async listStudentResults(
    runId: string,
    reasonCode?: string,
    severity?: string,
    classId?: string,
    registrationStatus?: string,
    scheduleStatus?: string,
    page = 1,
    pageSize = 20,
    allowedClassIds?: string[] | null,
  ) {
    const where: Prisma.AcademicWarningStudentResultWhereInput = { runId };
    if (reasonCode) {
      const reasons = await prisma.academicWarningReason.findMany({
        where: { reasonCode },
        select: { studentResultId: true },
      });
      where.id = { in: reasons.map((reason) => reason.studentResultId) };
    }
    if (severity) where.maxSeverity = severity;
    if (allowedClassIds !== undefined && allowedClassIds !== null) where.classId = { in: allowedClassIds };
    if (classId) where.classId = allowedClassIds && !allowedClassIds.includes(classId) ? { in: [] } : classId;
    if (registrationStatus) where.registrationStatus = registrationStatus;
    if (scheduleStatus) where.scheduleStatus = scheduleStatus;

    const [total, results] = await Promise.all([
      prisma.academicWarningStudentResult.count({ where }),
      prisma.academicWarningStudentResult.findMany({
        where,
        orderBy: [{ maxSeverity: "asc" }, { sStudentId: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: results.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        studentCode: r.sStudentId,
        studentName: r.sStudentName,
        className: r.sClassName,
        programCode: r.sProgramCode,
        termRegisteredCredits: r.termRegisteredCredits != null ? Number(r.termRegisteredCredits) : null,
        termGpa4: r.termGpa4 != null ? Number(r.termGpa4) : null,
        termGpa10: r.termGpa10 != null ? Number(r.termGpa10) : null,
        cumulativeGpa4: r.cumulativeGpa4 != null ? Number(r.cumulativeGpa4) : null,
        cumulativeGpa10: r.cumulativeGpa10 != null ? Number(r.cumulativeGpa10) : null,
        registrationStatus: r.registrationStatus,
        scheduleStatus: r.scheduleStatus,
        academicWarningDecisions: r.academicWarningDecisions,
        maxSeverity: r.maxSeverity,
        reasonCount: r.reasonCount,
        dataError: r.dataError,
        businessStatus: normalizeWarningBusinessStatus(r.businessStatus),
        regulatoryCoverage: r.regulatoryCoverage,
        ruleResults: r.ruleResults,
        dataStatus: warningDataStatusFromStored(r.dataError),
        presentationState: normalizeWarningBusinessStatus(r.businessStatus),
      })),
      total,
      page,
      pageSize,
    };
  }

  // ===================== Single Student Detail + Reasons =====================

  static async getStudentResult(runId: string, studentId: string) {
    const result = await prisma.academicWarningStudentResult.findFirst({
      where: { runId, studentId },
    });
    if (!result) return null;

    const reasons = await prisma.academicWarningReason.findMany({
      where: { studentResultId: result.id },
      orderBy: [{ severity: "asc" }, { reasonCode: "asc" }],
    });

    return {
      id: result.id,
      studentId: result.studentId,
      studentCode: result.sStudentId,
      studentName: result.sStudentName,
      className: result.sClassName,
      programCode: result.sProgramCode,
      termRegisteredCredits: result.termRegisteredCredits != null ? Number(result.termRegisteredCredits) : null,
      termGpa4: result.termGpa4 != null ? Number(result.termGpa4) : null,
      termGpa10: result.termGpa10 != null ? Number(result.termGpa10) : null,
      cumulativeGpa4: result.cumulativeGpa4 != null ? Number(result.cumulativeGpa4) : null,
      cumulativeGpa10: result.cumulativeGpa10 != null ? Number(result.cumulativeGpa10) : null,
      registrationStatus: result.registrationStatus,
      scheduleStatus: result.scheduleStatus,
      academicWarningDecisions: result.academicWarningDecisions,
      maxSeverity: result.maxSeverity,
      reasonCount: result.reasonCount,
      dataError: result.dataError,
      businessStatus: normalizeWarningBusinessStatus(result.businessStatus),
      regulatoryCoverage: result.regulatoryCoverage,
      ruleResults: result.ruleResults,
      dataStatus: warningDataStatusFromStored(result.dataError),
      presentationState: normalizeWarningBusinessStatus(result.businessStatus),
      reasons: reasons.map((r) => ({
        id: r.id,
        reasonCode: r.reasonCode,
        severity: r.severity,
        title: r.title,
        details: r.details,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
      })),
    };
  }

  static async getStudentOverview(studentIdentifier: string) {
    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(studentIdentifier), deletedAt: null },
      select: { id: true },
    });
    if (!student) return null;

    const [warningResults, warningActions, latestWarning, interventionCases] = await Promise.all([
      prisma.academicWarningStudentResult.findMany({
        where: { studentId: student.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.warningAction.findMany({
        where: {
          studentId: student.id,
          OR: [{ caseType: null }, { caseType: { not: EARLY_WARNING_CASE_TYPE } }],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      findLatestOfficialWarningResult(student.id),
      prisma.warningAction.findMany({
        where: { studentId: student.id, caseType: EARLY_WARNING_CASE_TYPE },
        select: { id: true },
      }),
    ]);
    const interventionHistory = await loadWarningActionHistory(interventionCases.map(item => item.id));
    const runIds = [...new Set([
      ...warningResults.map((result) => result.runId),
      ...(latestWarning ? [latestWarning.runId] : []),
    ])];
    const runs = runIds.length
      ? await prisma.academicWarningRun.findMany({ where: { id: { in: runIds } } })
      : [];
    const runMap = new Map(runs.map((run) => [run.id, run]));
    const termIds = [...new Set(runs.map((run) => run.assessmentAcademicTermId))];
    const terms = termIds.length
      ? await prisma.academicTerm.findMany({ where: { id: { in: termIds } } })
      : [];
    const termMap = new Map(terms.map((term) => [term.id, term]));
    const academicYearIds = [...new Set(terms.map((term) => term.academicYearId))];
    const academicYears = academicYearIds.length
      ? await prisma.academicYear.findMany({
          where: { id: { in: academicYearIds } },
          select: { id: true, sYearCode: true },
        })
      : [];
    const academicYearCodeById = new Map(academicYears.map((year) => [year.id, year.sYearCode]));
    const reasons = latestWarning
      ? await prisma.academicWarningReason.findMany({
          where: { studentResultId: latestWarning.id },
          orderBy: [{ severity: "asc" }, { reasonCode: "asc" }],
        })
      : [];
    const dataStatus = latestWarning
      ? warningDataStatusFromStored(latestWarning.dataError)
      : "INSUFFICIENT";
    const presentationState = latestWarning?.businessStatus || "INSUFFICIENT_DATA";
    const visibleWarningResults = warningResults.filter((result, index, rows) => {
      const run = runMap.get(result.runId);
      if (!run) return true;
      const key = `${run.runMode}:${run.assessmentAcademicTermId}`;
      return rows.findIndex((candidate) => {
        const candidateRun = runMap.get(candidate.runId);
        return candidateRun
          ? `${candidateRun.runMode}:${candidateRun.assessmentAcademicTermId}` === key
          : false;
      }) === index;
    });

    return {
      studentId: student.id,
      warningLevel: presentationState === "HIGH_RISK" || presentationState === "VERIFY_REQUIRED"
        ? "red"
        : presentationState === "MONITORING"
          ? "yellow"
          : presentationState === "INSUFFICIENT_DATA"
            ? "insufficient"
            : "green",
      dataStatus,
      presentationState,
      warningInfo: latestWarning ? {
        id: latestWarning.id,
        runId: latestWarning.runId,
        maxSeverity: latestWarning.maxSeverity,
        termGpa4: latestWarning.termGpa4 != null ? Number(latestWarning.termGpa4) : null,
        cumulativeGpa4: latestWarning.cumulativeGpa4 != null ? Number(latestWarning.cumulativeGpa4) : null,
        reasonCount: latestWarning.reasonCount,
        dataError: latestWarning.dataError,
        businessStatus: normalizeWarningBusinessStatus(latestWarning.businessStatus),
        regulatoryCoverage: latestWarning.regulatoryCoverage,
        ruleResults: latestWarning.ruleResults,
        dataStatus,
        presentationState,
      } : null,
      warningHistory: visibleWarningResults.map((result) => {
        const run = runMap.get(result.runId);
        const term = run ? termMap.get(run.assessmentAcademicTermId) : null;
        const itemDataStatus = warningDataStatusFromStored(result.dataError);
        return {
          id: result.id,
          runId: result.runId,
          maxSeverity: result.maxSeverity,
          termGpa4: result.termGpa4 != null ? Number(result.termGpa4) : null,
          cumulativeGpa4: result.cumulativeGpa4 != null ? Number(result.cumulativeGpa4) : null,
          registrationStatus: result.registrationStatus,
          scheduleStatus: result.scheduleStatus,
          academicWarningDecisions: result.academicWarningDecisions,
          reasonCount: result.reasonCount,
          dataError: result.dataError,
          businessStatus: normalizeWarningBusinessStatus(result.businessStatus),
          regulatoryCoverage: result.regulatoryCoverage,
          ruleResults: result.ruleResults,
          dataStatus: itemDataStatus,
          presentationState: normalizeWarningBusinessStatus(result.businessStatus),
          createdAt: result.createdAt,
          academicTermId: term?.id || null,
          termCode: term?.sTermCode || null,
          termName: term?.sTermName || null,
          academicYear: term ? academicYearCodeById.get(term.academicYearId) || null : null,
          runMode: run?.runMode || "OFFICIAL",
          executionProfile: run?.executionProfile || "LEGACY_SCALAR_RULES",
          isSummer: Boolean(term?.sIsSummer),
          evaluationLabel: run?.runMode === "SUMMER_MONITORING"
            ? "Giám sát kỳ hè, tham khảo"
            : term?.sIsSummer
              ? "Đánh giá kỳ phụ, tham khảo"
              : "Kết quả kỳ chính thức",
        };
      }),
      warningReasons: reasons.map((reason) => ({
        id: reason.id,
        reasonCode: reason.reasonCode,
        severity: reason.severity,
        title: reason.title,
        details: reason.details,
        sourceType: reason.sourceType,
        sourceId: reason.sourceId,
      })),
      warningActions,
      interventionHistory,
    };
  }

  // ===================== Group Results =====================

  static async listGroupResults(runId: string, allowedClassIds?: string[] | null) {
    const results = await prisma.academicWarningGroupResult.findMany({
      where: {
        runId,
        ...(allowedClassIds !== undefined && allowedClassIds !== null
          ? { groupType: "class", groupId: { in: allowedClassIds } }
          : {}),
      },
      orderBy: { groupCode: "asc" },
    });

    return results.map((r) => ({
      groupType: r.groupType,
      groupId: r.groupId,
      groupCode: r.groupCode,
      groupName: r.groupName,
      totalStudents: r.totalStudents,
      warningStudents: r.warningStudents,
      mediumStudents: r.mediumStudents,
      highStudents: r.highStudents,
    }));
  }
}
