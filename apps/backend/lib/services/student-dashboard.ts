import { prisma } from "@/lib/prisma";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { ApiError } from "@/lib/utils/api-error";
import { hasPermission, type Actor } from "@/lib/auth/types";
import { findLatestOfficialWarningResult } from "@/lib/services/academic-warnings";

type DashboardTerm = {
  academicYear: string;
  termCode: string;
  termName: string;
  termOrder: number;
};

const validYear = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{4})$/);
  return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
};

const validTerm = (value: string) => new Set(["HK01", "HK02", "HK03"]).has(value);

export class StudentDashboardService {
  static async getStudentDashboard(
    studentIdentifier: string,
    actor: Actor,
    academicYear = "",
    requestedTermCode = "",
  ) {
    const yearFilter = academicYear.trim();
    const termFilter = requestedTermCode.trim().toUpperCase();
    if (
      (!yearFilter && termFilter) ||
      (yearFilter && !termFilter) ||
      (yearFilter && (!validYear(yearFilter) || !validTerm(termFilter)))
    ) {
      throw new ApiError("academicYear and termCode must be a valid pair", "INVALID_FILTER", 400);
    }

    const student = await prisma.student.findFirst({
      where: { ...studentIdWhere(studentIdentifier), deletedAt: null },
    });
    if (!student) return null;

    const termRows: Array<{
      id: string;
      s_term_code: string;
      s_term_name: string;
      s_term_order: number;
      s_year_code: string;
      is_current: boolean;
    }> = await prisma.$queryRaw`
      SELECT t.id::text, t.s_term_code, t.s_term_name, t.s_term_order, y.s_year_code, t.is_current
      FROM academic_terms t
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE t.deleted_at IS NULL AND y.deleted_at IS NULL
      ORDER BY y.s_year_code DESC, t.s_term_order DESC
    `;
    const availableTerms: DashboardTerm[] = termRows.map((row) => ({
      academicYear: row.s_year_code,
      termCode: row.s_term_code,
      termName: row.s_term_name,
      termOrder: Number(row.s_term_order),
    }));
    const targetRow = yearFilter
      ? termRows.find((row) => row.s_year_code === yearFilter && row.s_term_code === termFilter)
      : termRows.find((row) => row.is_current) || termRows[0];
    if (!targetRow) throw new ApiError("Academic term not found", "INVALID_FILTER", 400);
    const target: DashboardTerm = {
      academicYear: targetRow.s_year_code,
      termCode: targetRow.s_term_code,
      termName: targetRow.s_term_name,
      termOrder: Number(targetRow.s_term_order),
    };

    const access = {
      grades: hasPermission(actor, "grade.read"),
      progress: hasPermission(actor, "progress.read"),
      decisions: hasPermission(actor, "decision.read"),
      warnings: hasPermission(actor, "academic_warning.read"),
    };
    const programCode = student.sStudyProgramId || "";
    const [grades, registration, completion, decisions, latestWarning] = await Promise.all([
      access.grades ? this.gradeSummary(student.id, programCode, target) : null,
      access.progress ? this.registrationProgress(student.id, programCode, target) : null,
      access.progress ? this.completionProgress(student.id, programCode, target) : null,
      access.decisions ? this.decisionSummary(student.id, target) : null,
      access.warnings ? findLatestOfficialWarningResult(student.id) : null,
    ]);

    return {
      student: {
        id: student.id,
        studentId: student.sStudentId,
        fullName: student.sFullName,
        classId: student.sClassStudentId || "",
        className: student.sClassStudentId,
        programCode,
        gender: student.sGender,
        birthDate: student.sBirthDate,
      },
      filter: target,
      availableTerms,
      access,
      grades,
      registration,
      completion,
      decisions,
      cumulative: grades
        ? {
            cumulativeCredits: grades.cumulativeCredits,
            cumulativeGpa4: grades.gpa4,
            cumulativeGpa10: grades.gpa10,
          }
        : null,
      gpaHistory: grades?.history.map((item) => ({
        semester: `${item.termCode} ${item.academicYear}`,
        gpa: item.gpa4,
      })) || [],
      ...(access.warnings ? {
        warningLevel: latestWarning?.maxSeverity === "high"
          ? "red"
          : latestWarning?.maxSeverity === "medium"
            ? "yellow"
            : latestWarning?.businessStatus === "PARTIAL_NO_RISK"
              ? "partial"
            : latestWarning?.businessStatus === "INSUFFICIENT_DATA" || !latestWarning
              ? "insufficient"
              : "green",
      } : {}),
    };
  }

  private static async gradeSummary(studentId: string, programCode: string, target: DashboardTerm) {
    const rows: Array<{
      s_year_code: string;
      s_term_code: string;
      registered_credits: unknown;
      credits_earned: unknown;
      gpa_4: unknown;
      cumulative_gpa_4: unknown;
      cumulative_gpa_10: unknown;
      cumulative_credits: unknown;
      conduct_score: unknown;
      classification_name: string | null;
    }> = await prisma.$queryRaw`
      SELECT y.s_year_code, t.s_term_code, s.registered_credits, s.credits_earned,
             s.gpa_4, s.cumulative_gpa_4, s.cumulative_gpa_10, s.cumulative_credits,
             s.conduct_score, s.classification_name
      FROM student_term_summaries s
      JOIN academic_terms t ON t.id = s.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE s.student_id = ${studentId}::uuid
        AND (${programCode} = '' OR s.s_program_code = ${programCode})
        AND (y.s_year_code < ${target.academicYear}
          OR (y.s_year_code = ${target.academicYear} AND t.s_term_order <= ${target.termOrder}))
      ORDER BY y.s_year_code, t.s_term_order, s.id
    `;
    const numberOrNull = (value: unknown) => value == null ? null : Number(value);
    const history = rows.map((row) => ({
      academicYear: row.s_year_code,
      termCode: row.s_term_code,
      registeredCredits: numberOrNull(row.registered_credits),
      creditsEarned: numberOrNull(row.credits_earned),
      gpa4: numberOrNull(row.gpa_4),
      cumulativeGpa4: numberOrNull(row.cumulative_gpa_4),
    }));
    const latest = rows.at(-1);
    return {
      gpa10: numberOrNull(latest?.cumulative_gpa_10),
      gpa4: numberOrNull(latest?.cumulative_gpa_4),
      cumulativeCredits: numberOrNull(latest?.cumulative_credits),
      conductScore: numberOrNull(latest?.conduct_score),
      classificationName: latest?.classification_name || null,
      sourceAcademicYear: latest?.s_year_code || "",
      sourceTermCode: latest?.s_term_code || "",
      history,
    };
  }

  private static async registrationProgress(studentId: string, programCode: string, target: DashboardTerm) {
    const rows: Array<Record<string, unknown>> = await prisma.$queryRaw`
      SELECT sr.status,
             sr.mandatory_required_credits AS "mandatoryRequiredCredits",
             sr.mandatory_registered_credits AS "mandatoryRegisteredCredits",
             sr.required_elective_credits AS "electiveRequiredCredits",
             sr.registered_elective_credits AS "electiveRegisteredCredits",
             sr.required_elective_courses AS "requiredElectiveCourses",
             sr.registered_required_elective_courses AS "registeredRequiredElectives",
             sr.outside_plan_credits AS "outsidePlanCredits"
      FROM training_progress_student_results sr
      JOIN training_progress_calculation_runs r ON r.id = sr.run_id AND r.status = 'completed'
      JOIN training_progress_plans p ON p.id = r.plan_id
      JOIN academic_terms t ON t.id = p.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      JOIN training_programs tp ON tp.id = p.training_program_id
      WHERE sr.student_id = ${studentId}::uuid
        AND y.s_year_code = ${target.academicYear}
        AND t.s_term_order = ${target.termOrder}
        AND (${programCode} = '' OR tp.s_program_code = ${programCode})
      ORDER BY r.completed_at DESC, r.id DESC
      LIMIT 1
    `;
    return rows[0]
      ? { available: true, reason: "", ...rows[0] }
      : { available: false, reason: "Chưa có dữ liệu đánh giá đăng ký cho học kỳ đã chọn." };
  }

  private static async completionProgress(studentId: string, programCode: string, target: DashboardTerm) {
    const rows: Array<Record<string, unknown>> = await prisma.$queryRaw`
      SELECT sr.schedule_status AS "scheduleStatus",
             sr.program_completion_status AS "programCompletionStatus",
             sr.due_plans_total AS "duePlansTotal",
             sr.due_plans_passed AS "duePlansPassed",
             sr.missing_mandatory_courses AS "missingMandatoryCourses",
             sr.missing_elective_credits AS "missingElectiveCredits"
      FROM training_progress_completion_student_results sr
      JOIN training_progress_completion_runs r ON r.id = sr.run_id AND r.status = 'completed'
      JOIN academic_terms t ON t.id = r.assessment_academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE sr.student_id = ${studentId}::uuid
        AND (y.s_year_code < ${target.academicYear}
          OR (y.s_year_code = ${target.academicYear} AND t.s_term_order <= ${target.termOrder}))
        AND (${programCode} = '' OR sr.s_program_code = ${programCode})
      ORDER BY y.s_year_code DESC, t.s_term_order DESC, r.completed_at DESC, r.id DESC
      LIMIT 1
    `;
    return rows[0]
      ? { available: true, reason: "", ...rows[0] }
      : { available: false, reason: "Chưa có dữ liệu đánh giá hoàn thành CTĐT đến mốc đã chọn." };
  }

  private static async decisionSummary(studentId: string, target: DashboardTerm) {
    const totals: Array<{ total: number; academic_warnings: number }> = await prisma.$queryRaw`
      SELECT count(*)::integer AS total,
             count(*) FILTER (WHERE d.is_academic_warning)::integer AS academic_warnings
      FROM student_decisions d
      JOIN academic_terms t ON t.id = d.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE d.student_id = ${studentId}::uuid AND d.deleted_at IS NULL
        AND (y.s_year_code < ${target.academicYear}
          OR (y.s_year_code = ${target.academicYear} AND t.s_term_order <= ${target.termOrder}))
    `;
    const recent: Array<Record<string, unknown>> = await prisma.$queryRaw`
      SELECT d.id::text, d.s_decision_number AS "decisionNumber",
             d.s_decision_name AS "decisionName", COALESCE(dt.decision_name, '') AS "decisionType",
             d.is_academic_warning AS "isAcademicWarning", d.s_sign_date AS "signDate"
      FROM student_decisions d
      JOIN academic_terms t ON t.id = d.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      LEFT JOIN decision_types dt ON dt.decision_type_id = d.decision_type_id
      WHERE d.student_id = ${studentId}::uuid AND d.deleted_at IS NULL
        AND (y.s_year_code < ${target.academicYear}
          OR (y.s_year_code = ${target.academicYear} AND t.s_term_order <= ${target.termOrder}))
      ORDER BY d.s_sign_date DESC NULLS LAST, d.created_at DESC
      LIMIT 5
    `;
    return {
      total: Number(totals[0]?.total || 0),
      academicWarnings: Number(totals[0]?.academic_warnings || 0),
      recent,
    };
  }
}
