const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const courses = await prisma.$queryRaw`
    SELECT DISTINCT c.s_course_code, c.s_course_name, pc.s_credits, pc.s_semester_no, pc.s_requirement_type
    FROM training_program_courses pc
    JOIN courses c ON c.id = pc.course_id
    WHERE c.s_course_code ILIKE 'QP%' 
       OR c.s_course_code ILIKE 'TC%'
       OR c.s_course_code ILIKE '%TC%'
       OR c.s_course_name ILIKE '%quốc phòng%'
       OR c.s_course_name ILIKE '%thể chất%'
    ORDER BY pc.s_semester_no, c.s_course_code
  `;
  console.log('Courses count:', courses.length);
  console.log(JSON.stringify(courses, null, 2));

  // Also check if any student has grades for QP or TC
  const gradeSample = await prisma.$queryRaw`
    SELECT o.s_curriculum_id, o.s_course_name, o.s_credits, g.is_pass, g.letter_code, count(*)::int as count
    FROM student_course_offerings o
    LEFT JOIN student_course_grades g ON g.offering_id = o.id
    WHERE o.s_curriculum_id ILIKE 'QP%'
       OR o.s_curriculum_id ILIKE 'TC%'
       OR o.s_curriculum_id ILIKE '%TC%'
       OR o.s_course_name ILIKE '%quốc phòng%'
       OR o.s_course_name ILIKE '%thể chất%'
    GROUP BY o.s_curriculum_id, o.s_course_name, o.s_credits, g.is_pass, g.letter_code
    LIMIT 20
  `;
  console.log('Grades sample:', JSON.stringify(gradeSample, null, 2));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
