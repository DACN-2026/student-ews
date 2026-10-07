import { prisma } from "@/lib/prisma";
import { normalizeProgramCourseCode, normalizeCourseName, isK44StandardProgram } from "../academic-course-rules";

/** Expand only explicitly verified aliases; preserve source offering/course IDs. */
export async function loadEquivalentCourseIds(programCode?: string | null) {
  const courses = await prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, sCourseCode: true, sCourseName: true } });
  const identity = (course: typeof courses[number]) => {
    const code = normalizeProgramCourseCode(course.sCourseCode, programCode);
    if (isK44StandardProgram(programCode) && /^20CT\d{4}D$/.test(code)) {
      const base = courses.find((item) => normalizeProgramCourseCode(item.sCourseCode, programCode) === code.slice(0, -1));
      if (base && normalizeCourseName(base.sCourseName) === normalizeCourseName(course.sCourseName)) return code.slice(0, -1);
    }
    return code;
  };
  const groups = new Map<string, string[]>();
  for (const course of courses) {
    const code = identity(course);
    groups.set(code, [...(groups.get(code) ?? []), course.id]);
  }
  return new Map(courses.map((course) => [course.id, groups.get(identity(course)) ?? [course.id]]));
}
