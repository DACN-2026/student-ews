/** Course matching rules live here. Add verified code aliases only; never strip suffixes speculatively. */
export const COURSE_CODE_ALIASES: Readonly<Record<string, string>> = {};

export function normalizeCourseCode(value: string | null | undefined): string {
  const code = (value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
  return COURSE_CODE_ALIASES[code] ?? code;
}

export function normalizeCourseName(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

export type ForecastCourse = {
  courseId: string;
  courseCode: string;
  courseName: string;
  credits: number;
  requirementType: string;
  semesterNo: number | null;
};
export type ForecastGrade = {
  courseCode?: string | null;
  courseName?: string | null;
  isPassed?: boolean | null;
  scoreStatus?: string | null;
  notScore?: boolean | null;
  score10?: number | null;
  score4?: number | null;
  letterGrade?: string | null;
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
  courses: ForecastCourse[];
  grades: ForecastGrade[];
  schedule?: ForecastSchedule[];
  requiredElectiveCredits?: number | null;
  requiredTotalCredits?: number | null;
  requiredCompulsoryCredits?: number | null;
}) {
  const warnings: string[] = [];
  const courses = new Map<string, ForecastCourse>();
  for (const course of input.courses) {
    const key = normalizeCourseCode(course.courseCode) || `id:${course.courseId}`;
    const existing = courses.get(key);
    if (existing) {
      if (existing.credits !== course.credits) warnings.push(`Tín chỉ CTĐT không thống nhất: ${course.courseCode}`);
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
  const byCode = new Map(allCourses.map((course) => [normalizeCourseCode(course.courseCode), course]));
  const byName = new Map<string, ForecastCourse[]>();
  for (const course of allCourses) {
    const key = normalizeCourseName(course.courseName);
    if (key) byName.set(key, [...(byName.get(key) ?? []), course]);
  }
  const match = (code?: string | null, name?: string | null) => {
    const exact = byCode.get(normalizeCourseCode(code));
    if (exact) return exact;
    const candidates = byName.get(normalizeCourseName(name)) ?? [];
    return candidates.length === 1 ? candidates[0] : null;
  };
  const gradeMap = new Map<string, ForecastGrade[]>();
  const unmatchedGrades: ForecastGrade[] = [];
  for (const grade of input.grades) {
    if (!grade || typeof grade !== "object") continue;
    const course = match(grade.courseCode, grade.courseName);
    if (!course) { unmatchedGrades.push(grade); continue; }
    gradeMap.set(course.courseId, [...(gradeMap.get(course.courseId) ?? []), grade]);
  }
  const scheduleMap = new Map<string, ForecastSchedule>();
  for (const entry of input.schedule ?? []) {
    const course = allCourses.find((item) => item.courseId === entry.courseId) ?? match(entry.courseCode, entry.courseName);
    if (course && !scheduleMap.has(course.courseId)) scheduleMap.set(course.courseId, entry);
  }
  const assessed = allCourses.map((course) => {
    const attempts = gradeMap.get(course.courseId) ?? [];
    const hasPass = attempts.some((grade) => grade.isPassed === true && grade.notScore !== true && grade.scoreStatus === "graded");
    const hasFail = attempts.some((grade) => grade.isPassed === false && grade.notScore !== true && grade.scoreStatus === "graded" &&
      (grade.score10 != null || grade.score4 != null || Boolean(grade.letterGrade)));
    const state: CourseState = hasPass ? "passed" : hasFail ? "failed" : attempts.length ? "no_score" : "not_completed";
    return { ...course, state, schedule: scheduleMap.get(course.courseId) ?? null };
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
  for (const course of elective) {
    const code = course.schedule?.choiceGroupCode;
    if (code) groups.set(code, [...(groups.get(code) ?? []), course]);
  }
  const electiveGroups = [...groups].map(([code, options]) => {
    const minimum = code.match(/:([1-9]\d*)$/);
    const required = minimum ? Number(minimum[1]) : null;
    const passed = options.filter((course) => course.state === "passed").reduce((sum, course) => sum + course.credits, 0);
    const credited = required === null ? null : Math.min(passed, required);
    const remaining = required === null ? null : Math.max(0, required - passed);
    const extra = required === null ? null : Math.max(0, passed - required);
    return {
      code,
      groupCode: code,
      requiredCredits: required,
      passedCredits: passed,
      earnedCredits: passed,
      creditedCredits: credited,
      remainingCredits: remaining,
      extraCredits: extra,
      status: required === null ? "UNKNOWN" : passed >= required ? "PASS" : "FAIL",
    };
  });
  const configuredGroupMinimum = electiveGroups.reduce((sum, group) => sum + (group.requiredCredits ?? 0), 0);
  if (validElectiveLimit !== null && configuredGroupMinimum > validElectiveLimit) {
    warnings.push("Tổng mức tối thiểu của các nhóm tự chọn vượt ngưỡng tự chọn toàn CTĐT; cần đối soát cấu hình.");
  }
  const ungroupedPassed = elective.filter((course) => course.state === "passed" && !course.schedule?.choiceGroupCode)
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
  const completedCredits = requiredCredits === null || creditedElectiveCredits === null || !coverageValid || electiveGroups.some((group) => group.requiredCredits === null) ? null : Math.min(completedMandatoryCredits + creditedElectiveCredits, requiredCredits);
  const remainingCredits = requiredCredits === null || completedCredits === null ? null : Math.max(0, requiredCredits - completedCredits);

  const curriculumComplete = (requiredCredits === null || creditedElectiveCredits === null || !coverageValid || electiveGroups.some((g) => g.status === "UNKNOWN"))
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
  return {
    curriculumComplete,
    summary: { requiredCredits, completedCredits, remainingCredits, completionPercent: requiredCredits && completedCredits !== null ? Math.round(completedCredits / requiredCredits * 10000) / 100 : null },
    requirements: { requiredCourses: { total: mandatory.length, completed: mandatory.length - missingRequiredCourses.length, remaining: missingRequiredCourses.length, requiredCredits: requiredMandatoryCredits, completedCredits: completedMandatoryCredits }, electives: { requiredCredits: validElectiveLimit, passedCredits: passedElectiveCredits, completedCredits: creditedElectiveCredits, remainingCredits: remainingElectiveCredits, excessCredits: validElectiveLimit === null ? null : Math.max(0, passedElectiveCredits - validElectiveLimit) } },
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
    remainingBySemester,
    unmatchedGrades,
    warnings,
  };
}
