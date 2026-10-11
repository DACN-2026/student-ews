import { prisma } from "@/lib/prisma";
import { normalizeProgramCourseCode } from "../academic-course-rules";
import type { ForecastCourse } from "./graduation-forecast";

export type CurriculumCatalogCourse = ForecastCourse & { catalogProgramCode: string };

/** Recognition evidence only. A course in the base catalog is not automatically
 * a requirement of a specialization, especially from semester 6 onward. */
export async function loadProgramCurriculumCatalog(programId: string): Promise<CurriculumCatalogCourse[]> {
  const program = await prisma.trainingProgram.findUnique({ where: { id: programId } });
  if (!program) return [];
  const programs = await prisma.trainingProgram.findMany({ where: { deletedAt: null,
    sProgramCode: { in: [program.sProgramCode, program.sProgramCode.split("-")[0]] } } });
  const rows = await prisma.trainingProgramCourse.findMany({ where: { trainingProgramId: { in: programs.map(item => item.id) } } });
  const catalog = await prisma.course.findMany({ where: { id: { in: rows.map(item => item.courseId) }, deletedAt: null } });
  const byId = new Map(catalog.map(course => [course.id, course]));
  const byProgram = new Map(programs.map(item => [item.id, item.sProgramCode]));
  return rows.flatMap(row => {
    const course = byId.get(row.courseId);
    return course ? [{ courseId: course.id, courseCode: course.sCourseCode, courseName: course.sCourseName,
      credits: row.sCredits, requirementType: row.sRequirementType, semesterNo: row.sSemesterNo,
      catalogProgramCode: byProgram.get(row.trainingProgramId)! }] : [];
  });
}

/** Source specialization catalogs contain only the branch; inherit the common
 * courses from the same cohort's base catalog, never a different cohort. */
export async function loadProgramCurriculum(programId: string): Promise<ForecastCourse[]> {
  const program = await prisma.trainingProgram.findUnique({ where: { id: programId } });
  if (!program) return [];
  const baseCode = program.sProgramCode.split("-")[0];
  const base = baseCode !== program.sProgramCode
    ? await prisma.trainingProgram.findFirst({ where: { sProgramCode: baseCode, deletedAt: null } }) : null;
  const rows = await prisma.trainingProgramCourse.findMany({ where: { trainingProgramId: { in: base ? [programId, base.id] : [programId] } } });
  const catalog = await prisma.course.findMany({ where: { id: { in: rows.map((item) => item.courseId) }, deletedAt: null } });
  const byId = new Map(catalog.map((course) => [course.id, course]));
  const baseByCode = new Map(rows.filter((row) => row.trainingProgramId === base?.id).map((row) => [normalizeProgramCourseCode(byId.get(row.courseId)?.sCourseCode, program.sProgramCode), row]));
  const courses = new Map<string, ForecastCourse>();
  for (const row of rows.sort((a, b) => Number(a.trainingProgramId !== programId) - Number(b.trainingProgramId !== programId))) {
    const course = byId.get(row.courseId);
    if (!course) continue;
    if (row.trainingProgramId !== programId && row.sSemesterNo >= 6) continue;
    const code = normalizeProgramCourseCode(course.sCourseCode, program.sProgramCode);
    const common = baseByCode.get(code);
    const semester = row.sSemesterNo === 1 && common && common.sSemesterNo > 1 && common.sSemesterNo < 6 ? common.sSemesterNo : row.sSemesterNo;
    const previous = courses.get(code);
    if (previous && (row.trainingProgramId !== programId || (previous.semesterNo ?? 0) >= semester)) continue;
    courses.set(code, { courseId: course.id, courseCode: course.sCourseCode, courseName: course.sCourseName, credits: row.sCredits, requirementType: row.sRequirementType, semesterNo: semester });
  }
  return [...courses.values()];
}
