const path = require('path');
const fs = require('fs');

const backendDir = path.resolve(__dirname, "..");
for (const name of [".env", ".env.local"]) {
  const file = path.resolve(backendDir, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (match) process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, "");
  }
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.$queryRaw`
    SELECT c.* 
    FROM training_progress_plan_courses c
    JOIN training_progress_plans p ON c.plan_id = p.id
    JOIN cohorts co ON p.cohort_id = co.id
    JOIN training_programs tp ON p.training_program_id = tp.id
    WHERE co.s_cohort_code = 'K46' AND tp.s_program_code = 'CQ22CT-PM' AND p.curriculum_semester_no = 1
  `;
  
  console.log(`Total courses in HK1: ${result.length}`);
  const electives = result.filter(c => c.requirement_type === 'elective');
  console.log(`Elective courses: ${electives.length}`);
  for(const c of electives) {
    console.log(`- ${c.s_course_code}: ${c.s_course_name} (${c.s_credits} TC)`);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
