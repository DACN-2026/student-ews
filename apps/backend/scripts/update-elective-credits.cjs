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
  const plans = await prisma.trainingProgressPlan.findMany();
  const programs = await prisma.trainingProgram.findMany();
  const programMap = {};
  for (const prog of programs) programMap[prog.id] = prog.sProgramCode || "";

  let updated = 0;
  for (const plan of plans) {
    const sem = plan.curriculumSemesterNo;
    const progCode = programMap[plan.trainingProgramId] || ""; 
 
    let credits = 0;

    if (sem === 1) credits = 15;
    else if (sem === 2) credits = 6;
    else if (sem === 3) credits = 6;
    else if (sem === 4) credits = 0;
    else if (sem === 5) {
      if (progCode.includes("MMT")) credits = 10;
      else if (progCode.includes("PM")) credits = 9;
      else if (progCode.includes("DL") || progCode.includes("KHDL")) credits = 9;
    }
    else if (sem === 6) {
      if (progCode.includes("MMT")) credits = 9;
      else if (progCode.includes("PM")) credits = 9;
      else if (progCode.includes("DL") || progCode.includes("KHDL")) credits = 9;
    }
    else if (sem === 7) {
      if (progCode.includes("MMT")) credits = 12;
      else if (progCode.includes("PM")) credits = 15;
      else if (progCode.includes("DL") || progCode.includes("KHDL")) credits = 15;
    }
    else if (sem >= 8) credits = 0;

    if (plan.requiredElectiveCredits !== credits) {
      await prisma.trainingProgressPlan.update({
        where: { id: plan.id },
        data: { requiredElectiveCredits: credits }
      });
      updated++;
    }
  }
  console.log(`Updated ${updated} plans out of ${plans.length} total.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
