const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { StudentTrainingProgressService } = require('../lib/services/student-training-progress');

async function testAudit() {
  const students = await prisma.student.findMany({
    where: { deletedAt: null },
    select: { id: true, sStudentId: true, sFullName: true, sClassStudentId: true, sStudyProgramId: true },
    take: 10
  });

  for (const s of students) {
    const res = await StudentTrainingProgressService.getStudentTrainingProgress(s.id);
    if (!res) continue;
    const sp = res.scheduleProgress;
    const qpTcMissing = sp.missingRequiredCourses.filter(c => {
      const code = c.courseCode.toUpperCase();
      const name = c.courseName.toLowerCase();
      return code.startsWith('QP') || code.startsWith('TC') || code.includes('TC') || name.includes('quốc phòng') || name.includes('thể chất');
    });
    console.log(`SV ${s.sStudentId} - ${s.sFullName}:`);
    console.log(`  Mốc: HK${sp.expectedSemesterNo}, KH: ${sp.expectedCreditsToDate} TC, Đạt: ${sp.earnedCreditsToDate} TC, Chênh lệch: ${sp.creditDifference}`);
    console.log(`  Status: ${sp.progressStatus}, Missing mandatory: ${sp.missingRequiredCoursesCount}`);
    if (qpTcMissing.length > 0) {
      console.log(`  -> Trong đó có ${qpTcMissing.length} môn GDQP/GDTC:`, qpTcMissing.map(c => `${c.courseCode} (${c.credits}TC)`).join(', '));
    }
  }
}

testAudit().catch(console.error).finally(() => prisma.$disconnect());
