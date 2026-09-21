import { prisma } from "@/lib/prisma";
import { studentIdWhere } from "@/lib/utils/is-uuid";

// ============================================================================
// Types
// ============================================================================

export type TrainingProgressCourse = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: "mandatory" | "elective" | string;
  semesterNo: number;
  choiceGroupCode?: string | null;
};

export type StudentGradeAttempt = {
  courseCode: string;
  courseName?: string | null;
  credits?: number | null;
  academicYear?: string | null;
  termCode?: string | null;
  termOrder?: number | null;
  score10?: number | null;
  score4?: number | null;
  letterCode?: string | null;
  isPass?: boolean | null;
  notScore?: boolean | null;
  scoreStatus?: string | null;
};

export type CourseProgressStatus =
  | "PASSED"
  | "FAILED"
  | "NO_SCORE"
  | "NOT_COMPLETED";

export type CourseTimelineCategory =
  | "PAST_DUE"
  | "CURRENT_PLAN"
  | "FUTURE"
  | "AHEAD";

export type AssessedCourse = TrainingProgressCourse & {
  status: CourseProgressStatus;
  timelineCategory: CourseTimelineCategory | null;
  attemptCount: number;
  latestScore10?: number | null;
  latestScore4?: number | null;
  latestLetterCode?: string | null;
  passedAcademicYear?: string | null;
  passedTermCode?: string | null;
};

export type ElectiveGroupProgress = {
  code: string;
  groupCode: string;
  requiredCredits: number | null;
  passedCredits: number;
  creditedCredits: number | null;
  remainingCredits: number | null;
  extraCredits: number;
  status: "PASS" | "FAIL" | "UNKNOWN";
  courses: AssessedCourse[];
};

export type SemesterProgress = {
  semesterNo: number;
  yearStudy: number;
  termNo: number;
  name: string;
  requiredCredits: number;
  completedCredits: number;
  remainingCredits: number;
  completedCourses: number;
  failedCourses: number;
  noScoreCourses: number;
  notCompletedCourses: number;
  status: "COMPLETED" | "INCOMPLETE" | "CURRENT_PLAN" | "FUTURE" | "UNKNOWN";
  courses: AssessedCourse[];
};

export type StudentTrainingProgressOutput = {
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    classCode: string | null;
    className: string | null;
    cohortCode: string | null;
    programCode: string | null;
  };
  curriculum: {
    programId?: string | null;
    programCode: string | null;
    programName: string | null;
    totalCourses: number;
    totalCurriculumCredits: number;
  };
  summary: {
    requiredCredits: number | null;
    completedCredits: number | null;
    remainingCredits: number | null;
    progressPercent: number | null;
    completedCourses: number;
    failedCourses: number;
    noScoreCourses: number;
    notCompletedCourses: number;
  };
  scheduleProgress: {
    currentAcademicYear: string;
    currentTermCode: string;
    expectedYear: number;
    expectedSemester: string;
    expectedSemesterNo: number;
    lastCompletedSemester: number;
    progressGap: number;
    isOnTrack: boolean;
    isBehind: boolean;
    isAhead: boolean;
    overdueCredits: number;
    currentPlanCredits: number;
    aheadCredits: number;
  };
  semesters: SemesterProgress[];
  courseStatus: {
    passed: AssessedCourse[];
    failed: AssessedCourse[];
    noScore: AssessedCourse[];
    notCompleted: AssessedCourse[];
    pastDue: AssessedCourse[];
    future: AssessedCourse[];
    unmatched: Array<StudentGradeAttempt & { reason: string }>;
  };
  electiveGroups: ElectiveGroupProgress[];
  warnings: string[];
};

// ============================================================================
// Normalization & Aliases
// ============================================================================

export const COURSE_CODE_ALIASES: Readonly<Record<string, string>> = {};

export function normalizeCourseCode(value: string | null | undefined): string {
  const code = (value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
  return COURSE_CODE_ALIASES[code] ?? code;
}

export function normalizeCourseName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi");
}

export function isMandatory(reqType: string | null | undefined): boolean {
  const norm = (reqType ?? "").trim().toLocaleLowerCase("vi");
  return norm.includes("bắt") || norm === "mandatory" || norm === "compulsory";
}

// ============================================================================
// Pure Engine: evaluateStudentTrainingProgress
// ============================================================================

export function evaluateStudentTrainingProgress(input: {
  student: {
    id: string;
    studentCode: string;
    fullName: string;
    classCode: string | null;
    className?: string | null;
    cohortCode: string | null;
    programCode: string | null;
  };
  curriculum: TrainingProgressCourse[];
  grades: StudentGradeAttempt[];
  timeline: {
    currentAcademicYear: string;
    currentTermCode: string;
    expectedYear: number;
    expectedSemester: string;
    expectedSemesterNo: number;
  };
  rules?: {
    requiredTotalCredits?: number | null;
    requiredElectiveCredits?: number | null;
    choiceGroups?: Array<{ code: string; requiredCredits: number }>;
  };
}): StudentTrainingProgressOutput {
  const warnings: string[] = [];

  // 1. Deduplicate curriculum courses (TC13)
  const curriculumMap = new Map<string, TrainingProgressCourse>();
  for (const item of input.curriculum) {
    const normCode = normalizeCourseCode(item.courseCode);
    const existing = curriculumMap.get(normCode);
    if (existing) {
      if (existing.credits !== item.credits) {
        warnings.push(`Tín chỉ CTĐT không thống nhất cho học phần ${item.courseCode}: ${existing.credits} vs ${item.credits}`);
      }
      continue;
    }
    curriculumMap.set(normCode, item);
  }
  const deduplicatedCurriculum = [...curriculumMap.values()];

  if (deduplicatedCurriculum.length === 0) {
    warnings.push("CTĐT chưa có danh mục học phần để đối soát tiến độ.");
  }

  // 2. Build index for course matching (Mã -> Alias -> Tên duy nhất)
  const byCode = new Map<string, TrainingProgressCourse>();
  const byName = new Map<string, TrainingProgressCourse[]>();

  for (const c of deduplicatedCurriculum) {
    byCode.set(normalizeCourseCode(c.courseCode), c);
    const normName = normalizeCourseName(c.courseName);
    if (normName) {
      const list = byName.get(normName) || [];
      list.push(c);
      byName.set(normName, list);
    }
  }

  const matchCourse = (code?: string | null, name?: string | null): TrainingProgressCourse | null => {
    const exact = byCode.get(normalizeCourseCode(code));
    if (exact) return exact;
    const candidates = byName.get(normalizeCourseName(name)) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };

  // 3. Match grade attempts to curriculum courses
  const gradeAttemptsByCourse = new Map<string, StudentGradeAttempt[]>();
  const unmatchedGrades: Array<StudentGradeAttempt & { reason: string }> = [];

  for (const grade of input.grades) {
    if (!grade || typeof grade !== "object") continue;
    const matched = matchCourse(grade.courseCode, grade.courseName);
    if (!matched) {
      unmatchedGrades.push({
        ...grade,
        reason: "Học phần không thuộc CTĐT của sinh viên",
      });
      continue;
    }
    const list = gradeAttemptsByCourse.get(matched.courseId) || [];
    list.push(grade);
    gradeAttemptsByCourse.set(matched.courseId, list);
  }

  if (unmatchedGrades.length > 0) {
    warnings.push(`Phát hiện ${unmatchedGrades.length} lượt học phần trong bảng điểm không khớp CTĐT (được ghi nhận ở mục ngoài CTĐT).`);
  }

  // 4. Assess each curriculum course (PASS / FAIL / NO_SCORE / NOT_COMPLETED, no double-count)
  const assessedCourses: AssessedCourse[] = deduplicatedCurriculum.map((course) => {
    const attempts = gradeAttemptsByCourse.get(course.courseId) || [];
    const passingAttempt = attempts.find(
      (a) => a.isPass === true && a.notScore !== true && a.scoreStatus === "graded",
    );
    const hasFail = attempts.some(
      (a) =>
        a.isPass === false &&
        a.notScore !== true &&
        a.scoreStatus === "graded" &&
        (a.score10 != null || a.score4 != null || Boolean(a.letterCode)),
    );

    let status: CourseProgressStatus;
    if (passingAttempt) {
      status = "PASSED"; // TC01, TC05
    } else if (hasFail) {
      status = "FAILED"; // TC02
    } else if (attempts.length > 0) {
      status = "NO_SCORE"; // TC03
    } else {
      status = "NOT_COMPLETED"; // TC04
    }

    // Timeline categorization relative to expectedSemesterNo
    let timelineCategory: CourseTimelineCategory | null = null;
    if (status === "PASSED") {
      if (course.semesterNo > input.timeline.expectedSemesterNo) {
        timelineCategory = "AHEAD"; // TC10
      }
    } else {
      if (course.semesterNo < input.timeline.expectedSemesterNo) {
        timelineCategory = "PAST_DUE"; // TC09
      } else if (course.semesterNo === input.timeline.expectedSemesterNo) {
        timelineCategory = "CURRENT_PLAN";
      } else {
        timelineCategory = "FUTURE"; // TC11
      }
    }

    const latestAttempt = attempts.at(-1);

    return {
      ...course,
      requirementType: isMandatory(course.requirementType) ? "mandatory" : "elective",
      status,
      timelineCategory,
      attemptCount: attempts.length,
      latestScore10: latestAttempt?.score10 ?? null,
      latestScore4: latestAttempt?.score4 ?? null,
      latestLetterCode: latestAttempt?.letterCode ?? null,
      passedAcademicYear: passingAttempt?.academicYear ?? null,
      passedTermCode: passingAttempt?.termCode ?? null,
    };
  });

  // 5. Separate Mandatory and Elective
  const mandatoryCourses = assessedCourses.filter((c) => c.requirementType === "mandatory");
  const electiveCourses = assessedCourses.filter((c) => c.requirementType === "elective");

  const completedMandatoryCredits = mandatoryCourses
    .filter((c) => c.status === "PASSED")
    .reduce((sum, c) => sum + c.credits, 0);
  const requiredMandatoryCredits = mandatoryCourses.reduce((sum, c) => sum + c.credits, 0);

  // 6. Elective groups calculation (TC06, TC07, TC08)
  const electiveGroupMap = new Map<string, AssessedCourse[]>();
  for (const c of electiveCourses) {
    const code = c.choiceGroupCode || "CHUNG";
    const list = electiveGroupMap.get(code) || [];
    list.push(c);
    electiveGroupMap.set(code, list);
  }

  const electiveGroups: ElectiveGroupProgress[] = [];
  let totalCreditedElectiveCredits = 0;
  let hasUnknownElectiveRequirement = false;

  for (const [code, groupCourses] of electiveGroupMap) {
    // Determine group minimum from code suffix ":N" or rule config
    const matchMin = code.match(/:([1-9]\d*)$/);
    const ruleMin = input.rules?.choiceGroups?.find((g) => g.code === code)?.requiredCredits;
    const requiredCredits = matchMin ? Number(matchMin[1]) : ruleMin ?? null;

    const passedCredits = groupCourses
      .filter((c) => c.status === "PASSED")
      .reduce((sum, c) => sum + c.credits, 0);

    let creditedCredits: number | null = null;
    let remainingCredits: number | null = null;
    let extraCredits = 0;
    let status: "PASS" | "FAIL" | "UNKNOWN" = "UNKNOWN";

    if (requiredCredits !== null) {
      creditedCredits = Math.min(passedCredits, requiredCredits); // TC06
      remainingCredits = Math.max(0, requiredCredits - passedCredits); // TC06, TC07
      extraCredits = Math.max(0, passedCredits - requiredCredits); // TC06, TC08 (extra does not compensate other groups)
      status = passedCredits >= requiredCredits ? "PASS" : "FAIL";
    } else {
      hasUnknownElectiveRequirement = true;
      creditedCredits = passedCredits;
      remainingCredits = null;
      extraCredits = 0;
      status = "UNKNOWN";
    }

    if (creditedCredits !== null) {
      totalCreditedElectiveCredits += creditedCredits;
    }

    electiveGroups.push({
      code,
      groupCode: code,
      requiredCredits,
      passedCredits,
      creditedCredits,
      remainingCredits,
      extraCredits,
      status,
      courses: groupCourses,
    });
  }

  electiveGroups.sort((a, b) => a.code.localeCompare(b.code));

  if (hasUnknownElectiveRequirement) {
    warnings.push("CTĐT có nhóm tự chọn chưa cấu hình mức tín chỉ tối thiểu yêu cầu (UNKNOWN_REQUIREMENT).");
  }

  // Cap overall elective credits if rule provided
  let overallCreditedElectives = totalCreditedElectiveCredits;
  if (
    input.rules?.requiredElectiveCredits != null &&
    Number.isFinite(input.rules.requiredElectiveCredits)
  ) {
    overallCreditedElectives = Math.min(overallCreditedElectives, input.rules.requiredElectiveCredits);
  }

  // 7. Calculate overall summary & progress % (TC14)
  let requiredCredits: number | null = null;
  if (
    input.rules?.requiredTotalCredits != null &&
    Number.isFinite(input.rules.requiredTotalCredits) &&
    input.rules.requiredTotalCredits > 0
  ) {
    requiredCredits = input.rules.requiredTotalCredits;
  } else if (electiveCourses.length === 0 && requiredMandatoryCredits > 0) {
    // If all courses are mandatory, total required is known
    requiredCredits = requiredMandatoryCredits;
  }

  const completedCredits = requiredCredits !== null
    ? Math.min(completedMandatoryCredits + overallCreditedElectives, requiredCredits)
    : completedMandatoryCredits + overallCreditedElectives;

  const remainingCredits = requiredCredits !== null
    ? Math.max(0, requiredCredits - completedCredits)
    : null;

  const progressPercent = requiredCredits !== null && requiredCredits > 0
    ? Math.round((completedCredits / requiredCredits) * 10000) / 100
    : null;

  if (requiredCredits === null) {
    warnings.push("Chưa cấu hình tổng tín chỉ yêu cầu chính thức của CTĐT; tiến độ % được đặt là unknown.");
  }

  // Course counts
  const completedCourses = assessedCourses.filter((c) => c.status === "PASSED");
  const failedCourses = assessedCourses.filter((c) => c.status === "FAILED");
  const noScoreCourses = assessedCourses.filter((c) => c.status === "NO_SCORE");
  const notCompletedCourses = assessedCourses.filter((c) => c.status === "NOT_COMPLETED");
  const pastDueCourses = assessedCourses.filter((c) => c.timelineCategory === "PAST_DUE");
  const futureCourses = assessedCourses.filter((c) => c.timelineCategory === "FUTURE");
  const aheadCourses = assessedCourses.filter((c) => c.timelineCategory === "AHEAD");

  // 8. Overdue, Current Plan, Ahead Credits (TC09, TC10, TC15)
  const overdueCredits = pastDueCourses.reduce((sum, c) => sum + c.credits, 0);
  const currentPlanCredits = assessedCourses
    .filter((c) => c.timelineCategory === "CURRENT_PLAN")
    .reduce((sum, c) => sum + c.credits, 0);
  const aheadCredits = aheadCourses.reduce((sum, c) => sum + c.credits, 0);

  const isBehind = overdueCredits > 0; // TC09, TC15
  const isAhead = aheadCredits > 0; // TC10, TC15
  const isOnTrack = !isBehind;

  // 9. Semester-by-semester breakdown (Accordion/timeline structure)
  const maxSemester = Math.max(
    ...deduplicatedCurriculum.map((c) => c.semesterNo),
    input.timeline.expectedSemesterNo,
    8,
  );

  const semesters: SemesterProgress[] = [];
  let lastCompletedSemester = 0;
  let consecutivePass = true;

  for (let s = 1; s <= maxSemester; s++) {
    const sCourses = assessedCourses.filter((c) => c.semesterNo === s);
    const sMandatory = sCourses.filter((c) => c.requirementType === "mandatory");
    const sMandatoryRequiredCredits = sMandatory.reduce((sum, c) => sum + c.credits, 0);
    const sCompletedCredits = sCourses
      .filter((c) => c.status === "PASSED")
      .reduce((sum, c) => sum + c.credits, 0);

    const sRequiredCredits = sMandatoryRequiredCredits;
    const sRemainingCredits = Math.max(0, sRequiredCredits - sCompletedCredits);

    const sCompletedCount = sCourses.filter((c) => c.status === "PASSED").length;
    const sFailedCount = sCourses.filter((c) => c.status === "FAILED").length;
    const sNoScoreCount = sCourses.filter((c) => c.status === "NO_SCORE").length;
    const sNotCompletedCount = sCourses.filter((c) => c.status === "NOT_COMPLETED").length;

    let sStatus: "COMPLETED" | "INCOMPLETE" | "CURRENT_PLAN" | "FUTURE" | "UNKNOWN";
    const allMandatoryPassed = sMandatory.every((c) => c.status === "PASSED");

    if (s < input.timeline.expectedSemesterNo) {
      sStatus = allMandatoryPassed && sRemainingCredits === 0 ? "COMPLETED" : "INCOMPLETE";
    } else if (s === input.timeline.expectedSemesterNo) {
      sStatus = allMandatoryPassed && sRemainingCredits === 0 ? "COMPLETED" : "CURRENT_PLAN";
    } else {
      if (sCourses.length === 0) {
        sStatus = "FUTURE";
      } else if (allMandatoryPassed && sCompletedCount > 0) {
        sStatus = "COMPLETED";
      } else if (sCompletedCount > 0) {
        sStatus = "INCOMPLETE";
      } else {
        sStatus = "FUTURE";
      }
    }

    if (sStatus === "COMPLETED" && consecutivePass) {
      lastCompletedSemester = s;
    } else if (s < input.timeline.expectedSemesterNo) {
      consecutivePass = false;
    }

    const yearStudy = Math.ceil(s / 2);
    const termNo = s % 2 === 1 ? 1 : 2;

    semesters.push({
      semesterNo: s,
      yearStudy,
      termNo,
      name: `Năm ${yearStudy} - HK${termNo}`,
      requiredCredits: sRequiredCredits,
      completedCredits: sCompletedCredits,
      remainingCredits: sRemainingCredits,
      completedCourses: sCompletedCount,
      failedCourses: sFailedCount,
      noScoreCourses: sNoScoreCount,
      notCompletedCourses: sNotCompletedCount,
      status: sStatus,
      courses: sCourses,
    });
  }

  const progressGap = Math.max(0, input.timeline.expectedSemesterNo - lastCompletedSemester);

  return {
    student: {
      id: input.student.id,
      studentCode: input.student.studentCode,
      fullName: input.student.fullName,
      classCode: input.student.classCode,
      className: input.student.className ?? input.student.classCode,
      cohortCode: input.student.cohortCode,
      programCode: input.student.programCode,
    },
    curriculum: {
      programId: null,
      programCode: input.student.programCode,
      programName: input.student.programCode,
      totalCourses: deduplicatedCurriculum.length,
      totalCurriculumCredits: deduplicatedCurriculum.reduce((sum, c) => sum + c.credits, 0),
    },
    summary: {
      requiredCredits,
      completedCredits,
      remainingCredits,
      progressPercent,
      completedCourses: completedCourses.length,
      failedCourses: failedCourses.length,
      noScoreCourses: noScoreCourses.length,
      notCompletedCourses: notCompletedCourses.length,
    },
    scheduleProgress: {
      currentAcademicYear: input.timeline.currentAcademicYear,
      currentTermCode: input.timeline.currentTermCode,
      expectedYear: input.timeline.expectedYear,
      expectedSemester: input.timeline.expectedSemester,
      expectedSemesterNo: input.timeline.expectedSemesterNo,
      lastCompletedSemester,
      progressGap,
      isOnTrack,
      isBehind,
      isAhead,
      overdueCredits,
      currentPlanCredits,
      aheadCredits,
    },
    semesters,
    courseStatus: {
      passed: completedCourses,
      failed: failedCourses,
      noScore: noScoreCourses,
      notCompleted: notCompletedCourses,
      pastDue: pastDueCourses,
      future: futureCourses,
      unmatched: unmatchedGrades,
    },
    electiveGroups,
    warnings,
  };
}

// ============================================================================
// Database Loader Service
// ============================================================================

export class StudentTrainingProgressService {
  /**
   * Determine expected cohort milestone (Year and SemesterNo)
   * Example: Academic Year 2026-2027 HK01
   * - K49 (started 2025) -> Year 2, Semester 3 (HK1)
   * - K48 (started 2024) -> Year 3, Semester 5 (HK1)
   * - K47 (started 2023) -> Year 4, Semester 7 (HK1)
   * - K46 (started 2022) -> Year 5, Semester 9 (HK1)
   */
  static determineTimeline(
    cohortCode: string | null | undefined,
    cohortName: string | null | undefined,
    currentYearCode: string,
    currentTermCode: string,
    currentTermOrder: number,
  ) {
    const currentYearMatch = currentYearCode.match(/^(\d{4})/);
    const currentYearStart = currentYearMatch ? Number(currentYearMatch[1]) : 2026;

    // Parse cohort start year: e.g. "K49" -> 2025, or "(2025-2029)" -> 2025
    let cohortStartYear: number | null = null;
    const nameMatch = (cohortName || "").match(/\((\d{4})/);
    if (nameMatch) {
      cohortStartYear = Number(nameMatch[1]);
    } else {
      const codeMatch = (cohortCode || "").match(/K(\d+)/i);
      if (codeMatch) {
        const kNum = Number(codeMatch[1]);
        // K46 = 2022, K47 = 2023, K48 = 2024, K49 = 2025
        cohortStartYear = 2022 + (kNum - 46);
      }
    }

    if (!cohortStartYear) {
      cohortStartYear = currentYearStart - 1; // fallback
    }

    const yearDiff = Math.max(0, currentYearStart - cohortStartYear);
    const expectedYear = yearDiff + 1;
    const termNo = currentTermOrder === 2 ? 2 : 1;
    const expectedSemester = `HK${termNo}`;
    const expectedSemesterNo = (expectedYear - 1) * 2 + termNo;

    return {
      currentAcademicYear: currentYearCode,
      currentTermCode,
      expectedYear,
      expectedSemester,
      expectedSemesterNo,
    };
  }

  /**
   * Load training progress for a single student by UUID or Student ID (MSSV)
   */
  static async getStudentTrainingProgress(
    studentIdentifier: string,
    allowedClassIds?: string[] | null,
  ): Promise<StudentTrainingProgressOutput | null> {
    // 1. Load Student with class & cohort
    const student = await prisma.student.findFirst({
      where: {
        ...studentIdWhere(studentIdentifier),
        deletedAt: null,
      },
    });
    if (!student) return null;

    let studentClass: { id: string; classId: string; className: string; cohortId: string | null } | null = null;
    let cohort: { id: string; sCohortCode: string; sCohortName: string } | null = null;

    if (student.sClassStudentId) {
      studentClass = await prisma.class.findFirst({
        where: { classId: student.sClassStudentId, deletedAt: null },
      });
      if (studentClass?.cohortId) {
        cohort = await prisma.cohort.findFirst({
          where: { id: studentClass.cohortId, deletedAt: null },
        });
      }
    }

    // Class scope check if provided
    if (
      allowedClassIds !== undefined &&
      allowedClassIds !== null &&
      studentClass &&
      !allowedClassIds.includes(studentClass.id)
    ) {
      return null;
    }

    // 2. Load Current Academic Year & Term
    const [currentYear, currentTerm] = await Promise.all([
      prisma.academicYear.findFirst({
        where: { isCurrent: true, deletedAt: null },
        orderBy: { sYearCode: "desc" },
      }),
      prisma.academicTerm.findFirst({
        where: { isCurrent: true, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const timeline = this.determineTimeline(
      cohort?.sCohortCode,
      cohort?.sCohortName,
      currentYear?.sYearCode || "2026-2027",
      currentTerm?.sTermCode || "HK01",
      currentTerm?.sTermOrder || 1,
    );

    // 3. Resolve Training Program (CTĐT)
    const programCode = student.sStudyProgramId || "";
    const program = programCode
      ? await prisma.trainingProgram.findFirst({
          where: { sProgramCode: programCode, deletedAt: null },
        })
      : null;

    let rawCurriculumCourses: Array<{
      course_id: string;
      s_course_code: string;
      s_course_name: string;
      s_credits: number;
      s_requirement_type: string;
      s_semester_no: number;
    }> = [];

    if (program) {
      rawCurriculumCourses = await prisma.$queryRaw`
        SELECT c.id::text as course_id, c.s_course_code, c.s_course_name,
               pc.s_credits, pc.s_requirement_type, pc.s_semester_no
        FROM training_program_courses pc
        JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
        WHERE pc.training_program_id = ${program.id}::uuid
        ORDER BY pc.s_semester_no, c.s_course_code
      `;
    }

    let choiceGroupsFromPlans: Array<{ sCourseCode: string; choiceGroupCode: string | null }> = [];
    if (program && cohort) {
      const planIds = (await prisma.trainingProgressPlan.findMany({
        where: { cohortId: cohort.id, trainingProgramId: program.id },
        select: { id: true },
      })).map((p) => p.id);
      if (planIds.length > 0) {
        choiceGroupsFromPlans = await prisma.trainingProgressPlanCourse.findMany({
          where: {
            planId: { in: planIds },
            choiceGroupCode: { not: null },
          },
          select: { sCourseCode: true, choiceGroupCode: true },
          distinct: ["sCourseCode", "choiceGroupCode"],
        });
      }
    }

    const choiceGroupMap = new Map(
      choiceGroupsFromPlans.map((item) => [normalizeCourseCode(item.sCourseCode), item.choiceGroupCode]),
    );

    const curriculum: TrainingProgressCourse[] = rawCurriculumCourses.map((row) => ({
      courseId: row.course_id,
      courseCode: row.s_course_code,
      courseName: row.s_course_name,
      credits: Number(row.s_credits),
      requirementType: row.s_requirement_type,
      semesterNo: Number(row.s_semester_no),
      choiceGroupCode: choiceGroupMap.get(normalizeCourseCode(row.s_course_code)) || null,
    }));

    // 4. Load Student Course Offerings & Grades
    const offerings: Array<{
      s_curriculum_id: string;
      s_course_name: string;
      s_credits: number;
      s_year_code: string;
      s_term_code: string;
      s_term_order: number;
      score_10: unknown;
      score_4: unknown;
      letter_code: string | null;
      is_pass: boolean | null;
      not_score: boolean | null;
      score_status: string | null;
    }> = await prisma.$queryRaw`
      SELECT o.s_curriculum_id, o.s_course_name, o.s_credits,
             y.s_year_code, t.s_term_code, t.s_term_order,
             g.score_10, g.score_4, g.letter_code, g.is_pass, g.not_score, g.score_status
      FROM student_course_offerings o
      LEFT JOIN student_course_grades g ON g.offering_id = o.id
      JOIN academic_terms t ON t.id = o.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE o.student_id = ${student.id}::uuid
      ORDER BY y.s_year_code, t.s_term_order, o.s_curriculum_id
    `;

    const grades: StudentGradeAttempt[] = offerings.map((r) => ({
      courseCode: r.s_curriculum_id,
      courseName: r.s_course_name,
      credits: Number(r.s_credits),
      academicYear: r.s_year_code,
      termCode: r.s_term_code,
      termOrder: Number(r.s_term_order),
      score10: r.score_10 != null ? Number(r.score_10) : null,
      score4: r.score_4 != null ? Number(r.score_4) : null,
      letterCode: r.letter_code,
      isPass: r.is_pass,
      notScore: r.not_score,
      scoreStatus: r.score_status,
    }));

    // 5. Load Program Rules if configured
    let requiredTotalCredits: number | null = null;
    let requiredElectiveCredits: number | null = null;

    if (program) {
      const rules = await prisma.graduationRule.findMany({
        where: {
          trainingProgramId: program.id,
          status: "active",
          ruleCode: { in: ["TOTAL_CREDITS", "ELECTIVE_CREDITS"] },
        },
      });
      for (const rule of rules) {
        if (rule.ruleCode === "TOTAL_CREDITS" && rule.requiredValue) {
          const val = Number(rule.requiredValue);
          if (Number.isFinite(val) && val > 0) requiredTotalCredits = val;
        }
        if (rule.ruleCode === "ELECTIVE_CREDITS" && rule.requiredValue) {
          const val = Number(rule.requiredValue);
          if (Number.isFinite(val) && val >= 0) requiredElectiveCredits = val;
        }
      }
    }

    // 6. Run Pure Engine
    const result = evaluateStudentTrainingProgress({
      student: {
        id: student.id,
        studentCode: student.sStudentId,
        fullName: student.sFullName,
        classCode: student.sClassStudentId,
        className: studentClass?.className ?? student.sClassStudentId,
        cohortCode: cohort?.sCohortCode ?? null,
        programCode: program?.sProgramCode ?? programCode,
      },
      curriculum,
      grades,
      timeline,
      rules: {
        requiredTotalCredits,
        requiredElectiveCredits,
      },
    });

    if (program) {
      result.curriculum.programId = program.id;
      result.curriculum.programName = program.sProgramName;
    }

    return result;
  }
}
