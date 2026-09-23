const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Checking graduation_evaluation_students with SHCD in grade_snapshot...");
  const students = await prisma.graduationEvaluationStudent.findMany({
    select: { id: true, sStudentId: true, gradeSnapshot: true }
  });

  let updatedCount = 0;
  let totalRemoved = 0;

  for (const student of students) {
    if (!Array.isArray(student.gradeSnapshot) || student.gradeSnapshot.length === 0) continue;
    
    const beforeCount = student.gradeSnapshot.length;
    const cleaned = student.gradeSnapshot.filter(g => {
      const code = String(g.courseCode || g.sCurriculumId || '').toUpperCase();
      const name = String(g.courseName || g.sCourseName || '').toLowerCase();
      return !code.startsWith('SHCD') && !name.includes('sinh hoạt công dân');
    });

    const diff = beforeCount - cleaned.length;
    if (diff > 0) {
      await prisma.graduationEvaluationStudent.update({
        where: { id: student.id },
        data: { gradeSnapshot: cleaned }
      });
      updatedCount++;
      totalRemoved += diff;
    }
  }

  console.log(`Cleaned ${totalRemoved} SHCD records across ${updatedCount} students.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
