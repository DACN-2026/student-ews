import { prisma } from "../lib/prisma";

async function testAudit() {
  const list = await prisma.$queryRaw`
    SELECT tp.s_program_code, pc.s_semester_no, 
           SUM(pc.s_credits)::int as total_credits, 
           SUM(CASE WHEN c.s_course_code NOT ILIKE 'QP%' 
                     AND c.s_course_code NOT ILIKE 'TC%' 
                     AND c.s_course_code NOT ILIKE '25TC%' 
                     AND c.s_course_name NOT ILIKE '%quốc phòng%' 
                     AND c.s_course_name NOT ILIKE '%thể chất%' 
                    THEN pc.s_credits ELSE 0 END)::int as academic_credits
    FROM training_program_courses pc
    JOIN training_programs tp ON tp.id = pc.training_program_id
    JOIN courses c ON c.id = pc.course_id
    GROUP BY tp.s_program_code, pc.s_semester_no
    ORDER BY tp.s_program_code, pc.s_semester_no
  `;
  console.log(JSON.stringify(list, null, 2));
}

testAudit().catch(console.error).finally(() => prisma.$disconnect());
