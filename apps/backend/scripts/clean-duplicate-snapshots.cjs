const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function deduplicateSnapshot(grades) {
  if (!Array.isArray(grades) || grades.length <= 1) return grades;

  const byCode = new Map();
  for (const g of grades) {
    const code = String(g.courseCode || g.sCurriculumId || "").toUpperCase();
    if (!code) continue;

    if (!byCode.has(code)) {
      byCode.set(code, g);
      continue;
    }

    const existing = byCode.get(code);
    const gPass = Boolean(g.isPass || g.isPassed);
    const exPass = Boolean(existing.isPass || existing.isPassed);

    if (gPass && !exPass) {
      byCode.set(code, g);
      continue;
    }
    if (!gPass && exPass) continue;

    if (gPass && exPass) {
      const scoreG = Number(g.score10 ?? g.score4 ?? 0);
      const scoreEx = Number(existing.score10 ?? existing.score4 ?? 0);
      if (scoreG > scoreEx) {
        byCode.set(code, g);
        continue;
      }
      if (scoreG === scoreEx && String(g.academicYear || "") > String(existing.academicYear || "")) {
        byCode.set(code, g);
        continue;
      }
      continue;
    }

    const hasScoreG = g.score10 != null || g.score4 != null || Boolean(g.letterGrade || g.letterCode);
    const hasScoreEx = existing.score10 != null || existing.score4 != null || Boolean(existing.letterGrade || existing.letterCode);
    if (hasScoreG && !hasScoreEx) {
      byCode.set(code, g);
      continue;
    }
    if (!hasScoreG && hasScoreEx) continue;

    if (String(g.academicYear || "") > String(existing.academicYear || "")) {
      byCode.set(code, g);
    }
  }

  return Array.from(byCode.values());
}

async function main() {
  console.log("Deduplicating course attempts in graduation_evaluation_students.grade_snapshot...");
  const students = await prisma.graduationEvaluationStudent.findMany({
    select: { id: true, sStudentId: true, gradeSnapshot: true }
  });

  let updatedCount = 0;
  let totalRemoved = 0;

  for (const student of students) {
    if (!Array.isArray(student.gradeSnapshot) || student.gradeSnapshot.length === 0) continue;

    const beforeCount = student.gradeSnapshot.length;
    const deduplicated = deduplicateSnapshot(student.gradeSnapshot);
    const diff = beforeCount - deduplicated.length;

    if (diff > 0) {
      await prisma.graduationEvaluationStudent.update({
        where: { id: student.id },
        data: { gradeSnapshot: deduplicated }
      });
      updatedCount++;
      totalRemoved += diff;
    }
  }

  console.log(`Successfully deduplicated ${totalRemoved} duplicate course records across ${updatedCount} students.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
