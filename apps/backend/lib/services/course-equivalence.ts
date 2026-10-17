import { prisma } from "@/lib/prisma";
import { normalizeProgramCourseCode } from "../academic-course-rules";

/** Expand only explicitly verified aliases; preserve source offering/course IDs. */
export async function loadEquivalentCourseIds(programCode?: string | null) {
  const courses = await prisma.course.findMany({ where: { deletedAt: null }, select: { id: true, sCourseCode: true, sCourseName: true } });
  const identity = (course: typeof courses[number]) => {
    return normalizeProgramCourseCode(course.sCourseCode, programCode);
  };
  const groups = new Map<string, string[]>();
  for (const course of courses) {
    const code = identity(course);
    groups.set(code, [...(groups.get(code) ?? []), course.id]);
  }
  return new Map(courses.map((course) => [course.id, groups.get(identity(course)) ?? [course.id]]));
}
