import { courseOutcome, isConditionalCourse, normalizeProgramCourseCode, curriculumElectiveGroup, isK44StandardProgram, K44_ELECTIVE_GROUPS, normalizeCourseName } from "../academic-course-rules";
import { matchProgramCourse, passedProgramCourseCodes, suggestProgramCourses } from "../course-recognition";
import type { CourseOutcomeInput } from "../academic-course-rules";
export { COURSE_CODE_ALIASES, normalizeCourseCode, normalizeCourseName } from "../academic-course-rules";

export type ForecastCourse = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;
  semesterNo: number | null;
};
export type ForecastGrade = CourseOutcomeInput & {
  academicYear?: string | null;
  termCode?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  credits?: number | null;
  isPassed?: boolean | null;
  scoreStatus?: string | null;
  notScore?: boolean | null;
  score10?: number | null;
  score4?: number | null;
  letterGrade?: string | null;
  specialCode?: string | null;
};
export type ForecastSchedule = {
  courseId?: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  academicYear: string;
  termCode: string;
  semesterNo: number;
  choiceGroupCode?: string | null;
  isProgramFinal?: boolean;
};
type CourseState = "passed" | "failed" | "no_score" | "not_completed";

export function buildGraduationForecast(input: {
  programCode?: string | null;
  courses: ForecastCourse[];
  grades: ForecastGrade[];
  schedule?: ForecastSchedule[];
  requiredElectiveCredits?: number | null;
  requiredTotalCredits?: number | null;
  requiredCompulsoryCredits?: number | null;
}) {
  const normalizeCourseCode = (code?: string | null) => normalizeProgramCourseCode(code, input.programCode);
  const warnings: string[] = [];
  const courses = new Map<string, ForecastCourse>();
  for (const course of input.courses) {
    if (isConditionalCourse(course.courseCode, course.courseName)) continue;
    const key = normalizeCourseCode(course.courseCode) || `id:${course.courseId}`;
    const existing = courses.get(key);
    if (existing) {
      if (existing.credits !== course.credits) warnings.push(`Tín chỉ CTĐT không thống nhất: ${course.courseCode}`);
      if ((course.semesterNo ?? 0) > (existing.semesterNo ?? 0)) courses.set(key, course);
      continue;
    }
    courses.set(key, course);
  }
  const allCourses = [...courses.values()];
  const names = new Map<string, ForecastCourse[]>();
  for (const course of allCourses) {
    const name = normalizeCourseName(course.courseName);
    if (name) names.set(name, [...(names.get(name) ?? []), course]);
  }
  for (const sameName of names.values()) if (sameName.length > 1) {
    warnings.push(`Nhiều mã học phần cùng tên trong CTĐT: ${sameName.map((item) => item.courseCode).join(", ")}. Không tự coi là tương đương.`);
  }
  if (allCourses.length === 0) warnings.push("CTĐT chưa có học phần để đối chiếu.");
  const match = (code?: string | null) => matchProgramCourse(code, allCourses, input.programCode);
  const passedCodes = passedProgramCourseCodes(input.grades.map(g => ({ ...g, courseCode: g.courseCode ?? "" })), allCourses, input.programCode);
  const recognitionIssues: Array<{ code: string; courseCodes: string[]; message: string }> = [];
  const gradeMap = new Map<string, ForecastGrade[]>();
  const unmatchedGrades: ForecastGrade[] = [];
  for (const grade of input.grades) {
    if (!grade || typeof grade !== "object") continue;
    const code = String(grade.courseCode || "").toUpperCase();
    const name = String(grade.courseName || "").toLowerCase();
    if (code.startsWith("SHCD") || name.includes("sinh hoạt công dân")) continue;
    const course = match(grade.courseCode);
    if (!course) {
      const candidates = suggestProgramCourses(grade.courseName, allCourses).filter(c => !passedCodes.has(normalizeCourseCode(c.courseCode)));
      // A cross-cohort registration with no result is not a credit-recognition
      // conflict. Keep it pending under its source code, without granting credits.
      if (courseOutcome(grade) !== "pending" && candidates.length && !recognitionIssues.some(i => i.courseCodes.includes(grade.courseCode || ""))) recognitionIssues.push({
        code: "COURSE_EQUIVALENCE_NOT_CONFIGURED", courseCodes: [grade.courseCode || "", ...candidates.map(c => c.courseCode)],
        message: "Trùng tên chưa xác nhận tương đương; cần đối chiếu ánh xạ của hệ thống, không tự quy đổi tín chỉ.",
      });
      unmatchedGrades.push(grade); continue;
    }
    if (grade.credits != null && grade.credits !== course.credits) {
      recognitionIssues.push({ code: "COURSE_CREDIT_MAPPING_REVIEW", courseCodes: [course.courseCode], message: `Cần đối chiếu tín chỉ ${course.courseCode}: nguồn ${grade.credits}, CTĐT ${course.credits}.` });
      unmatchedGrades.push(grade); continue;
    }
    gradeMap.set(course.courseId, [...(gradeMap.get(course.courseId) ?? []), grade]);
  }
  const scheduleMap = new Map<string, ForecastSchedule>();
  for (const entry of input.schedule ?? []) {
    const course = allCourses.find((item) => item.courseId === entry.courseId) ?? match(entry.courseCode);
    if (course && !scheduleMap.has(course.courseId)) scheduleMap.set(course.courseId, entry);
  }
  const assessed = allCourses.map((course) => {
    const attempts = gradeMap.get(course.courseId) ?? [];
    const hasPass = attempts.some((grade) => courseOutcome(grade) === "passed");
    const hasFail = attempts.some((grade) => courseOutcome(grade) === "failed");
    const hasPendingAttempt = attempts.some(grade => courseOutcome(grade) === "pending");
    if (attempts.some((grade) => courseOutcome(grade) === "unknown")) warnings.push(`Kết quả học phần ${course.courseCode} chưa đủ dữ liệu để đối soát; không coi là đang chờ điểm.`);
    const state: CourseState = hasPass ? "passed" : hasPendingAttempt ? "no_score" : hasFail ? "failed" : "not_completed";
    return { ...course, state, hasPendingAttempt, confirmedOutcome: hasPass ? "PASSED" : hasFail ? "FAILED" : "NONE", schedule: scheduleMap.get(course.courseId) ?? null };
  });
  const mandatory = assessed.filter((course) => /bắt buộc|mandatory/i.test(course.requirementType));
  const elective = assessed.filter((course) => /tự chọn|elective/i.test(course.requirementType));
  const unknown = assessed.filter((course) => !mandatory.includes(course) && !elective.includes(course));
  if (unknown.length) warnings.push(`${unknown.length} học phần chưa xác định loại yêu cầu trong CTĐT.`);
  const requiredMandatoryCredits = mandatory.reduce((sum, course) => sum + course.credits, 0);
  const completedMandatoryCredits = mandatory.filter((course) => course.state === "passed").reduce((sum, course) => sum + course.credits, 0);
  const passedElectiveCredits = elective.filter((course) => course.state === "passed").reduce((sum, course) => sum + course.credits, 0);
  const availableElectiveCredits = elective.reduce((sum, course) => sum + course.credits, 0);
  const electiveLimit = input.requiredElectiveCredits;
  const validElectiveLimit = typeof electiveLimit === "number" && Number.isFinite(electiveLimit) && electiveLimit >= 0 ? electiveLimit : null;
  if (validElectiveLimit === null) warnings.push("CTĐT không cung cấp mức tín chỉ tự chọn tối thiểu; cần cấu hình quy tắc cho chương trình này.");
  const missingRequiredCourses = mandatory.filter((course) => course.state !== "passed");
  const groups = new Map<string, typeof elective>();
  if (isK44StandardProgram(input.programCode)) for (const code of K44_ELECTIVE_GROUPS) groups.set(code, []);
  for (const course of elective) {
    const code = curriculumElectiveGroup(course.courseCode, input.programCode) ?? course.schedule?.choiceGroupCode;
    if (code) groups.set(code, [...(groups.get(code) ?? []), course]);
  }
  const electiveGroups = [...groups].map(([code, options]) => {
    const minimum = code.match(/:([1-9]\d*)$/);
    const required = minimum ? Number(minimum[1]) : null;
    const passed = options.filter((course) => course.state === "passed").reduce((sum, course) => sum + course.credits, 0);
    const credited = required === null ? null : Math.min(passed, required);
    const remaining = required === null ? null : Math.max(0, required - passed);
    const extra = required === null ? null : Math.max(0, passed - required);
    const pending = options.filter((course) => course.state === "no_score").reduce((sum, course) => sum + course.credits, 0);
    return {
      code,
      groupCode: code,
      courseIds: options.map((course) => course.courseId),
      requiredCredits: required,
      passedCredits: passed,
      earnedCredits: passed,
      creditedCredits: credited,
      remainingCredits: remaining,
      extraCredits: extra,
      pendingCredits: pending,
      status: required === null ? "UNKNOWN" : passed >= required ? "PASS" : "FAIL",
    };
  });
  const configuredGroupMinimum = electiveGroups.reduce((sum, group) => sum + (group.requiredCredits ?? 0), 0);
  if (validElectiveLimit !== null && configuredGroupMinimum > validElectiveLimit) {
    warnings.push("Tổng mức tối thiểu của các nhóm tự chọn vượt ngưỡng tự chọn toàn CTĐT; cần đối soát cấu hình.");
  }
  const ungroupedPassed = elective.filter((course) => course.state === "passed" && !(curriculumElectiveGroup(course.courseCode, input.programCode) ?? course.schedule?.choiceGroupCode))
    .reduce((sum, course) => sum + course.credits, 0);
  const qualifiedElectiveCredits = ungroupedPassed + electiveGroups.reduce((sum, group) => sum + (group.creditedCredits ?? group.passedCredits), 0);
  const groupDeficit = electiveGroups.reduce((sum, group) => sum + (group.remainingCredits ?? 0), 0);
  const creditedElectiveCredits = validElectiveLimit === null ? null
    : Math.min(qualifiedElectiveCredits, validElectiveLimit, Math.max(0, validElectiveLimit - groupDeficit));
  const remainingElectiveCredits = validElectiveLimit === null || creditedElectiveCredits === null ? null
    : Math.max(0, validElectiveLimit - creditedElectiveCredits);
  const totalLimit = input.requiredTotalCredits;
  const validTotalLimit = typeof totalLimit === "number" && Number.isFinite(totalLimit) && totalLimit > 0 ? totalLimit : null;
  const compulsoryLimit = input.requiredCompulsoryCredits;
  const validCompulsoryLimit = typeof compulsoryLimit === "number" && Number.isFinite(compulsoryLimit) && compulsoryLimit >= 0 ? compulsoryLimit : null;
  const coverageValid = (validElectiveLimit === null || availableElectiveCredits >= validElectiveLimit) &&
    (validCompulsoryLimit === null || requiredMandatoryCredits >= validCompulsoryLimit) &&
    (validTotalLimit === null || (validElectiveLimit !== null && requiredMandatoryCredits + Math.min(availableElectiveCredits, validElectiveLimit) >= validTotalLimit));
  if (!coverageValid) warnings.push("Danh mục CTĐT hiện lưu không đủ học phần/tín chỉ để đáp ứng ngưỡng đã cấu hình; cần bổ sung hoặc đối soát CTĐT.");
  const requiredCredits = unknown.length || allCourses.length === 0 ? null : validTotalLimit;
  const completedCredits = requiredCredits === null || creditedElectiveCredits === null || electiveGroups.some((group) => group.requiredCredits === null) ? null : Math.min(completedMandatoryCredits + creditedElectiveCredits, requiredCredits);
  const remainingCredits = requiredCredits === null || completedCredits === null || !coverageValid ? null : Math.max(0, requiredCredits - completedCredits);

  const curriculumComplete = (recognitionIssues.length > 0 || requiredCredits === null || creditedElectiveCredits === null || !coverageValid || electiveGroups.some((g) => g.status === "UNKNOWN"))
    ? null
    : (missingRequiredCourses.length === 0 &&
       (remainingElectiveCredits === null || remainingElectiveCredits === 0) &&
       electiveGroups.every((g) => g.status === "PASS") &&
       (remainingCredits === null || remainingCredits === 0));

  const remainingBySemester = [...new Map(missingRequiredCourses.filter((course) => course.schedule).map((course) => {
    const plan = course.schedule!;
    const key = `${plan.academicYear}|${plan.termCode}`;
    return [key, { academicYear: plan.academicYear, termCode: plan.termCode, label: "Dự kiến theo kế hoạch đào tạo", courses: missingRequiredCourses.filter((item) => item.schedule?.academicYear === plan.academicYear && item.schedule?.termCode === plan.termCode) }];
  })).values()];
  
  const pendingMandatory = mandatory.filter((course) => course.state === "no_score");
  const pendingMandatoryCredits = pendingMandatory.reduce((sum, course) => sum + course.credits, 0);
  const pendingElectiveCredits = elective.filter((course) => course.state === "no_score").reduce((sum, course) => sum + course.credits, 0);
  const pendingTotalCredits = assessed.filter((course) => course.state === "no_score").reduce((sum, course) => sum + course.credits, 0);

  return {
    curriculumComplete,
    summary: { requiredCredits, completedCredits, remainingCredits, pendingCredits: pendingTotalCredits, completionPercent: requiredCredits && completedCredits !== null ? Math.round(completedCredits / requiredCredits * 10000) / 100 : null },
    requirements: { requiredCourses: { total: mandatory.length, completed: mandatory.length - missingRequiredCourses.length, remaining: missingRequiredCourses.length, pending: pendingMandatory.length, requiredCredits: requiredMandatoryCredits, completedCredits: completedMandatoryCredits, pendingCredits: pendingMandatoryCredits }, electives: { requiredCredits: validElectiveLimit, passedCredits: passedElectiveCredits, completedCredits: creditedElectiveCredits, remainingCredits: remainingElectiveCredits, pendingCredits: pendingElectiveCredits, excessCredits: validElectiveLimit === null ? null : Math.max(0, passedElectiveCredits - validElectiveLimit) } },
    requiredCoursesBreakdown: {
      completed: mandatory.filter((course) => course.state === "passed"),
      missing: mandatory.filter((course) => course.state === "not_completed"),
      failed: mandatory.filter((course) => course.state === "failed"),
      noScore: mandatory.filter((course) => course.state === "no_score"),
    },
    missingRequiredCourses,
    failedCourses: assessed.filter((course) => course.state === "failed"),
    noScoreCourses: assessed.filter((course) => course.state === "no_score"),
    graduationRequirements: missingRequiredCourses.filter((course) => course.schedule?.isProgramFinal),
    electiveGroups,
    electiveOptions: remainingElectiveCredits !== null && remainingElectiveCredits > 0 ? elective.filter((course) => course.state !== "passed") : [],
    electiveCourses: elective,
    remainingBySemester,
    unmatchedGrades,
    pendingRegistrations: unmatchedGrades.filter(grade => courseOutcome(grade) === "pending"),
    reconciliation: { status: recognitionIssues.length ? "REVIEW_REQUIRED" : "READY", issues: recognitionIssues },
    // Display alongside the individual course obligations; do not call the
    // estimate an official recognition of differently coded source credits.
    warnings,
  };
}
