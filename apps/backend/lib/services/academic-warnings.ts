import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { ApiError } from "@/lib/utils/api-error";
import { sha256Hex } from "@/lib/utils/crypto";

// ============================================================================
// Types
// ============================================================================

interface StudentSource {
  id: string;
  classId: string | null;
  cohortId: string | null;
  code: string;
  name: string;
  classCode: string;
  className: string;
  programCode: string;
}

interface ProgressSource { status: string; runId: string }
interface CompletionSource { scheduleStatus: string; runId: string }
interface SummarySource {
  termSummaryId: string;
  cumulativeSummaryId: string | null;
  registered: number | null;
  termGPA4: number | null;
  termGPA10: number | null;
  cumulativeGPA4: number | null;
  cumulativeGPA10: number | null;
}
interface DecisionSource { id: string; number: string; name: string; fullText: string; signDate: Date | null }
interface ConductSource { id: string; score: number; statusId: string }
interface SummerMonitoringSource {
  offeringCount: number;
  registeredCredits: number;
  pendingResults: number;
  failedCourses: number;
}

interface ReasonData {
  reasonCode: string;
  severity: string;
  title: string;
  details: any;
  sourceType: string | null;
  sourceId: string | null;
}

interface EvalResult {
  termRegisteredCredits: number | null;
  termGPA4: number | null;
  termGPA10: number | null;
  cumulativeGPA4: number | null;
  cumulativeGPA10: number | null;
  registrationStatus: string;
  scheduleStatus: string;
  academicWarningDecisions: number;
  maxSeverity: string;
  reasonCount: number;
  dataError: string | null;
  reasons: ReasonData[];
}

// ============================================================================
// Pure Evaluation Logic (ported from SWE service.go evaluate())
// ============================================================================

export function evaluate(
  student: StudentSource,
  progress: Map<string, ProgressSource>,
  completion: Map<string, CompletionSource>,
  summaries: Map<string, SummarySource>,
  decisions: Map<string, DecisionSource[]>,
  policy: { termGpaThreshold: number; cumulativeGpaThreshold: number; conductScoreThreshold?: number },
  conduct: Map<string, ConductSource> = new Map(),
): EvalResult {
  const result: EvalResult = {
    termRegisteredCredits: null,
    termGPA4: null,
    termGPA10: null,
    cumulativeGPA4: null,
    cumulativeGPA10: null,
    registrationStatus: "unavailable",
    scheduleStatus: "unavailable",
    academicWarningDecisions: 0,
    maxSeverity: "none",
    reasonCount: 0,
    dataError: null,
    reasons: [],
  };

  // Load summary data
  const summary = summaries.get(student.id);
  if (summary) {
    result.termRegisteredCredits = summary.registered;
    result.termGPA4 = summary.termGPA4;
    result.termGPA10 = summary.termGPA10;
    result.cumulativeGPA4 = summary.cumulativeGPA4;
    result.cumulativeGPA10 = summary.cumulativeGPA10;
  }

  const addReason = (code: string, severity: string, title: string, details: any, sourceType: string | null, sourceId: string | null) => {
    result.reasons.push({ reasonCode: code, severity, title, details, sourceType, sourceId });
    result.reasonCount++;
    if (severity === "high" || result.maxSeverity === "none") {
      result.maxSeverity = severity;
    }
  };

  // Check progress (registration status)
  const prog = progress.get(student.id);
  if (prog) {
    result.registrationStatus = prog.status;
    if (prog.status === "fail") {
      addReason("REGISTRATION_BEHIND", "medium", "Đăng ký chưa đủ theo kế hoạch",
        { status: prog.status }, "training_progress_calculation_run", prog.runId);
    }
  }

  // Check completion (schedule status)
  const comp = completion.get(student.id);
  if (comp) {
    result.scheduleStatus = comp.scheduleStatus;
    if (comp.scheduleStatus === "behind_schedule") {
      addReason("PROGRAM_PROGRESS_BEHIND", "high", "Chậm tiến độ toàn khóa",
        { scheduleStatus: comp.scheduleStatus }, "training_progress_completion_run", comp.runId);
    }
  }

  // Check term GPA
  if (result.termGPA4 != null && result.termGPA4 < policy.termGpaThreshold) {
    addReason("LOW_TERM_GPA", "medium", "GPA học kỳ thấp",
      { gpa4: result.termGPA4, threshold: policy.termGpaThreshold }, "student_term_summary", summary!.termSummaryId);
  }

  // Check cumulative GPA
  if (result.cumulativeGPA4 != null && result.cumulativeGPA4 < policy.cumulativeGpaThreshold) {
    addReason("LOW_CUMULATIVE_GPA", "high", "GPA tích lũy thấp",
      { gpa4: result.cumulativeGPA4, threshold: policy.cumulativeGpaThreshold },
      summary!.cumulativeSummaryId ? "student_cumulative_summary" : "student_term_summary",
      summary!.cumulativeSummaryId || summary!.termSummaryId);
  }

  const conductRecord = conduct.get(student.id);
  if (
    conductRecord &&
    conductRecord.statusId === "1" &&
    policy.conductScoreThreshold != null &&
    conductRecord.score < policy.conductScoreThreshold
  ) {
    addReason("LOW_CONDUCT_SCORE", "medium", "Điểm rèn luyện dưới ngưỡng theo dõi",
      { score: conductRecord.score, threshold: policy.conductScoreThreshold, approvalStatus: "approved" },
      "student_conduct_record", conductRecord.id);
  }

  // Check academic warning decisions
  const decs = decisions.get(student.id);
  if (decs && decs.length > 0) {
    result.academicWarningDecisions = decs.length;
    const items = decs.map((d) => ({
      id: d.id, decisionNumber: d.number, decisionName: d.name, fullText: d.fullText, signDate: d.signDate,
    }));
    addReason("ACADEMIC_WARNING_DECISION", "high", "Có quyết định cảnh báo học vụ",
      { count: decs.length, decisions: items }, "student_decisions", null);
  }

  // Fix severity
  if (result.maxSeverity === "none" && result.reasonCount > 0) {
    result.maxSeverity = "medium";
  }

  // Data error check
  if (!summary) {
    result.dataError = "missing student term summary";
  }

  return result;
}

export function evaluateSummerMonitoring(
  student: StudentSource,
  summaries: Map<string, SummarySource>,
  monitoring: Map<string, SummerMonitoringSource>,
): EvalResult {
  const summary = summaries.get(student.id);
  const source = monitoring.get(student.id);
  const result: EvalResult = {
    termRegisteredCredits: source?.registeredCredits ?? summary?.registered ?? null,
    termGPA4: summary?.termGPA4 ?? null,
    termGPA10: summary?.termGPA10 ?? null,
    cumulativeGPA4: summary?.cumulativeGPA4 ?? null,
    cumulativeGPA10: summary?.cumulativeGPA10 ?? null,
    registrationStatus: source ? "participating" : "not_participating",
    scheduleStatus: "not_assessed",
    academicWarningDecisions: 0,
    maxSeverity: "none",
    reasonCount: 0,
    dataError: null,
    reasons: [],
  };

  const addReason = (code: string, title: string, count: number) => {
    result.reasons.push({
      reasonCode: code,
      severity: "medium",
      title,
      details: { count, monitoringOnly: true },
      sourceType: "summer_monitoring",
      sourceId: null,
    });
    result.reasonCount += 1;
    result.maxSeverity = "medium";
  };

  if (source?.pendingResults) addReason("SUMMER_RESULT_PENDING", "Kết quả học phần hè đang chờ", source.pendingResults);
  if (source?.failedCourses) addReason("SUMMER_COURSE_NOT_PASSED", "Học phần hè chưa đạt", source.failedCourses);
  return result;
}

// ============================================================================
// DB Context Loader (ported from SWE service.go loadContext())
// ============================================================================

async function loadWarningContext(
  cohortId: string,
  trainingProgramId: string,
  assessmentTermId: string,
) {
  // Get active policy
  const policy = await prisma.academicWarningPolicy.findFirst({
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
  if (completionRun.length === 0) throw new Error("No completed completion run found. Run a completion evaluation first.");
  const completionRunId = completionRun[0].id;

  // Find latest completed progress run
  const progressRun: any[] = await prisma.$queryRaw`
    SELECT r.id::text FROM training_progress_calculation_runs r
    JOIN training_progress_plans p ON p.id = r.plan_id
    WHERE p.cohort_id = ${cohortId}::uuid AND p.training_program_id = ${trainingProgramId}::uuid
      AND p.academic_term_id = ${assessmentTermId}::uuid AND p.status = 'locked' AND p.is_current
      AND r.status = 'completed'
    ORDER BY r.completed_at DESC NULLS LAST, r.id DESC LIMIT 1
  `;
  if (progressRun.length === 0) throw new Error("No completed progress calculation run found. Run a calculation first.");
  const progressRunId = progressRun[0].id;

  // Load students
  const studentRows: any[] = await prisma.$queryRaw`
    SELECT s.id::text, COALESCE(c.id::text,'') as class_uuid, COALESCE(c.cohort_id::text,'') as cohort_uuid,
           s.s_student_id, s.s_full_name, COALESCE(c.class_id,'') as class_code, COALESCE(c.class_name,'') as class_name,
           COALESCE(s.s_study_program_id,'') as program_code
    FROM students s
    LEFT JOIN classes c ON c.class_id = s.s_class_student_id AND c.deleted_at IS NULL
    WHERE s.s_study_program_id = ${program.sProgramCode} AND s.deleted_at IS NULL
      AND c.cohort_id = ${cohortId}::uuid
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
  if (studentIds.length > 0) {
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
  if (studentIds.length > 0) {
    const compRows: any[] = await prisma.$queryRaw`
      SELECT student_id::text, schedule_status FROM training_progress_completion_student_results
      WHERE run_id = ${completionRunId}::uuid AND student_id = ANY(${studentIds}::uuid[])
    `;
    for (const r of compRows) {
      completion.set(r.student_id, { scheduleStatus: r.schedule_status, runId: completionRunId });
    }
  }

  // Load term summaries
  const summaries = new Map<string, SummarySource>();
  if (studentIds.length > 0) {
    const sumRows: any[] = await prisma.$queryRaw`
      SELECT s.id::text, s.student_id::text, s.registered_credits, s.gpa_4, s.gpa_10,
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
  }

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
    prisma.trainingProgressCalculationRun.findUnique({
      where: { id: progressRunId },
      select: { sourceSnapshotHash: true, sourceCapturedAt: true, completedAt: true },
    }),
    prisma.trainingProgressCompletionRun.findUnique({
      where: { id: completionRunId },
      select: {
        sourceSnapshotHash: true,
        sourceCapturedAt: true,
        completedAt: true,
        evaluationMode: true,
        evaluation_scope: true,
      },
    }),
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
  };
}

async function loadSummerMonitoringContext(
  cohortId: string,
  trainingProgramId: string,
  assessmentTermId: string,
) {
  const [policy, program] = await Promise.all([
    prisma.academicWarningPolicy.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } }),
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

  if (studentIds.length) {
    const [summaryRows, monitoringRows] = await Promise.all([
      prisma.$queryRaw<Array<{
        id: string; student_id: string; registered_credits: unknown; gpa_4: unknown; gpa_10: unknown;
        cumulative_gpa_4: unknown; cumulative_gpa_10: unknown;
      }>>`
        SELECT id::text, student_id::text, registered_credits, gpa_4, gpa_10,
               cumulative_gpa_4, cumulative_gpa_10
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
               COALESCE(SUM(o.s_credits), 0) AS registered_credits,
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
    return policies.map((p) => ({
      id: p.id,
      name: p.name,
      termGpaThreshold: Number(p.termGpaThreshold),
      cumulativeGpaThreshold: Number(p.cumulativeGpaThreshold),
      conductScoreThreshold: Number(p.conductScoreThreshold),
      version: p.version,
      status: p.status,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  static async createPolicy(data: {
    name: string;
    termGpaThreshold?: number;
    cumulativeGpaThreshold?: number;
    conductScoreThreshold?: number;
    status?: string;
  }, actorId?: string | null) {
    const name = (data.name || "").trim();
    if (!name) throw new ApiError("Policy name is required", "INVALID_REQUEST", 400);

    const tGpa = data.termGpaThreshold ?? 2.0;
    const cGpa = data.cumulativeGpaThreshold ?? 2.0;
    const conductScore = data.conductScoreThreshold ?? 50;
    if (tGpa < 0 || tGpa > 4 || cGpa < 0 || cGpa > 4) {
      throw new ApiError("GPA thresholds must be between 0 and 4", "INVALID_THRESHOLD", 400);
    }
    if (conductScore < 0 || conductScore > 100) {
      throw new ApiError("Conduct score threshold must be between 0 and 100", "INVALID_THRESHOLD", 400);
    }

    const status = data.status || "active";
    if (status !== "draft" && status !== "active") {
      throw new ApiError("Status must be 'draft' or 'active'", "INVALID_STATUS", 400);
    }

    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('academic_warning_policy_version'))`;
      if (status === "active") {
        await tx.academicWarningPolicy.updateMany({
          where: { status: "active" },
          data: { status: "archived", updatedAt: new Date() },
        });
      }
      const latest = await tx.academicWarningPolicy.findFirst({ orderBy: { version: "desc" } });
      const created = await tx.academicWarningPolicy.create({
        data: {
          name,
          termGpaThreshold: tGpa,
          cumulativeGpaThreshold: cGpa,
          conductScoreThreshold: conductScore,
          version: (latest?.version || 0) + 1,
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
            version: created.version,
            status,
            termGpaThreshold: tGpa,
            cumulativeGpaThreshold: cGpa,
            conductScoreThreshold: conductScore,
          },
        },
      });
      return created;
    });
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

  static async createRun(data: {
    cohortId: string;
    trainingProgramId: string;
    assessmentAcademicTermId: string;
    createdBy?: string | null;
    runMode?: "OFFICIAL" | "SUMMER_MONITORING";
  }) {
    if (!data.cohortId || !data.trainingProgramId || !data.assessmentAcademicTermId) {
      throw new Error("cohortId, trainingProgramId, and assessmentAcademicTermId are required");
    }

    const assessmentTerm = await prisma.academicTerm.findFirst({
      where: { id: data.assessmentAcademicTermId, deletedAt: null },
    });
    if (!assessmentTerm) throw new ApiError("Academic term not found", "NOT_FOUND", 404);
    const runMode = data.runMode === "SUMMER_MONITORING" ? "SUMMER_MONITORING" : "OFFICIAL";
    if (assessmentTerm.sIsSummer && runMode !== "SUMMER_MONITORING") {
      throw new ApiError(
        "Không thể ban hành cảnh báo chính thức từ kỳ hè. Hãy chọn kỳ chính ngay trước hoặc dùng chế độ giám sát hè.",
        "SUMMER_OFFICIAL_WARNING_NOT_ALLOWED",
        422,
      );
    }
    if (!assessmentTerm.sIsSummer && runMode === "SUMMER_MONITORING") {
      throw new ApiError("Chế độ giám sát hè chỉ áp dụng cho kỳ được cấu hình là kỳ hè.", "INVALID_WARNING_RUN_MODE", 422);
    }

    // Official runs require locked progress snapshots. Summer monitoring reads
    // registrations and grade outcomes directly because summer has no plan or
    // minimum-credit requirement of its own.
    const ctx = runMode === "SUMMER_MONITORING"
      ? await loadSummerMonitoringContext(data.cohortId, data.trainingProgramId, data.assessmentAcademicTermId)
      : await loadWarningContext(data.cohortId, data.trainingProgramId, data.assessmentAcademicTermId);

    const sourceCapturedAt = new Date();
    const sourceSnapshot = {
      schemaVersion: 2,
      runMode,
      scope: {
        cohortId: data.cohortId,
        trainingProgramId: data.trainingProgramId,
        assessmentAcademicTermId: data.assessmentAcademicTermId,
      },
      policy: {
        id: ctx.policy.id,
        version: ctx.policy.version,
        name: ctx.policy.name,
        termGpaThreshold: Number(ctx.policy.termGpaThreshold),
        cumulativeGpaThreshold: Number(ctx.policy.cumulativeGpaThreshold),
        conductScoreThreshold: Number(ctx.policy.conductScoreThreshold),
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
      })),
    };
    const sourceSnapshotHash = sha256Hex(JSON.stringify(sourceSnapshot));

    // Create the run
    const run = await prisma.academicWarningRun.create({
      data: {
        cohortId: data.cohortId,
        trainingProgramId: data.trainingProgramId,
        assessmentAcademicTermId: data.assessmentAcademicTermId,
        policyId: ctx.policy.id,
        policyVersion: ctx.policy.version,
        completionRunId: ctx.completionRunId,
        progressRunId: ctx.progressRunId,
        runMode,
        sourceSnapshot: sourceSnapshot as Prisma.InputJsonValue,
        sourceSnapshotHash,
        sourceCapturedAt,
        createdBy: data.createdBy || null,
        status: "running",
        startedAt: new Date(),
      },
    });

    let totalWarning = 0, totalMedium = 0, totalHigh = 0;
    const groups = new Map<string, { code: string; name: string; total: number; warnings: number; medium: number; high: number }>();
    const studentRows: Prisma.AcademicWarningStudentResultCreateManyInput[] = [];
    const reasonRows: Prisma.AcademicWarningReasonCreateManyInput[] = [];

    for (const student of ctx.students) {
      const evalResult = runMode === "SUMMER_MONITORING"
        ? evaluateSummerMonitoring(student, ctx.summaries, ctx.summerMonitoring)
        : evaluate(
            student, ctx.progress, ctx.completion, ctx.summaries, ctx.decisions,
            {
              termGpaThreshold: Number(ctx.policy.termGpaThreshold),
              cumulativeGpaThreshold: Number(ctx.policy.cumulativeGpaThreshold),
              conductScoreThreshold: Number(ctx.policy.conductScoreThreshold),
            },
            ctx.conduct,
          );

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
        termRegisteredCredits: evalResult.termRegisteredCredits,
        termGpa4: evalResult.termGPA4,
        termGpa10: evalResult.termGPA10,
        cumulativeGpa4: evalResult.cumulativeGPA4,
        cumulativeGpa10: evalResult.cumulativeGPA10,
        registrationStatus: evalResult.registrationStatus,
        scheduleStatus: evalResult.scheduleStatus,
        academicWarningDecisions: evalResult.academicWarningDecisions,
        maxSeverity: evalResult.maxSeverity,
        reasonCount: evalResult.reasonCount,
        dataError: evalResult.dataError,
      });

      for (const reason of evalResult.reasons) {
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
      if (evalResult.reasonCount > 0) totalWarning++;
      if (evalResult.maxSeverity === "medium") totalMedium++;
      if (evalResult.maxSeverity === "high") totalHigh++;

      // Accumulate class groups
      if (student.classId) {
        let group = groups.get(student.classId);
        if (!group) {
          group = { code: student.classCode, name: student.className, total: 0, warnings: 0, medium: 0, high: 0 };
          groups.set(student.classId, group);
        }
        group.total++;
        if (evalResult.reasonCount > 0) group.warnings++;
        if (evalResult.maxSeverity === "medium") group.medium++;
        if (evalResult.maxSeverity === "high") group.high++;
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

    try {
      return await prisma.$transaction(async (tx) => {
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
  }

  // ===================== Run Detail =====================

  static async getRunDetail(runId: string, allowedClassIds?: string[] | null) {
    const run = await prisma.academicWarningRun.findUnique({ where: { id: runId } });
    if (!run) return null;

    const policy = run.policyId
      ? await prisma.academicWarningPolicy.findUnique({ where: { id: run.policyId } })
      : null;

    // Enrich with names
    const [cohort, program, term] = await Promise.all([
      prisma.cohort.findUnique({ where: { id: run.cohortId } }),
      prisma.trainingProgram.findUnique({ where: { id: run.trainingProgramId } }),
      prisma.academicTerm.findUnique({ where: { id: run.assessmentAcademicTermId } }),
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
      isOfficial: run.runMode === "OFFICIAL" && !term?.sIsSummer,
      policy: policy ? {
        id: policy.id,
        name: policy.name,
        version: policy.version,
        termGpaThreshold: Number(policy.termGpaThreshold),
        cumulativeGpaThreshold: Number(policy.cumulativeGpaThreshold),
        conductScoreThreshold: Number(policy.conductScoreThreshold),
      } : null,
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
      sourceSnapshot: run.sourceSnapshot,
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
