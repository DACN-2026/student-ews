import { loadSemesterCreditPlans } from "./semester-credit-plans";
import { courseOutcome } from "../academic-course-rules";
import { prisma } from "@/lib/prisma";
import { inferStudentProgressCohort, studentProgressCohort } from "../student-progress-cohort";
import {
  evaluateStudentTrainingProgress,
  isConditionalCourse,
  normalizeCourseCode,
  normalizeCourseName,
  StudentTrainingProgressService,
  type StudentGradeAttempt,
  type TrainingProgressCourse,
} from "@/lib/services/student-training-progress";

export type AcademicWarningProgressSignal = {
  creditDeficit: number | null;
  dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  reasonCode: string | null;
  sourceId: string;
  expectedCreditsToDate: number | null;
  earnedCreditsToDate: number | null;
};

type WarningProgressStudent = {
  id: string;
  code: string;
  name: string;
  classCode: string;
  className: string;
  programCode: string;
};

/**
 * Reuse the pure Training Progress evaluator at a historical MAIN-term
 * boundary. The benchmark is advanced by one semester so the just-finalized
 * assessment term is included in "credits that should have been completed".
 */
export async function calculateAcademicWarningProgressSignals(input: {
  students: WarningProgressStudent[];
  cohortId: string;
  trainingProgramId: string;
  assessmentTermId: string;
  programCode: string;
}) {
  const signals = new Map<string, AcademicWarningProgressSignal>();
  if (!input.students.length) return signals;

  const [term, cohort, exactCurriculumRows, choiceRows, graduationRules] = await Promise.all([
    prisma.academicTerm.findFirst({ where: { id: input.assessmentTermId, deletedAt: null } }),
    prisma.cohort.findFirst({ where: { id: input.cohortId, deletedAt: null } }),
    prisma.$queryRaw<Array<{
      course_id: string;
      s_course_code: string;
      s_course_name: string;
      s_credits: number;
      s_requirement_type: string;
      s_semester_no: number;
    }>>`
      SELECT c.id::text AS course_id, c.s_course_code, c.s_course_name,
             pc.s_credits, pc.s_requirement_type, pc.s_semester_no
      FROM training_program_courses pc
      JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
      WHERE pc.training_program_id = ${input.trainingProgramId}::uuid
      ORDER BY pc.s_semester_no, c.s_course_code
    `,
    prisma.$queryRaw<Array<{ s_course_code: string; choice_group_code: string | null }>>`
      SELECT DISTINCT pc.s_course_code, pc.choice_group_code
      FROM training_progress_plan_courses pc
      JOIN training_progress_plans p ON p.id = pc.plan_id
      WHERE p.cohort_id = ${input.cohortId}::uuid
        AND p.training_program_id = ${input.trainingProgramId}::uuid
        AND p.is_current = true AND p.status = 'locked'
        AND pc.choice_group_code IS NOT NULL
    `,
    prisma.graduationRule.findMany({
      where: {
        trainingProgramId: input.trainingProgramId,
        status: "active",
        ruleCode: { in: ["TOTAL_CREDITS", "ELECTIVE_CREDITS"] },
        OR: [{ cohortId: input.cohortId }, { cohortId: null }],
      },
      orderBy: [{ cohortId: "desc" }, { updatedAt: "desc" }],
    }),
  ]);
  if (!term || !cohort || !exactCurriculumRows.length) {
    for (const student of input.students) {
      signals.set(student.id, {
        creditDeficit: null,
        dataStatus: "INSUFFICIENT",
        reasonCode: !term ? "ASSESSMENT_TERM_MISSING" : !cohort ? "COHORT_MISSING" : "TRAINING_PROGRAM_CURRICULUM_MISSING",
        sourceId: input.trainingProgramId,
        expectedCreditsToDate: null,
        earnedCreditsToDate: null,
      });
    }
    return signals;
  }

  // A specialized program stores its specialization courses under the full
  // code (for example CQ24CT-PM) while the common first-year foundation may
  // live in the base program (CQ24CT). Reuse the same merge semantics as the
  // Training Progress screen so every cohort is compared with its complete,
  // matching curriculum instead of another cohort's program.
  let curriculumRows = [...exactCurriculumRows];
  if (input.programCode.includes("-")) {
    const baseCode = input.programCode.split("-")[0];
    const baseProgram = await prisma.trainingProgram.findFirst({
      where: { sProgramCode: baseCode, deletedAt: null },
      select: { id: true },
    });
    if (baseProgram) {
      const baseRows = await prisma.$queryRaw<typeof exactCurriculumRows>`
        SELECT c.id::text AS course_id, c.s_course_code, c.s_course_name,
               pc.s_credits, pc.s_requirement_type, pc.s_semester_no
        FROM training_program_courses pc
        JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
        WHERE pc.training_program_id = ${baseProgram.id}::uuid
        ORDER BY pc.s_semester_no, c.s_course_code
      `;
      const specializedSemesters = curriculumRows
        .map((row) => Number(row.s_semester_no))
        .filter((semester) => semester > 1);
      const firstSpecializedSemester = specializedSemesters.length
        ? Math.min(...specializedSemesters)
        : 5;
      const baseByCode = new Map(baseRows.map((row) => [normalizeCourseCode(row.s_course_code), row]));
      curriculumRows = curriculumRows.map((row) => {
        const base = baseByCode.get(normalizeCourseCode(row.s_course_code));
        return row.s_semester_no === 1 && base && base.s_semester_no > 1 && base.s_semester_no < firstSpecializedSemester
          ? { ...row, s_semester_no: base.s_semester_no }
          : row;
      });
      const existingCodes = new Set(curriculumRows.map((row) => normalizeCourseCode(row.s_course_code)));
      for (const baseRow of baseRows) {
        const code = normalizeCourseCode(baseRow.s_course_code);
        if (!existingCodes.has(code) && baseRow.s_semester_no < firstSpecializedSemester) {
          curriculumRows.push(baseRow);
          existingCodes.add(code);
        }
      }
    }
  }

  const year = await prisma.academicYear.findFirst({
    where: { id: term.academicYearId, deletedAt: null },
    select: { sYearCode: true },
  });
  if (!year) {
    for (const student of input.students) {
      signals.set(student.id, {
        creditDeficit: null,
        dataStatus: "INSUFFICIENT",
        reasonCode: "ASSESSMENT_ACADEMIC_YEAR_MISSING",
        sourceId: input.trainingProgramId,
        expectedCreditsToDate: null,
        earnedCreditsToDate: null,
      });
    }
    return signals;
  }

  const choiceGroupByCourse = new Map(choiceRows.map((row) => [row.s_course_code.trim().toUpperCase(), row.choice_group_code]));
  const curriculum: TrainingProgressCourse[] = curriculumRows.map((row) => ({
    courseId: row.course_id,
    courseCode: row.s_course_code,
    courseName: row.s_course_name,
    credits: Number(row.s_credits),
    requirementType: row.s_requirement_type,
    semesterNo: Number(row.s_semester_no),
    choiceGroupCode: choiceGroupByCourse.get(row.s_course_code.trim().toUpperCase()) || null,
    isConditional: isConditionalCourse(row.s_course_code, row.s_course_name),
  }));
  const curriculumByCode = new Map(curriculum.map((course) => [normalizeCourseCode(course.courseCode), course]));
  const curriculumByName = new Map<string, TrainingProgressCourse[]>();
  for (const course of curriculum) {
    const name = normalizeCourseName(course.courseName);
    const candidates = curriculumByName.get(name) || [];
    candidates.push(course);
    curriculumByName.set(name, candidates);
  }

  const ruleValue = (code: string) => {
    const rule = graduationRules.find((item) => item.ruleCode === code && item.cohortId === input.cohortId)
      || graduationRules.find((item) => item.ruleCode === code && item.cohortId == null);
    const value = rule ? Number(rule.requiredValue) : null;
    return value != null && Number.isFinite(value) ? value : null;
  };
  const requiredTotalCredits = ruleValue("TOTAL_CREDITS");
  const requiredElectiveCredits = ruleValue("ELECTIVE_CREDITS");

  const studentIds = input.students.map((student) => student.id);
  const offeringRows: Array<{
    student_id: string;
    s_curriculum_id: string;
    s_course_name: string;
    s_credits: number;
    s_year_code: string;
    s_term_code: string;
    s_term_order: number;
    score_10: unknown;
    score_4: unknown;
    letter_code: string | null;
    special_code: string | null;
    is_pass: boolean | null;
    not_score: boolean | null;
    score_status: string | null;
  }> = await prisma.$queryRaw`
    SELECT o.student_id::text, o.s_curriculum_id, o.s_course_name, o.s_credits,
           y.s_year_code, t.s_term_code, t.s_term_order,
           g.score_10, g.score_4, g.letter_code, g.special_code,
           g.is_pass, g.not_score, g.score_status
    FROM student_course_offerings o
    JOIN academic_terms t ON t.id = o.academic_term_id AND t.deleted_at IS NULL
    JOIN academic_years y ON y.id = t.academic_year_id AND y.deleted_at IS NULL
    LEFT JOIN student_course_grades g ON g.offering_id = o.id
    WHERE o.student_id = ANY(${studentIds}::uuid[])
      AND o.s_program_code = ${input.programCode}
      AND (y.s_year_code < ${year.sYearCode}
        OR (y.s_year_code = ${year.sYearCode} AND t.s_term_order <= ${term.sTermOrder}))
    ORDER BY o.student_id, y.s_year_code, t.s_term_order, o.s_curriculum_id
  `;
  const gradesByStudent = new Map<string, StudentGradeAttempt[]>();
  for (const row of offeringRows) {
    const grades = gradesByStudent.get(row.student_id) || [];
    grades.push({
      courseCode: row.s_curriculum_id,
      courseName: row.s_course_name,
      credits: Number(row.s_credits),
      academicYear: row.s_year_code,
      termCode: row.s_term_code,
      termOrder: Number(row.s_term_order),
      score10: row.score_10 == null ? null : Number(row.score_10),
      score4: row.score_4 == null ? null : Number(row.score_4),
      letterCode: row.letter_code || row.special_code || null,
      specialCode: row.special_code,
      isPass: row.is_pass,
      notScore: row.not_score,
      scoreStatus: row.score_status,
    });
    gradesByStudent.set(row.student_id, grades);
  }

  const assessmentTimeline = StudentTrainingProgressService.determineTimeline(
    cohort.sCohortCode,
    cohort.sCohortName,
    year.sYearCode,
    term.sTermCode,
    term.sTermOrder,
  );
  const benchmarkSemesterNo = assessmentTimeline.expectedSemesterNo + 1;
  const timeline = {
    ...assessmentTimeline,
    expectedSemesterNo: benchmarkSemesterNo,
    expectedYear: Math.ceil(benchmarkSemesterNo / 2),
    expectedSemester: benchmarkSemesterNo % 2 === 1 ? "HK1" : "HK2",
  };

  const semesterPlans = await loadSemesterCreditPlans(input.cohortId, input.trainingProgramId);
  const progressSchedules = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, progressCohortCode: true, progressCohortFromYear: true },
  });
  const scheduleByStudent = new Map(progressSchedules.map(student => [student.id, student]));
  for (const student of input.students) {
    const grades = gradesByStudent.get(student.id) || [];
    const studyCohort = studentProgressCohort(scheduleByStudent.get(student.id) || {}, year.sYearCode) ||
      inferStudentProgressCohort({administrativeCohortCode:cohort.sCohortCode,programCode:student.programCode || input.programCode,
        currentAcademicYear:year.sYearCode,currentTermCode:term.sTermCode,curriculum,registrations:grades})?.cohortCode;
    const studyTimeline = studyCohort ? StudentTrainingProgressService.determineTimeline(
      studyCohort, null, year.sYearCode, term.sTermCode, term.sTermOrder,
    ) : null;
    const studyBenchmark = studyTimeline ? studyTimeline.expectedSemesterNo + 1 : benchmarkSemesterNo;
    const evaluation = evaluateStudentTrainingProgress({
      student: {
        id: student.id,
        studentCode: student.code,
        fullName: student.name,
        classCode: student.classCode || null,
        className: student.className || null,
        cohortCode: cohort.sCohortCode,
        programCode: student.programCode || input.programCode,
      },
      curriculum,
      grades,
      timeline: studyTimeline ? {
        ...studyTimeline,
        expectedSemesterNo: studyBenchmark,
        expectedYear: Math.ceil(studyBenchmark / 2),
        expectedSemester: studyBenchmark % 2 === 1 ? "HK1" : "HK2",
        administrativeSemesterNo: benchmarkSemesterNo,
      } : timeline,
      rules: { requiredTotalCredits, requiredElectiveCredits },
      semesterPlans,
      lockTimeline: true,
    });
    const hasPending = grades.some((grade) => {
      if (grade.academicYear !== year.sYearCode || grade.termCode !== term.sTermCode) return false;
      const exact = curriculumByCode.get(normalizeCourseCode(grade.courseCode));
      const byName = curriculumByName.get(normalizeCourseName(grade.courseName)) || [];
      const matched = exact || (byName.length === 1 ? byName[0] : null);
      if (!matched || matched.isConditional) return false;
      return courseOutcome(grade) === "pending" || courseOutcome(grade) === "unknown";
    });
    // Tổng số tín chỉ toàn khóa chỉ phục vụ tính phần trăm hoàn thành và không
    // làm mất khả năng đối chiếu số tín chỉ lẽ ra phải đạt tại mốc học kỳ này.
    // Chỉ chặn kết luận khi chính danh mục CTĐT hoặc định mức nhóm tự chọn còn
    // thiếu, vì khi đó creditDeficit có thể bị thấp hơn thực tế.
    const configurationIncomplete = evaluation.warnings.some((warning) =>
      warning.includes("UNKNOWN_REQUIREMENT") || warning.includes("chưa có danh mục"),
    );
    const progressUnknown = evaluation.scheduleProgress.progressStatus === "UNKNOWN";
    signals.set(student.id, {
      // Even when elective-group configuration is incomplete, the exact CTĐT
      // still provides a usable lower-bound gap from planned credits and
      // mandatory courses. Preserve it as PARTIAL evidence: it may raise a
      // yellow/red warning, but can never certify a student as green.
      creditDeficit: hasPending || progressUnknown ? null : evaluation.scheduleProgress.overdueCredits,
      dataStatus: configurationIncomplete || progressUnknown ? "PARTIAL" : hasPending ? "PARTIAL" : "COMPLETE",
      reasonCode: progressUnknown ? "TRAINING_PROGRESS_EVIDENCE_INSUFFICIENT" : hasPending
        ? "TRAINING_PROGRESS_PENDING_RESULTS"
        : configurationIncomplete ? "TRAINING_PROGRESS_ELECTIVE_CONFIGURATION_PARTIAL" : null,
      sourceId: input.trainingProgramId,
      expectedCreditsToDate: evaluation.scheduleProgress.expectedCreditsToDate,
      earnedCreditsToDate: evaluation.scheduleProgress.earnedCreditsToDate,
    });
  }
  return signals;
}
