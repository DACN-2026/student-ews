import { courseOutcome, normalizeCourseName, normalizeProgramCourseCode, type CourseOutcomeInput } from "./academic-course-rules";

type CourseIdentity = { courseCode: string; courseName: string };

/** Only source codes and previously verified program-scoped aliases establish
 * equivalence. Equal names are review suggestions, never credit recognition. */
export function matchProgramCourse<T extends CourseIdentity>(code: string | null | undefined, courses: T[], programCode?: string | null): T | undefined {
  const key = normalizeProgramCourseCode(code, programCode);
  return key ? courses.find(course => normalizeProgramCourseCode(course.courseCode, programCode) === key) : undefined;
}

export function suggestProgramCourses<T extends CourseIdentity>(name: string | null | undefined, courses: T[]): T[] {
  const key = normalizeCourseName(name);
  return key ? courses.filter(course => normalizeCourseName(course.courseName) === key) : [];
}

/** The caller supplies evidence bounded to its assessment cutoff. An actual
 * pass for a curriculum code settles that requirement independently of any
 * other, similarly named code in the transcript. This grants no equivalence. */
export function passedProgramCourseCodes(
  attempts: Array<CourseOutcomeInput & { courseCode: string; credits?: number | null }>,
  courses: Array<CourseIdentity & { credits: number }>,
  programCode?: string | null,
): Set<string> {
  const passed = new Set<string>();
  for (const attempt of attempts) {
    if (courseOutcome(attempt) !== "passed") continue;
    const course = matchProgramCourse(attempt.courseCode, courses, programCode);
    if (course && (attempt.credits == null || attempt.credits === course.credits)) {
      passed.add(normalizeProgramCourseCode(course.courseCode, programCode));
    }
  }
  return passed;
}
