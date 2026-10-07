import { prisma } from "../lib/prisma";
import { GraduationEvaluationsService } from "../lib/services/graduation-evaluations";

async function main() {
  const student = await prisma.student.findFirst({ where: { sStudentId: "2246A006" } });
  if (!student) {
    console.log("Student not found");
    return;
  }
  const studentClass = await prisma.class.findFirst({ where: { classId: student.sClassStudentId ?? "" } });
  const gradResult = await prisma.graduationEvaluationStudent.findFirst({
    where: { studentId: student.id }, orderBy: { evaluatedAt: "desc" },
  });
  // Check rules configured for this cohort & program
  const rules = await prisma.graduationRule.findMany({
    where: {
      OR: [
        { cohortId: studentClass?.cohortId },
        { cohortId: null }
      ]
    }
  });
  console.log("\n=== GRADUATION RULES ===");
  for (const r of rules) {
    console.log(`Rule: ${r.ruleCode} (${r.ruleName}): value=${r.requiredValue}, cohortId=${r.cohortId}`);
  }

  // Check curriculum courses for CQ22CT-PM
  const tp = await prisma.trainingProgram.findFirst({
    where: { sProgramCode: "CQ22CT-PM" }
  });
  console.log("\n=== TRAINING PROGRAM ===");
  console.log("TP ID:", tp?.id, "Code:", tp?.sProgramCode, "Name:", tp?.sProgramName);

  // Raw courses for CQ22CT-PM
  const currCourses = await prisma.$queryRaw<any[]>`
    SELECT c.id, c.s_course_code, c.s_course_name, pc.s_credits, pc.s_requirement_type, pc.s_semester_no
    FROM training_program_courses pc
    JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
    WHERE pc.training_program_id = ${tp?.id}::uuid
    ORDER BY pc.s_semester_no, c.s_course_code
  `;
  console.log(`Found ${currCourses.length} courses in CQ22CT-PM`);
  const mandatoryCurr = currCourses.filter(c => c.s_requirement_type === "mandatory");
  const electiveCurr = currCourses.filter(c => c.s_requirement_type === "elective");
  console.log(`Mandatory: ${mandatoryCurr.length} courses, Elective: ${electiveCurr.length} courses`);

  // Check base program CQ22CT
  const baseTp = await prisma.trainingProgram.findFirst({
    where: { sProgramCode: "CQ22CT" }
  });
  const baseCurrCourses = baseTp ? await prisma.$queryRaw<any[]>`
    SELECT c.id, c.s_course_code, c.s_course_name, pc.s_credits, pc.s_requirement_type, pc.s_semester_no
    FROM training_program_courses pc
    JOIN courses c ON c.id = pc.course_id AND c.deleted_at IS NULL
    WHERE pc.training_program_id = ${baseTp.id}::uuid
    ORDER BY pc.s_semester_no, c.s_course_code
  ` : [];
  console.log(`Base CQ22CT courses: ${baseCurrCourses.length}`);

  // Check student course offerings and grades
  const offerings = await prisma.$queryRaw<any[]>`
    SELECT o.id, o.s_curriculum_id, o.s_course_name, o.s_credits, o.s_program_code,
           y.s_year_code, t.s_term_code, t.s_term_order,
           g.score_10, g.score_4, g.letter_code, g.special_code, g.is_pass, g.not_score, g.score_status
    FROM student_course_offerings o
    JOIN academic_terms t ON t.id = o.academic_term_id AND t.deleted_at IS NULL
    JOIN academic_years y ON y.id = t.academic_year_id AND y.deleted_at IS NULL
    LEFT JOIN student_course_grades g ON g.offering_id = o.id
    WHERE o.student_id = ${student.id}::uuid
    ORDER BY y.s_year_code, t.s_term_order, o.s_curriculum_id
  `;
  console.log(`\n=== STUDENT OFFERINGS (${offerings.length} total) ===`);
  
  // Passed courses
  const passedOfferings = offerings.filter(o => o.is_pass === true);
  console.log(`Passed offerings: ${passedOfferings.length}`);

  // Let's run evaluateStudentGraduation from graduation-evaluations
  // Let's inspect how the forecast breakdown was computed
  if (gradResult) {
    const detail = await GraduationEvaluationsService.getStudent(gradResult.evaluationId, student.sStudentId);
    const fc = detail?.forecast as any;
    if (!fc) return;
    console.log("\n=== DETAILED FORECAST OBJECT ===");
    console.log("summary:", fc.summary);
    console.log("requirements.requiredCourses:", fc.requirements?.requiredCourses);
    console.log("requirements.electives:", fc.requirements?.electives);
    console.log("electiveGroups:", fc.electiveGroups);
    console.log("electiveOptions count:", fc.electiveOptions?.length);
    console.log("passed electives in forecast:");
    const passedElectives = (fc.electiveOptions || []).filter((c: any) => c.state === "passed");
    for (const pe of passedElectives) {
      console.log(`  - ${pe.courseCode}: ${pe.courseName} (${pe.credits} TC) - Sem ${pe.semesterNo}`);
    }
    const failedElectives = (fc.electiveOptions || []).filter((c: any) => c.state === "failed");
    console.log("failed electives in forecast:");
    for (const fe of failedElectives) {
      console.log(`  - ${fe.courseCode}: ${fe.courseName} (${fe.credits} TC) - Sem ${fe.semesterNo}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
