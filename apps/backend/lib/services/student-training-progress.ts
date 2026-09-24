import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { studentIdWhere } from "@/lib/utils/is-uuid";

// ============================================================================
// Types
// ============================================================================

export type TrainingProgressCourse = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: "mandatory" | "elective" | "conditional" | string;
  semesterNo: number;
  choiceGroupCode?: string | null;
  isConditional?: boolean;
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
  isConditional?: boolean;
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
  plannedCredits?: number;
  mandatoryCredits?: number;
  electivePlannedCredits?: number;
  completionPercentage?: number;
  completedCredits: number;
  remainingCredits: number;
  completedCourses: number;
  failedCourses: number;
  noScoreCourses: number;
  notCompletedCourses: number;
  status: "COMPLETED" | "INCOMPLETE" | "CURRENT_PLAN" | "FUTURE" | "UNKNOWN";
  timelineType?: "PAST_COMPLETED" | "CURRENT_STUDYING" | "FUTURE_PLANNED";
  statusLabel?: string;
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
    benchmarkLabel?: string;
    currentAcademicYear: string;
    currentTermCode: string;
    expectedYear: number;
    expectedSemester: string;
    expectedSemesterNo: number;
    latestCompletedSemester: number;
    lastCompletedSemester: number;
    progressGap: number;
    progressStatus: "ON_TRACK" | "BEHIND";
    isOnTrack: boolean;
    isBehind: boolean;
    isAhead: boolean;
    statusReason?: string;
    expectedCreditsToDate: number;
    earnedCreditsToDate: number;
    creditDifference: number;
    creditDifferenceText?: string;
    expectedRequiredCoursesCount: number;
    completedRequiredCoursesCount: number;
    missingRequiredCoursesCount: number;
    missingRequiredCredits: number;
    missingRequiredCourses: AssessedCourse[];
    expectedElectiveCredits: number;
    earnedElectiveCredits: number;
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

/**
 * Check if a course is a conditional/prerequisite certificate course
 * (Giáo dục quốc phòng - an ninh, Giáo dục thể chất, Sinh hoạt công dân).
 * Căn cứ 2020_CTDT_K44.pdf (Trang 21) & 2026-Ke-hoach-giang-day-nh-26-27 (1).pdf:
 * Các học phần này là điều kiện tốt nghiệp, không tính vào số tín chỉ tích lũy trong kỳ.
 */
export function isConditionalCourse(
  courseCode?: string | null,
  courseName?: string | null,
): boolean {
  const code = (courseCode || "").toUpperCase().trim();
  const name = (courseName || "").toLowerCase().trim();

  // Giáo dục quốc phòng và an ninh (QP...)
  if (code.startsWith("QP") || name.includes("quốc phòng") || name.includes("an ninh")) {
    return true;
  }

  // Giáo dục thể chất (TC... hoặc 25TC...)
  if (
    code.startsWith("TC") ||
    code.startsWith("25TC") ||
    name.includes("thể chất") ||
    name.includes("điền kinh") ||
    name.includes("bóng đá") ||
    name.includes("bóng chuyền") ||
    name.includes("bóng bàn") ||
    name.includes("cầu lông") ||
    name.includes("pickleball") ||
    name.includes("bóng ném") ||
    name.includes("võ tự vệ") ||
    name.includes("võ karate")
  ) {
    return true;
  }

  // Sinh hoạt công dân
  if (code.startsWith("SHCD") || name.includes("sinh hoạt công dân")) {
    return true;
  }

  return false;
}

// ============================================================================
// Standard Semester Credit Plans (Căn cứ PDF 2026-Ke-hoach-giang-day-nh-26-27 (1).pdf - Mẫu 07/QLĐT)
// ============================================================================

export function getStandardSemesterPlannedCredits(
  semesterNo: number,
  programCode?: string | null,
): number {
  const code = (programCode || "").toUpperCase();
  const isPM = code.includes("PM");
  const isKHDL = code.includes("KHDL");
  const isMMT = code.includes("MMT");

  switch (semesterNo) {
    case 1:
      // K50 Năm 1 HK1: 13 TC học thuật bắt buộc (GDTC/GDQP là môn điều kiện trong ngoặc đơn, không tính vào số TC trong kỳ)
      return 13;
    case 2:
      // K50 Năm 1 HK2: 4 học phần bắt buộc (10 TC) + SV chọn 6/12 TC tự chọn = 16 TC (PDF Trang 1: Tổng cộng 16/22)
      return 16;
    case 3:
      // K49 Năm 2 HK1: 6 học phần bắt buộc (12 TC) + SV chọn 6/9 TC tự chọn = 18 TC (PDF Trang 2: Tổng cộng 18/21)
      return 18;
    case 4:
      // K49 Năm 2 HK2: 4 học phần bắt buộc (13 TC) + SV chọn 3/9 TC tự chọn = 16 TC (PDF Trang 2: Tổng cộng 16/22)
      return 16;
    case 5:
      // K48 Năm 3 HK1: 4 học phần bắt buộc (13 TC) + SV chọn 3/6 TC tự chọn = 16 TC (PDF Trang 3: Tổng cộng 16/19)
      return 16;
    case 6:
      // K48 Năm 3 HK2: 3 học phần bắt buộc (10 TC) + 1 môn bổ trợ (3 TC) + tự chọn chuyên ngành
      // - Chuyên ngành Kỹ thuật phần mềm (PM): 10 + 3 + 6 = 19 TC (PDF Trang 4: Tổng cộng 19/22)
      // - Chuyên ngành Mạng máy tính (MMT): 10 + 3 + 4 = 17 TC (PDF Trang 3: Tổng cộng 17/25)
      // - Chuyên ngành Khoa học dữ liệu (KHDL): 10 + 3 + 3 = 16 TC (PDF Trang 4: Tổng cộng 16/21)
      if (isPM) return 19;
      if (isKHDL) return 16;
      if (isMMT) return 17;
      return 17;
    case 7:
      // K47 Năm 4 HK1: 3 học phần bắt buộc (9 TC) + SV chọn 9/12 TC tự chọn ngành = 18 TC (PDF Trang 5: Tổng cộng 18/21)
      return 18;
    case 8:
      // K47 Năm 4 HK2: 2 học phần bắt buộc (6 TC) + SV chọn 12/15-16 TC tự chọn ngành = 18 TC (PDF Trang 6: Tổng cộng 18/21 - 18/22)
      return 18;
    case 9:
      // K46 Năm 5 HK1 (Tốt nghiệp): Thực tập nghề nghiệp (8 TC) + Đồ án tốt nghiệp (10 TC) = 18 TC (PDF Trang 7: Tổng cộng 18/18)
      return 18;
    default:
      return 16;
  }
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
  semesterPlans?: Map<number, number>;
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

    // Active current semester attempt (enrolled in current term without final grade, or pending/notScore)
    const hasActiveCurrentAttempt = attempts.some(
      (a) =>
        (a.notScore === true || a.scoreStatus === "pending" || (!a.isPass && a.score10 == null && a.score4 == null && !a.letterCode)) ||
        (a.academicYear === input.timeline.currentAcademicYear && a.termCode === input.timeline.currentTermCode && a.isPass !== true && (a.score10 == null || a.letterCode == null)),
    );

    let status: CourseProgressStatus;
    if (passingAttempt) {
      status = "PASSED"; // TC01, TC05
    } else if (hasActiveCurrentAttempt) {
      status = "NO_SCORE"; // In-progress / no final score yet
    } else if (hasFail) {
      status = "FAILED"; // TC02
    } else if (attempts.length > 0) {
      status = "NO_SCORE"; // TC03
    } else {
      status = "NOT_COMPLETED"; // TC04
    }

    const isCond = course.isConditional || isConditionalCourse(course.courseCode, course.courseName);
    let requirementType: string;
    if (isCond) {
      requirementType = "conditional";
    } else if (isMandatory(course.requirementType)) {
      requirementType = "mandatory";
    } else {
      requirementType = "elective";
    }

    // Timeline categorization relative to expectedSemesterNo
    let timelineCategory: CourseTimelineCategory | null = null;
    if (status === "PASSED") {
      if (course.semesterNo > input.timeline.expectedSemesterNo) {
        timelineCategory = "AHEAD"; // TC10
      }
    } else {
      if (course.semesterNo < input.timeline.expectedSemesterNo) {
        if (!isCond && (requirementType === "mandatory" || status === "FAILED")) {
          timelineCategory = "PAST_DUE"; // TC09
        }
      } else if (course.semesterNo === input.timeline.expectedSemesterNo) {
        timelineCategory = "CURRENT_PLAN";
      } else {
        timelineCategory = "FUTURE"; // TC11
      }
    }

    const latestAttempt = attempts.at(-1);

    return {
      ...course,
      requirementType,
      isConditional: isCond,
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

  // 5. Separate Mandatory, Elective and Conditional (GDQP/GDTC)
  const mandatoryCourses = assessedCourses.filter((c) => c.requirementType === "mandatory" && !c.isConditional);
  const electiveCourses = assessedCourses.filter((c) => c.requirementType === "elective" && !c.isConditional);
  const conditionalCourses = assessedCourses.filter((c) => c.isConditional || c.requirementType === "conditional");

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

  // Detect studying semester from NO_SCORE courses if present:
  // "Ở học kì mà có nhiều môn 'Chưa có điểm' thì đó là học kì 'đang theo học' của sinh viên đó"
  const semNoScoreCounts = new Map<number, number>();
  for (const c of assessedCourses) {
    if (c.status === "NO_SCORE") {
      semNoScoreCounts.set(c.semesterNo, (semNoScoreCounts.get(c.semesterNo) || 0) + 1);
    }
  }

  let effectiveSemesterNo = input.timeline.expectedSemesterNo;
  let effectiveYear = input.timeline.expectedYear;
  let effectiveSemester = input.timeline.expectedSemester;

  if (semNoScoreCounts.size > 0) {
    let maxCount = 0;
    let bestSem = effectiveSemesterNo;
    for (const [sNo, count] of semNoScoreCounts.entries()) {
      if (count > maxCount || (count === maxCount && sNo > bestSem)) {
        maxCount = count;
        bestSem = sNo;
      }
    }
    effectiveSemesterNo = bestSem;
    effectiveYear = Math.ceil(bestSem / 2);
    effectiveSemester = bestSem % 2 === 1 ? "HK1" : "HK2";
  }

  // Recalculate timelineCategory for all courses based on effectiveSemesterNo
  for (const course of assessedCourses) {
    if (course.status === "PASSED") {
      course.timelineCategory = course.semesterNo > effectiveSemesterNo ? "AHEAD" : null;
    } else {
      if (course.semesterNo < effectiveSemesterNo) {
        if (!course.isConditional && (course.requirementType === "mandatory" || course.status === "FAILED")) {
          course.timelineCategory = "PAST_DUE";
        } else {
          course.timelineCategory = null;
        }
      } else if (course.semesterNo === effectiveSemesterNo) {
        course.timelineCategory = "CURRENT_PLAN";
      } else {
        course.timelineCategory = "FUTURE";
      }
    }
  }

  // Course counts
  const completedCourses = assessedCourses.filter((c) => c.status === "PASSED");
  const failedCourses = assessedCourses.filter((c) => c.status === "FAILED");
  const noScoreCourses = assessedCourses.filter((c) => c.status === "NO_SCORE");
  const notCompletedCourses = assessedCourses.filter((c) => c.status === "NOT_COMPLETED");
  const pastDueCourses = assessedCourses.filter((c) => c.timelineCategory === "PAST_DUE");
  const futureCourses = assessedCourses.filter((c) => c.timelineCategory === "FUTURE");
  const aheadCourses = assessedCourses.filter((c) => c.timelineCategory === "AHEAD");

  // 8. Evaluation Landmark: CÁC HỌC KỲ ĐÃ KẾT THÚC (s < effectiveSemesterNo)
  const completedSemestersToDate: number[] = [];
  for (let s = 1; s < effectiveSemesterNo; s++) {
    completedSemestersToDate.push(s);
  }

  const getPlannedCreditsForSemester = (s: number, sCourses: AssessedCourse[]): number => {
    if (input.semesterPlans?.has(s)) {
      return input.semesterPlans.get(s)!;
    }
    const sAcademicCourses = sCourses.filter((c) => !c.isConditional && c.requirementType !== "conditional");
    const sCredits = sAcademicCourses.reduce((sum, c) => sum + c.credits, 0);
    if (sCredits === 0) return 0;
    const standard = getStandardSemesterPlannedCredits(s, input.student.programCode);
    return Math.min(standard, sCredits);
  };

  // Planned credits to date (sum of planned credits for completed semesters, excluding GDTC/GDQP)
  let expectedCreditsToDate = 0;
  let expectedElectiveCredits = 0;

  for (const s of completedSemestersToDate) {
    const sCourses = assessedCourses.filter((c) => c.semesterNo === s);
    const sAcademicCourses = sCourses.filter((c) => !c.isConditional && c.requirementType !== "conditional");
    const sMandatoryCredits = sAcademicCourses
      .filter((c) => c.requirementType === "mandatory")
      .reduce((sum, c) => sum + c.credits, 0);

    const sPlannedCredits = getPlannedCreditsForSemester(s, sCourses);
    expectedCreditsToDate += sPlannedCredits;

    const sPlanElective = Math.max(0, sPlannedCredits - sMandatoryCredits);
    expectedElectiveCredits += sPlanElective;
  }

  // Earned credits to date: student's actual accumulated academic credits
  // (completed academic mandatory courses + credited elective courses)
  const earnedCreditsToDate = completedMandatoryCredits + overallCreditedElectives;
  const earnedElectiveCredits = overallCreditedElectives;

  // Expected academic mandatory courses to date (must have been passed, excluding GDTC/GDQP)
  const expectedRequiredCourses = assessedCourses.filter(
    (c) => c.requirementType === "mandatory" && !c.isConditional && c.semesterNo < effectiveSemesterNo,
  );
  const completedRequiredCourses = expectedRequiredCourses.filter((c) => c.status === "PASSED");
  const missingRequiredCourses = expectedRequiredCourses.filter((c) => c.status !== "PASSED");

  const expectedRequiredCoursesCount = expectedRequiredCourses.length;
  const completedRequiredCoursesCount = completedRequiredCourses.length;
  const missingRequiredCoursesCount = missingRequiredCourses.length;
  const missingRequiredCredits = missingRequiredCourses.reduce((sum, c) => sum + c.credits, 0);

  // Credit difference to date
  const creditDifference = earnedCreditsToDate - expectedCreditsToDate;
  let creditDifferenceText = "Đúng kế hoạch";
  if (creditDifference < 0) {
    creditDifferenceText = `Chậm ${Math.abs(creditDifference)} TC`;
  } else if (creditDifference > 0) {
    creditDifferenceText = `Học vượt +${creditDifference} TC`;
  }

  // Evaluate Progress Status: ONLY 2 levels: ON_TRACK | BEHIND
  const isMissingMandatory = missingRequiredCoursesCount > 0;
  const isCreditDeficient = earnedCreditsToDate < expectedCreditsToDate;
  const isElectiveDeficient = expectedElectiveCredits > 0 && earnedElectiveCredits < expectedElectiveCredits;

  const progressStatus: "ON_TRACK" | "BEHIND" =
    (!isMissingMandatory && !isCreditDeficient && !isElectiveDeficient)
      ? "ON_TRACK"
      : "BEHIND";

  // Status reason
  let statusReason = "Đúng tiến độ đào tạo";
  if (progressStatus === "BEHIND") {
    const reasons: string[] = [];
    if (isCreditDeficient) {
      reasons.push(`Chậm ${Math.abs(creditDifference)} TC`);
    }
    if (isMissingMandatory) {
      reasons.push(`Nợ ${missingRequiredCoursesCount} học phần bắt buộc (${missingRequiredCredits} TC)`);
    }
    if (isElectiveDeficient) {
      reasons.push(`Thiếu ${expectedElectiveCredits - earnedElectiveCredits} TC tự chọn`);
    }
    statusReason = reasons.join(" • ");
  } else if (creditDifference > 0) {
    statusReason = `Đúng tiến độ (Học vượt +${creditDifference} TC)`;
  }

  // Overdue credits: total credits deficient from past semesters
  const pastDueCredits = pastDueCourses.reduce((sum, c) => sum + c.credits, 0);
  const overdueCredits = progressStatus === "BEHIND"
    ? Math.max(
        missingRequiredCredits + Math.max(0, expectedElectiveCredits - earnedElectiveCredits),
        Math.max(0, -creditDifference),
        pastDueCredits,
      )
    : 0;

  // Ahead credits
  const aheadCredits = aheadCourses.reduce((sum, c) => sum + c.credits, 0);
  const currentPlanCredits = assessedCourses
    .filter((c) => c.timelineCategory === "CURRENT_PLAN")
    .reduce((sum, c) => sum + c.credits, 0);

  const isOnTrack = progressStatus === "ON_TRACK";
  const isBehind = progressStatus === "BEHIND";
  const isAhead = aheadCredits > 0 || creditDifference > 0;

  // 9. Semester-by-semester breakdown (Accordion/timeline structure)
  const maxSemester = Math.max(
    ...deduplicatedCurriculum.map((c) => c.semesterNo),
    effectiveSemesterNo,
    8,
  );

  const semesters: SemesterProgress[] = [];
  let lastCompletedSemester = 0;
  let consecutivePass = true;

  for (let s = 1; s <= maxSemester; s++) {
    const sCourses = assessedCourses.filter((c) => c.semesterNo === s);
    const sAcademicCourses = sCourses.filter((c) => !c.isConditional && c.requirementType !== "conditional");
    const sMandatory = sAcademicCourses.filter((c) => c.requirementType === "mandatory");
    const sMandatoryRequiredCredits = sMandatory.reduce((sum, c) => sum + c.credits, 0);
    const sCompletedCredits = sAcademicCourses
      .filter((c) => c.status === "PASSED")
      .reduce((sum, c) => sum + c.credits, 0);

    // Kế hoạch tín chỉ chuẩn theo Kế hoạch giảng dạy NH 2026-2027 (Mẫu 07/QLĐT) hoặc CTĐT (không tính GDTC/GDQP)
    const sPlannedCredits = getPlannedCreditsForSemester(s, sCourses);

    const sRequiredCredits = sPlannedCredits;
    const sRemainingCredits = Math.max(0, sPlannedCredits - sCompletedCredits);
    const sCompletionPercentage = sPlannedCredits > 0 ? Math.round((sCompletedCredits / sPlannedCredits) * 100) : 0;

    const sCompletedCount = sCourses.filter((c) => c.status === "PASSED").length;
    const sFailedCount = sAcademicCourses.filter((c) => c.status === "FAILED").length;
    const sNoScoreCount = sCourses.filter((c) => c.status === "NO_SCORE").length;
    const sNotCompletedCount = sCourses.filter((c) => c.status === "NOT_COMPLETED").length;

    let sStatus: "COMPLETED" | "INCOMPLETE" | "CURRENT_PLAN" | "FUTURE" | "UNKNOWN";
    let timelineType: "PAST_COMPLETED" | "CURRENT_STUDYING" | "FUTURE_PLANNED";
    let statusLabel: string;

    const allMandatoryPassed = sMandatory.length === 0 || sMandatory.every((c) => c.status === "PASSED");

    if (s < effectiveSemesterNo) {
      timelineType = "PAST_COMPLETED";
      if (allMandatoryPassed && sCompletedCredits >= sPlannedCredits) {
        sStatus = "COMPLETED";
        statusLabel = sCompletedCredits > sPlannedCredits ? `Đạt kỳ (+${sCompletedCredits - sPlannedCredits} TC)` : "Đạt kỳ";
      } else {
        sStatus = "INCOMPLETE";
        if (!allMandatoryPassed || sFailedCount > 0) {
          statusLabel = "Nợ môn";
        } else {
          statusLabel = `Thiếu ${sRemainingCredits} TC`;
        }
      }
    } else if (s === effectiveSemesterNo) {
      timelineType = "CURRENT_STUDYING";
      sStatus = "CURRENT_PLAN";
      statusLabel = "Đang theo học";
    } else {
      timelineType = "FUTURE_PLANNED";
      sStatus = "FUTURE";
      statusLabel = sCompletedCount > 0 ? `Học trước (+${sCompletedCredits} TC)` : "Kế hoạch";
    }

    if (sStatus === "COMPLETED" && consecutivePass) {
      lastCompletedSemester = s;
    } else if (s < effectiveSemesterNo) {
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
      plannedCredits: sPlannedCredits,
      mandatoryCredits: sMandatoryRequiredCredits,
      completionPercentage: sCompletionPercentage,
      completedCredits: sCompletedCredits,
      remainingCredits: sRemainingCredits,
      completedCourses: sCompletedCount,
      failedCourses: sFailedCount,
      noScoreCourses: sNoScoreCount,
      notCompletedCourses: sNotCompletedCount,
      status: sStatus,
      timelineType,
      statusLabel,
      courses: sCourses,
    });
  }

  const progressGap = Math.max(0, (effectiveSemesterNo - 1) - lastCompletedSemester);

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
      benchmarkLabel: `Năm ${effectiveYear} - ${effectiveSemester} (Học kỳ ${effectiveSemesterNo})`,
      currentAcademicYear: input.timeline.currentAcademicYear,
      currentTermCode: input.timeline.currentTermCode,
      expectedYear: effectiveYear,
      expectedSemester: effectiveSemester,
      expectedSemesterNo: effectiveSemesterNo,
      latestCompletedSemester: effectiveSemesterNo > 1 ? effectiveSemesterNo - 1 : 0,
      lastCompletedSemester,
      progressGap,
      progressStatus,
      isOnTrack,
      isBehind,
      isAhead,
      statusReason,
      expectedCreditsToDate,
      earnedCreditsToDate,
      creditDifference,
      creditDifferenceText,
      expectedRequiredCoursesCount,
      completedRequiredCoursesCount,
      missingRequiredCoursesCount,
      missingRequiredCredits,
      missingRequiredCourses,
      expectedElectiveCredits,
      earnedElectiveCredits,
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

  // ==========================================================================
  // Memoization Caches (prevents N+1 database queries during bulk evaluation)
  // ==========================================================================
  private static academicContextCache: {
    timestamp: number;
    year: string;
    termCode: string;
    termOrder: number;
  } | null = null;

  private static programConfigCache = new Map<
    string,
    {
      timestamp: number;
      program: { id: string; sProgramCode: string; sProgramName: string } | null;
      curriculum: TrainingProgressCourse[];
      requiredTotalCredits: number | null;
      requiredElectiveCredits: number | null;
      semesterPlansMap?: Map<number, number>;
    }
  >();

  private static readonly CONFIG_CACHE_TTL = 120 * 1000; // 2 minutes

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

    // 2. Load Current Academic Year & Term (cached for 2 minutes to prevent repeated queries)
    let currentYearCode = "2026-2027";
    let currentTermCode = "HK01";
    let currentTermOrder = 1;

    if (
      this.academicContextCache &&
      Date.now() - this.academicContextCache.timestamp < this.CONFIG_CACHE_TTL
    ) {
      currentYearCode = this.academicContextCache.year;
      currentTermCode = this.academicContextCache.termCode;
      currentTermOrder = this.academicContextCache.termOrder;
    } else {
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
      if (currentYear) currentYearCode = currentYear.sYearCode;
      if (currentTerm) {
        currentTermCode = currentTerm.sTermCode;
        currentTermOrder = currentTerm.sTermOrder;
      }
      this.academicContextCache = {
        timestamp: Date.now(),
        year: currentYearCode,
        termCode: currentTermCode,
        termOrder: currentTermOrder,
      };
    }

    const timeline = this.determineTimeline(
      cohort?.sCohortCode,
      cohort?.sCohortName,
      currentYearCode,
      currentTermCode,
      currentTermOrder,
    );

    // 3. Resolve Training Program (CTĐT) & Rules (cached per programCode + cohortId)
    const programCode = student.sStudyProgramId || "";
    const configCacheKey = `${programCode}__${cohort?.id || ""}`;

    let program: { id: string; sProgramCode: string; sProgramName: string } | null = null;
    let curriculum: TrainingProgressCourse[] = [];
    let requiredTotalCredits: number | null = null;
    let requiredElectiveCredits: number | null = null;
    let semesterPlansMap: Map<number, number> | undefined;

    const cachedConfig = this.programConfigCache.get(configCacheKey);
    if (
      cachedConfig &&
      Date.now() - cachedConfig.timestamp < this.CONFIG_CACHE_TTL
    ) {
      program = cachedConfig.program;
      curriculum = cachedConfig.curriculum;
      requiredTotalCredits = cachedConfig.requiredTotalCredits;
      requiredElectiveCredits = cachedConfig.requiredElectiveCredits;
      semesterPlansMap = cachedConfig.semesterPlansMap;
    } else {
      program = programCode
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

        if (programCode.includes("-")) {
          const baseCode = programCode.split("-")[0];
          const baseProgram = await prisma.trainingProgram.findFirst({
            where: { sProgramCode: baseCode, deletedAt: null },
          });
          if (baseProgram) {
            const baseCourses = await prisma.$queryRaw<Array<{
              course_id: string;
              s_course_code: string;
              s_course_name: string;
              s_credits: number;
              s_requirement_type: string;
              s_semester_no: number;
            }>>`
              SELECT c.id::text as course_id, c.s_course_code, c.s_course_name,
                     pc.s_credits, pc.s_requirement_type, pc.s_semester_no
              FROM training_program_courses pc
              JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
              WHERE pc.training_program_id = ${baseProgram.id}::uuid
              ORDER BY pc.s_semester_no, c.s_course_code
            `;

            const nonSem1Semesters = rawCurriculumCourses
              .map((c) => Number(c.s_semester_no))
              .filter((s) => s > 1);
            const minSpecializedSemester = nonSem1Semesters.length > 0 ? Math.min(...nonSem1Semesters) : 5;

            const baseCourseMap = new Map(
              baseCourses.map((c) => [normalizeCourseCode(c.s_course_code), c])
            );

            rawCurriculumCourses = rawCurriculumCourses.map((c) => {
              const base = baseCourseMap.get(normalizeCourseCode(c.s_course_code));
              if (c.s_semester_no === 1 && base && base.s_semester_no > 1 && base.s_semester_no < minSpecializedSemester) {
                return { ...c, s_semester_no: base.s_semester_no };
              }
              return c;
            });

            const existingCodes = new Set(
              rawCurriculumCourses.map((c) => normalizeCourseCode(c.s_course_code))
            );
            for (const baseCourse of baseCourses) {
              const normCode = normalizeCourseCode(baseCourse.s_course_code);
              if (!existingCodes.has(normCode) && baseCourse.s_semester_no < minSpecializedSemester) {
                rawCurriculumCourses.push(baseCourse);
                existingCodes.add(normCode);
              }
            }
          }
        }
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

      curriculum = rawCurriculumCourses.map((row) => {
        const isCond = isConditionalCourse(row.s_course_code, row.s_course_name);
        return {
          courseId: row.course_id,
          courseCode: row.s_course_code,
          courseName: row.s_course_name,
          credits: Number(row.s_credits),
          requirementType: isCond ? "conditional" : row.s_requirement_type,
          semesterNo: Number(row.s_semester_no),
          choiceGroupCode: choiceGroupMap.get(normalizeCourseCode(row.s_course_code)) || null,
          isConditional: isCond,
        };
      });

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

      if (program && cohort) {
        const dbPlans = await prisma.trainingProgressPlan.findMany({
          where: { cohortId: cohort.id, trainingProgramId: program.id },
          select: { curriculumSemesterNo: true, requiredElectiveCredits: true },
        });
        if (dbPlans.length > 0) {
          semesterPlansMap = new Map();
          for (const pl of dbPlans) {
            if (pl.requiredElectiveCredits > 0) {
              semesterPlansMap.set(pl.curriculumSemesterNo, pl.requiredElectiveCredits);
            }
          }
        }
      }

      this.programConfigCache.set(configCacheKey, {
        timestamp: Date.now(),
        program,
        curriculum,
        requiredTotalCredits,
        requiredElectiveCredits,
        semesterPlansMap,
      });
    }


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

    const grades: StudentGradeAttempt[] = offerings
      .filter((r) => {
        const code = (r.s_curriculum_id || "").toUpperCase();
        const name = (r.s_course_name || "").toLowerCase();
        return !code.startsWith("SHCD") && !name.includes("sinh hoạt công dân");
      })
      .map((r) => ({
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

    // Detect student's actual active semester based on enrolled courses in the current academic term
    const currentOfferings = offerings.filter(
      (o) =>
        o.s_year_code === timeline.currentAcademicYear &&
        o.s_term_code === timeline.currentTermCode,
    );
    if (currentOfferings.length > 0) {
      const activeSemesters = currentOfferings
        .map((o) => {
          const norm = normalizeCourseCode(o.s_curriculum_id);
          const found = curriculum.find((c) => normalizeCourseCode(c.courseCode) === norm);
          return found?.semesterNo;
        })
        .filter((s): s is number => typeof s === "number" && s > 0);

      if (activeSemesters.length > 0) {
        const activeSemesterNo = Math.max(...activeSemesters);
        timeline.expectedSemesterNo = activeSemesterNo;
        timeline.expectedYear = Math.ceil(activeSemesterNo / 2);
        timeline.expectedSemester = activeSemesterNo % 2 === 1 ? "HK1" : "HK2";
      }
    }

    // 5. Run Pure Engine

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
      semesterPlans: semesterPlansMap,
    });

    if (program) {
      result.curriculum.programId = program.id;
      result.curriculum.programName = program.sProgramName;
    }

    return result;
  }

  /**
   * Load department-level progress overview for filtered students
   */
  static async getDepartmentProgressOverview(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    cohortId?: string;
    classStudentId?: string;
    studyProgramId?: string;
    progressStatus?: "ALL" | "ON_TRACK" | "BEHIND";
    scopeWhere?: Prisma.StudentWhereInput;
  }): Promise<DepartmentProgressOverviewResult> {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
    const search = params.search?.trim();
    const cohortId = params.cohortId?.trim();
    const classStudentId = params.classStudentId?.trim();
    const studyProgramId = params.studyProgramId?.trim();
    const progressStatus = params.progressStatus || "ALL";

    // Cache key based on scope filter (not page/pageSize/progressStatus)
    const scopeCacheKey = JSON.stringify({
      search: search || "",
      cohortId: cohortId || "",
      classStudentId: classStudentId || "",
      studyProgramId: studyProgramId || "",
      scopeWhere: params.scopeWhere || {},
    });

    let evaluatedList: DepartmentProgressStudentItem[] | null = null;
    const cached = overviewCache.get(scopeCacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      evaluatedList = cached.evaluatedList;
    }

    if (!evaluatedList) {
      const where: Prisma.StudentWhereInput = {
        AND: [
          { deletedAt: null },
          params.scopeWhere || {},
        ],
      };

      if (search) {
        where.OR = [
          { sStudentId: { contains: search, mode: "insensitive" } },
          { sFullName: { contains: search, mode: "insensitive" } },
        ];
      }

      if (classStudentId) {
        where.sClassStudentId = classStudentId;
      }

      if (studyProgramId) {
        where.sStudyProgramId = studyProgramId;
      }

      if (cohortId) {
        const cohortClasses = await prisma.class.findMany({
          where: { cohortId, deletedAt: null },
          select: { classId: true },
        });
        const classIds = cohortClasses.map((c) => c.classId);
        if (classIds.length === 0) {
          return {
            kpi: {
              totalStudents: 0,
              onTrackCount: 0,
              behindCount: 0,
              onTrackPercentage: 0,
              behindPercentage: 0,
              avgDeficitCredits: 0,
            },
            items: [],
            pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
          };
        }
        if (where.sClassStudentId) {
          if (!classIds.includes(where.sClassStudentId as string)) {
            return {
              kpi: {
                totalStudents: 0,
                onTrackCount: 0,
                behindCount: 0,
                onTrackPercentage: 0,
                behindPercentage: 0,
                avgDeficitCredits: 0,
              },
              items: [],
              pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
            };
          }
        } else {
          where.sClassStudentId = { in: classIds };
        }
      }

      const students = await prisma.student.findMany({
        where,
        select: {
          id: true,
          sStudentId: true,
          sFullName: true,
          sClassStudentId: true,
          sStudyProgramId: true,
        },
        orderBy: { sStudentId: "asc" },
      });

      // Concurrently evaluate in batches of 25
      const allEvaluations: DepartmentProgressStudentItem[] = [];
      const batchSize = 25;
      for (let i = 0; i < students.length; i += batchSize) {
        const batch = students.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async (st) => {
            try {
              const res = await StudentTrainingProgressService.getStudentTrainingProgress(st.id);
              if (!res) return null;
              const sp = res.scheduleProgress;
              const semNo = sp.latestCompletedSemester ?? Math.max(0, (sp.expectedSemesterNo || 1) - 1);
              const benchmarkLabel = semNo > 0 ? `Hết HK${semNo}` : "Chưa có kỳ kết thúc";

              const item: DepartmentProgressStudentItem = {
                id: res.student.id,
                studentId: res.student.studentCode,
                fullName: res.student.fullName,
                className: res.student.className || res.student.classCode || "—",
                cohortCode: res.student.cohortCode || "—",
                programCode: res.curriculum.programCode || res.student.programCode || "—",
                benchmarkLabel,
                latestCompletedSemester: semNo,
                currentSemesterNo: sp.expectedSemesterNo || 1,
                expectedCredits: sp.expectedCreditsToDate ?? 0,
                earnedCredits: sp.earnedCreditsToDate ?? 0,
                creditDifference: sp.creditDifference ?? 0,
                creditDifferenceText:
                  sp.creditDifferenceText ||
                  (sp.creditDifference != null && sp.creditDifference < 0
                    ? `Chậm ${Math.abs(sp.creditDifference)} TC`
                    : sp.creditDifference != null && sp.creditDifference > 0
                    ? `Học vượt +${sp.creditDifference} TC`
                    : "Đúng kế hoạch"),
                missingRequiredCoursesCount: sp.missingRequiredCoursesCount ?? 0,
                missingRequiredCredits: sp.missingRequiredCredits ?? 0,
                progressStatus: sp.progressStatus ?? "ON_TRACK",
                statusReason: sp.statusReason || "",
              };
              return item;
            } catch {
              return null;
            }
          }),
        );
        for (const r of batchResults) {
          if (r) allEvaluations.push(r);
        }
      }

      evaluatedList = allEvaluations;
      overviewCache.set(scopeCacheKey, {
        timestamp: Date.now(),
        evaluatedList,
      });
    }

    // Compute KPI on the filtered scope
    const totalStudents = evaluatedList.length;
    const onTrackList = evaluatedList.filter((x) => x.progressStatus === "ON_TRACK");
    const behindList = evaluatedList.filter((x) => x.progressStatus === "BEHIND");

    const onTrackCount = onTrackList.length;
    const behindCount = behindList.length;
    const onTrackPercentage = totalStudents > 0 ? Math.round((onTrackCount / totalStudents) * 100) : 0;
    const behindPercentage = totalStudents > 0 ? Math.round((behindCount / totalStudents) * 100) : 0;

    let totalDeficit = 0;
    for (const b of behindList) {
      if (b.creditDifference < 0) {
        totalDeficit += Math.abs(b.creditDifference);
      }
    }
    const avgDeficitCredits = behindCount > 0 ? Math.round((totalDeficit / behindCount) * 10) / 10 : 0;

    const kpi = {
      totalStudents,
      onTrackCount,
      behindCount,
      onTrackPercentage,
      behindPercentage,
      avgDeficitCredits,
    };

    // Filter by progressStatus
    let filteredItems = evaluatedList;
    if (progressStatus === "ON_TRACK") {
      filteredItems = onTrackList;
    } else if (progressStatus === "BEHIND") {
      filteredItems = behindList;
    }

    // Pagination
    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (safePage - 1) * pageSize;
    const paginatedItems = filteredItems.slice(startIdx, startIdx + pageSize);

    return {
      kpi,
      items: paginatedItems,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    };
  }
}

export interface DepartmentProgressStudentItem {
  id: string;
  studentId: string;
  fullName: string;
  className: string;
  cohortCode: string;
  programCode: string;
  benchmarkLabel: string;
  latestCompletedSemester: number;
  currentSemesterNo: number;
  expectedCredits: number;
  earnedCredits: number;
  creditDifference: number;
  creditDifferenceText: string;
  missingRequiredCoursesCount: number;
  missingRequiredCredits: number;
  progressStatus: "ON_TRACK" | "BEHIND";
  statusReason: string;
}

export interface DepartmentProgressOverviewResult {
  kpi: {
    totalStudents: number;
    onTrackCount: number;
    behindCount: number;
    onTrackPercentage: number;
    behindPercentage: number;
    avgDeficitCredits: number;
  };
  items: DepartmentProgressStudentItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CachedOverview {
  timestamp: number;
  evaluatedList: DepartmentProgressStudentItem[];
}

const overviewCache = new Map<string, CachedOverview>();
const CACHE_TTL_MS = 60 * 1000;
