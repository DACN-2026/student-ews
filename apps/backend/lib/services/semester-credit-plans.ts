import { prisma } from "@/lib/prisma";
import { isConditionalCourse } from "../academic-course-rules";

export async function loadSemesterCreditPlans(cohortId: string, programId: string): Promise<Map<number, number>> {
  const plans = await prisma.trainingProgressPlan.findMany({
    where: { cohortId, trainingProgramId: programId, status: "locked", isCurrent: true },
    orderBy: { version: "asc" },
  });
  const rows = await prisma.trainingProgressPlanCourse.findMany({ where: { planId: { in: plans.map((plan) => plan.id) } } });
  const result = new Map<number, number>();
  for (const plan of plans) {
    const courses = rows.filter((row) => row.planId === plan.id).map((row) => ({
      courseId: row.courseId, courseCode: row.sCourseCode, courseName: row.sCourseName,
      credits: row.sCredits, requirementType: row.requirementType, choiceGroupCode: row.choiceGroupCode, isRegistrationRequired: row.isRegistrationRequired,
    }));
    const mandatory = courses.filter((course) => course.requirementType === "mandatory" && !isConditionalCourse(course.courseCode, course.courseName)).reduce((sum, course) => sum + course.credits, 0);
    result.set(plan.curriculumSemesterNo, mandatory + plan.requiredElectiveCredits);
  }
  return result;
}
