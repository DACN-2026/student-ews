const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const programs = await prisma.trainingProgram.findMany({
    orderBy: {
      sProgramCode: 'asc'
    }
  });

  for (const p of programs) {
    const courseCount = await prisma.trainingProgramCourse.count({
      where: {
        trainingProgramId: p.id
      }
    });
    console.log(`${p.sProgramCode}: ${courseCount} học phần`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
