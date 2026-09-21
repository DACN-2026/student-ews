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

async function checkK46Plans() {
  console.log("=== CHECKING K46 PLANS ===");
  const plans = await prisma.$queryRaw`
    SELECT p.id, co.s_cohort_code, tp.s_program_code, p.curriculum_semester_no, p.version, p.status, at.s_term_code
    FROM training_progress_plans p
    JOIN cohorts co ON co.id = p.cohort_id
    JOIN training_programs tp ON tp.id = p.training_program_id
    JOIN academic_terms at ON at.id = p.academic_term_id
    WHERE co.s_cohort_code = 'K46'
    ORDER BY tp.s_program_code, p.curriculum_semester_no, p.version
  `;
  console.table(plans);
}

checkK46Plans()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
