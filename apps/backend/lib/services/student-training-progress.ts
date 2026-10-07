import { loadSemesterCreditPlans } from "./semester-credit-plans";
import { courseOutcome, isConditionalCourse, normalizeProgramCourseCode, curriculumElectiveGroup, isK44StandardProgram, K44_ELECTIVE_GROUPS, normalizeCourseCode, normalizeCourseName } from "../academic-course-rules";
import { assessTeachingSemester, teachingSemesterCredits } from "../semester-teaching-requirements";
export { COURSE_CODE_ALIASES, normalizeCourseCode, normalizeCourseName, isConditionalCourse } from "../academic-course-rules";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { inferStudentProgressCohort, studentProgressCohort } from "../student-progress-cohort";

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
  specialCode?: string | null;
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
  isCurrentlyStudying: boolean;
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
  plannedCredits?: number | null;
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
  timelineType?: "PAST_COMPLETED" | "CURRENT_STUDYING" | "CURRENT_PLAN" | "FUTURE_PLANNED";
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
    studyCohortCode?: string | null;
    studyScheduleSource?: "CONFIGURED" | "REGISTRATION_SEQUENCE" | null;
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
    studyingSemesterNos: number[];
    administrativeSemesterNo?: number;
    latestCompletedSemester: number;
    lastCompletedSemester: number;
    progressGap: number;
    progressStatus: "ON_TRACK" | "BEHIND" | "UNKNOWN";
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

export function isMandatory(reqType: string | null | undefined): boolean {
  const norm = (reqType ?? "").trim().toLocaleLowerCase("vi");
  return norm.includes("bắt") || norm === "mandatory" || norm === "compulsory";
}

// ============================================================================
// Standard Semester Credit Plans (Căn cứ PDF 2026-Ke-hoach-giang-day-nh-26-27 (1).pdf - Mẫu 07/QLĐT)
// ============================================================================

export function getStandardSemesterPlannedCredits(
  semesterNo: number,
  programCode?: string | null,
): number {
  return teachingSemesterCredits(semesterNo, programCode) ?? (isK44StandardProgram(programCode) ? 0 : 16);
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
    administrativeSemesterNo?: number;
  };
  rules?: {
    requiredTotalCredits?: number | null;
    requiredElectiveCredits?: number | null;
    choiceGroups?: Array<{ code: string; requiredCredits: number }>;
  };
  semesterPlans?: Map<number, number>;
  /** Keep a historical/finalized assessment boundary fixed. */
  lockTimeline?: boolean;
}): StudentTrainingProgressOutput {
  const normalizeCourseCode = (code?: string | null) => normalizeProgramCourseCode(code, input.student.programCode);
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
      if (item.semesterNo > existing.semesterNo) curriculumMap.set(normCode, item);
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
  const isCurrentTermAttempt = (attempt: StudentGradeAttempt) =>
    attempt.academicYear === input.timeline.currentAcademicYear &&
    attempt.termCode?.trim().toUpperCase() === input.timeline.currentTermCode.trim().toUpperCase();
  const assessedCourses: AssessedCourse[] = deduplicatedCurriculum.map((course) => {
    const attempts = gradeAttemptsByCourse.get(course.courseId) || [];
    const passingAttempt = attempts.find((a) => courseOutcome(a) === "passed");
    const hasFail = attempts.some((a) => courseOutcome(a) === "failed");
    const hasPendingAttempt = attempts.some((a) => courseOutcome(a) === "pending");
    const isCond = course.isConditional || isConditionalCourse(course.courseCode, course.courseName);
    const isCurrentlyStudying = !isCond && attempts.some(attempt => {
      if (!isCurrentTermAttempt(attempt)) return false;
      const outcome = courseOutcome(attempt);
      return outcome === "pending" || (outcome === "unknown" && attempt.score10 == null && attempt.score4 == null &&
        !attempt.letterCode && !attempt.specialCode);
    });

    let status: CourseProgressStatus;
    if (passingAttempt) {
      status = "PASSED"; // TC01, TC05
    } else if (hasPendingAttempt || isCurrentlyStudying) {
      status = "NO_SCORE"; // In-progress / no final score yet
    } else if (hasFail) {
      status = "FAILED"; // TC02
    } else if (attempts.length > 0) {
      status = "NOT_COMPLETED";
      warnings.push(`Kết quả học phần ${course.courseCode} chưa đủ dữ liệu để đối soát; không coi là đang chờ điểm.`);
    } else {
      status = "NOT_COMPLETED"; // TC04
    }

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
      isCurrentlyStudying,
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

  const completedMandatoryCredits = mandatoryCourses
    .filter((c) => c.status === "PASSED")
    .reduce((sum, c) => sum + c.credits, 0);
  const requiredMandatoryCredits = mandatoryCourses.reduce((sum, c) => sum + c.credits, 0);

  // 6. Elective groups calculation (TC06, TC07, TC08)
  const electiveGroupMap = new Map<string, AssessedCourse[]>();
  if (isK44StandardProgram(input.student.programCode)) for (const code of K44_ELECTIVE_GROUPS) electiveGroupMap.set(code, []);
  for (const c of electiveCourses) {
    const code = curriculumElectiveGroup(c.courseCode, input.student.programCode) ?? c.choiceGroupCode ?? "CHUNG";
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
      // Keep the passing result visible, but do not count an unverified block
      // toward the configured degree requirement.
      creditedCredits = null;
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

  // The configured or evidence-supported study schedule/current term is
  // authoritative. Retaking an old course alone never moves the landmark.
  const effectiveSemesterNo = input.timeline.expectedSemesterNo;
  const effectiveYear = input.timeline.expectedYear;
  const effectiveSemester = input.timeline.expectedSemester;
  const studyingSemesterNos = [...new Set(assessedCourses.filter(course => course.isCurrentlyStudying).map(course => course.semesterNo))].sort((a, b) => a - b);

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

  const usesK44Milestones = isK44StandardProgram(input.student.programCode) && input.rules?.requiredTotalCredits === 150;
  const getPlannedCreditsForSemester = (s: number, sCourses: AssessedCourse[]): number => {
    if (input.semesterPlans?.has(s)) {
      return input.semesterPlans.get(s)!;
    }
    const confirmed = assessTeachingSemester(s, input.student.programCode, sCourses);
    if (confirmed && (usesK44Milestones || confirmed.curriculumConfirmed)) return confirmed.plannedCredits;
    const sAcademicCourses = sCourses.filter((c) => !c.isConditional && c.requirementType !== "conditional");
    // An unassigned specialization has no confirmed semester quota.
    if (usesK44Milestones) return sAcademicCourses.filter((c) => c.requirementType === "mandatory").reduce((sum, c) => sum + c.credits, 0);
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

  // A yearly plan describes that cohort/year only. Historical credit milestones
  // cannot be obtained by adding the 2026 plan to guessed earlier yearly plans.
  // For the confirmed K44 standard, require compulsory courses already due and
  // each elective block once its last catalogued option is due. This keeps the
  // complete-program milestone within 104 + 46, including the final 18 credits.
  if (usesK44Milestones) {
    expectedElectiveCredits = electiveGroups.reduce((sum, group) => {
      if (group.requiredCredits === null || !group.courses.length) return sum;
      const deadline = Math.max(...group.courses.map((course) => course.semesterNo));
      return deadline < effectiveSemesterNo ? sum + group.requiredCredits : sum;
    }, 0);
    expectedCreditsToDate = mandatoryCourses.filter((course) => course.semesterNo < effectiveSemesterNo)
      .reduce((sum, course) => sum + course.credits, 0) + expectedElectiveCredits;
    if (completedSemestersToDate.some((semester) => !input.semesterPlans?.has(semester))) {
      warnings.push("Các kỳ chưa có kế hoạch năm học được đối chiếu học phần bắt buộc và mốc tối thiểu của từng khối tự chọn trong CTĐT; không suy định mức kỳ cũ từ kế hoạch 2026–2027.");
    }
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

  const progressStatus: "ON_TRACK" | "BEHIND" | "UNKNOWN" =
    (!deduplicatedCurriculum.length || !input.grades.length) ? "UNKNOWN" :
    (!isMissingMandatory && !isCreditDeficient && !isElectiveDeficient)
      ? (hasUnknownElectiveRequirement ? "UNKNOWN" : "ON_TRACK")
      : "BEHIND";

  // Status reason
  let statusReason = progressStatus === "UNKNOWN" ? "Chưa đủ dữ liệu hoặc yêu cầu CTĐT để xác nhận tiến độ; cần đối soát." : "Đúng tiến độ đào tạo";
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
  } else if (progressStatus === "ON_TRACK" && creditDifference > 0) {
    statusReason = `Đúng tiến độ (Học vượt +${creditDifference} TC)`;
  }

  // Overdue credits: total credits deficient from past semesters
  // Reflects genuine deficient credits: missing mandatory courses + elective shortfall,
  // or net credit difference behind the expected milestone (excluding redundant elective retakes).
  const overdueCredits = progressStatus === "BEHIND"
    ? Math.max(
        missingRequiredCredits + Math.max(0, expectedElectiveCredits - earnedElectiveCredits),
        Math.max(0, -creditDifference),
      )
    : 0;

  // Ahead credits
  const aheadCredits = aheadCourses.filter((c) => !c.isConditional).reduce((sum, c) => sum + c.credits, 0);
  const currentPlanCredits = getPlannedCreditsForSemester(effectiveSemesterNo, assessedCourses.filter((c) => c.semesterNo === effectiveSemesterNo));

  if (progressStatus === "UNKNOWN") creditDifferenceText = "Chưa đủ dữ liệu";
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
    const reference = assessTeachingSemester(s, input.student.programCode, sCourses);
    const teaching = reference && (usesK44Milestones || reference.curriculumConfirmed) ? reference : null;
    const sPlannedCredits = getPlannedCreditsForSemester(s, sCourses);

    const sRequiredCredits = sPlannedCredits;
    const sRemainingCredits = teaching ? teaching.remainingCredits : Math.max(sMandatory.filter((course) => course.status !== "PASSED").reduce((sum, course) => sum + course.credits, 0), sPlannedCredits - sCompletedCredits);
    const sCompletionPercentage = sPlannedCredits > 0 ? Math.max(0, Math.min(100, Math.round(((sPlannedCredits - sRemainingCredits) / sPlannedCredits) * 100))) : 0;

    const sCompletedCount = sCourses.filter((c) => c.status === "PASSED").length;
    const sFailedCount = sAcademicCourses.filter((c) => c.status === "FAILED").length;
    const sNoScoreCount = sCourses.filter((c) => c.status === "NO_SCORE").length;
    const sNotCompletedCount = sCourses.filter((c) => c.status === "NOT_COMPLETED").length;

    let sStatus: "COMPLETED" | "INCOMPLETE" | "CURRENT_PLAN" | "FUTURE" | "UNKNOWN";
    let timelineType: "PAST_COMPLETED" | "CURRENT_STUDYING" | "CURRENT_PLAN" | "FUTURE_PLANNED";
    let statusLabel: string;

    const allMandatoryPassed = teaching ? teaching.missingMandatoryCredits === 0 : sMandatory.length === 0 || sMandatory.every((c) => c.status === "PASSED");
    const semesterNeedsReconciliation = usesK44Milestones && (!teaching || !teaching.curriculumConfirmed);

    if (s < effectiveSemesterNo) {
      timelineType = "PAST_COMPLETED";
      if (semesterNeedsReconciliation) {
        sStatus = "UNKNOWN";
        statusLabel = "Cần đối soát";
      } else if (allMandatoryPassed && sRemainingCredits === 0 && sCompletedCredits >= sPlannedCredits) {
        sStatus = "COMPLETED";
        statusLabel = sCompletedCredits > sPlannedCredits ? `Đạt kỳ (+${sCompletedCredits - sPlannedCredits} TC)` : "Đạt kỳ";
      } else {
        sStatus = "INCOMPLETE";
        if (!allMandatoryPassed) {
          statusLabel = "Nợ môn bắt buộc";
        } else {
          statusLabel = `Thiếu ${sRemainingCredits} TC tự chọn`;
        }
      }
    } else if (s === effectiveSemesterNo) {
      timelineType = "CURRENT_PLAN";
      sStatus = "CURRENT_PLAN";
      const hasCurrentRegistration = sAcademicCourses.some(course => (gradeAttemptsByCourse.get(course.courseId) || []).some(isCurrentTermAttempt));
      statusLabel = hasCurrentRegistration ? "Đã có kết quả" : "Chưa đăng ký";
    } else {
      timelineType = "FUTURE_PLANNED";
      sStatus = "FUTURE";
      statusLabel = sCompletedCount > 0 ? `Học trước (+${sCompletedCredits} TC)` : "Kế hoạch";
    }

    // Display actual study activity independently of the cohort benchmark.
    // Keep sStatus and all overdue-credit calculations at the original milestone.
    if (studyingSemesterNos.includes(s)) {
      timelineType = "CURRENT_STUDYING";
      statusLabel = "Đang theo học";
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
      plannedCredits: usesK44Milestones && !teaching && !input.semesterPlans?.has(s) ? null : sPlannedCredits,
      mandatoryCredits: sMandatoryRequiredCredits,
      electivePlannedCredits: teaching?.electiveCredits ?? Math.max(0, sPlannedCredits - sMandatoryRequiredCredits),
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
  const unconfirmedPastSemesters = semesters.filter((semester) => semester.status === "UNKNOWN").map((semester) => `HK${semester.semesterNo}`);
  if (unconfirmedPastSemesters.length) warnings.push(`Chưa đủ danh mục học phần hoặc chuyên ngành để xác nhận ${unconfirmedPastSemesters.join(", ")}; không đánh dấu các kỳ này đã đạt.`);

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
      completedCredits: input.grades.length ? completedCredits : null,
      remainingCredits: input.grades.length ? remainingCredits : null,
      progressPercent: input.grades.length ? progressPercent : null,
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
      studyingSemesterNos,
      administrativeSemesterNo: input.timeline.administrativeSemesterNo,
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

    const administrativeTimeline = this.determineTimeline(
      cohort?.sCohortCode,
      cohort?.sCohortName,
      currentYearCode,
      currentTermCode,
      currentTermOrder,
    );
    const configuredStudyCohort = studentProgressCohort(student, currentYearCode);

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
              baseCourses.map((c) => [normalizeProgramCourseCode(c.s_course_code, programCode), c])
            );

            rawCurriculumCourses = rawCurriculumCourses.map((c) => {
              const base = baseCourseMap.get(normalizeProgramCourseCode(c.s_course_code, programCode));
              if (c.s_semester_no === 1 && base && base.s_semester_no > 1 && base.s_semester_no < minSpecializedSemester) {
                return { ...c, s_semester_no: base.s_semester_no };
              }
              return c;
            });

            const existingCodes = new Set(
              rawCurriculumCourses.map((c) => normalizeProgramCourseCode(c.s_course_code, programCode))
            );
            for (const baseCourse of baseCourses) {
              const normCode = normalizeProgramCourseCode(baseCourse.s_course_code, programCode);
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
          where: { cohortId: cohort.id, trainingProgramId: program.id, status: "locked", isCurrent: true },
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
            OR: [{ cohortId: cohort?.id ?? null }, { cohortId: null }],
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

      if (program && cohort) semesterPlansMap = await loadSemesterCreditPlans(cohort.id, program.id);

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
      special_code: string | null;
      is_pass: boolean | null;
      not_score: boolean | null;
      score_status: string | null;
    }> = await prisma.$queryRaw`
      SELECT o.s_curriculum_id, o.s_course_name, o.s_credits,
             y.s_year_code, t.s_term_code, t.s_term_order,
             g.score_10, g.score_4, g.letter_code, g.special_code, g.is_pass, g.not_score, g.score_status
      FROM student_course_offerings o
      LEFT JOIN student_course_grades g ON g.offering_id = o.id
      JOIN academic_terms t ON t.id = o.academic_term_id
      JOIN academic_years y ON y.id = t.academic_year_id
      WHERE o.student_id = ${student.id}::uuid
        AND (y.s_year_code < ${currentYearCode} OR
          (y.s_year_code = ${currentYearCode} AND t.s_term_order <= ${currentTermOrder}))
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
        letterCode: r.letter_code || r.special_code || null,
        specialCode: r.special_code || null,
        isPass: r.is_pass,
        notScore: r.not_score,
        scoreStatus: r.score_status,
      }));

    const inferredSchedule = configuredStudyCohort ? null : inferStudentProgressCohort({
      administrativeCohortCode: cohort?.sCohortCode ?? null, programCode,
      currentAcademicYear: currentYearCode, currentTermCode, curriculum, registrations: grades,
    });
    const studyCohortCode = configuredStudyCohort || inferredSchedule?.cohortCode || null;
    const timeline = {
      ...(studyCohortCode ? this.determineTimeline(studyCohortCode, null, currentYearCode, currentTermCode, currentTermOrder) : administrativeTimeline),
      administrativeSemesterNo: administrativeTimeline.expectedSemesterNo,
    };

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

    const reconciliation = await prisma.unscopedGradeRecord.findMany({ where: { studentId: student.id }, select: { reason: true, sCourseCode: true } });
    if (!grades.length) result.warnings.push("API chưa có bảng điểm trong phạm vi CTĐT của sinh viên; chưa đủ dữ liệu để xác nhận các học phần đã hoàn thành.");
    if (reconciliation.some((row) => row.reason === "API_PROGRAM_SCOPE_CONFLICT")) result.warnings.push("API mã CTĐT chung trả rỗng, hai mã chuyên ngành trả cùng ba đăng ký chưa có điểm. Cần đối soát phạm vi nguồn; chưa tự gán chuyên ngành hoặc tích lũy tín chỉ.");
    if (reconciliation.some((row) => row.reason !== "API_PROGRAM_SCOPE_CONFLICT")) result.warnings.push("Có lượt học thiếu phạm vi học kỳ cần đối soát; chưa tính vào kết quả tại mốc xét.");

    if (program) {
      result.curriculum.programId = program.id;
      result.curriculum.programName = program.sProgramName;
    }

    result.student.studyCohortCode = studyCohortCode;
    result.student.studyScheduleSource = configuredStudyCohort ? "CONFIGURED" : inferredSchedule ? "REGISTRATION_SEQUENCE" : null;

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
                studyCohortCode: res.student.studyCohortCode,
                studyScheduleSource: res.student.studyScheduleSource,
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
    const unknownCount = evaluatedList.filter((item) => item.progressStatus === "UNKNOWN").length;
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
      unknownCount,
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
      allEvaluations: evaluatedList,
    };
  }
}

export interface DepartmentProgressStudentItem {
  id: string;
  studentId: string;
  fullName: string;
  className: string;
  cohortCode: string;
  studyCohortCode?: string | null;
  studyScheduleSource?: "CONFIGURED" | "REGISTRATION_SEQUENCE" | null;
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
  progressStatus: "ON_TRACK" | "BEHIND" | "UNKNOWN";
  statusReason: string;
}

export interface DepartmentProgressOverviewResult {
  kpi: {
    totalStudents: number;
    onTrackCount: number;
    behindCount: number;
    unknownCount?: number;
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
  allEvaluations?: DepartmentProgressStudentItem[];
}

interface CachedOverview {
  timestamp: number;
  evaluatedList: DepartmentProgressStudentItem[];
}

const overviewCache = new Map<string, CachedOverview>();
const CACHE_TTL_MS = 60 * 1000;
