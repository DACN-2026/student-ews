const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const backendDir = path.resolve(__dirname, '..');
for (const name of ['.env', '.env.local']) {
  const file = path.resolve(backendDir, name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (match) process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, '');
  }
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('--- BẮT ĐẦU CHUẨN HÓA HỌC KỲ CTĐT CHO CÁC CHUYÊN NGÀNH ---');

  const allCourses = await prisma.course.findMany({ where: { deletedAt: null } });
  const courseCodeById = new Map(allCourses.map(c => [c.id, c.sCourseCode.toUpperCase().trim()]));

  // 1. Chuẩn hóa K46: CQ22CT-PM và CQ22CT-MMT dựa theo CQ22CT
  const base22 = await prisma.trainingProgram.findFirst({ where: { sProgramCode: 'CQ22CT' } });
  if (base22) {
    const baseCourses22 = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: base22.id },
    });
    const baseCourseMap22 = new Map(
      baseCourses22.map(c => [courseCodeById.get(c.courseId), c.sSemesterNo])
    );

    for (const code of ['CQ22CT-PM', 'CQ22CT-MMT']) {
      const prog = await prisma.trainingProgram.findFirst({ where: { sProgramCode: code } });
      if (!prog) continue;

      const progCourses = await prisma.trainingProgramCourse.findMany({
        where: { trainingProgramId: prog.id },
      });

      let updatedCount = 0;
      for (const pc of progCourses) {
        const cCode = courseCodeById.get(pc.courseId);
        if (!cCode) continue;
        let targetSemester = null;

        if (baseCourseMap22.has(cCode)) {
          const baseSem = baseCourseMap22.get(cCode);
          if (baseSem > 1 && pc.sSemesterNo === 1) {
            targetSemester = baseSem;
          }
        } else if (cCode === 'TC1002C' && pc.sSemesterNo === 1) {
          targetSemester = 2; // GDTC 2
        } else if (cCode === '20CT3203' && pc.sSemesterNo === 1) {
          targetSemester = 7; // Mẫu thiết kế (Năm 4 HK1)
        }

        if (targetSemester !== null && targetSemester !== pc.sSemesterNo) {
          await prisma.trainingProgramCourse.update({
            where: { id: pc.id },
            data: { sSemesterNo: targetSemester }
          });
          updatedCount++;
        }
      }
      console.log(`[K46] ${code}: Đã cập nhật lại học kỳ chính xác cho ${updatedCount} học phần.`);
    }
  }

  // 2. Chuẩn hóa K47: Bổ sung các môn đại cương (HK 1-4) từ CQ23CT vào CQ23CT-PM & CQ23CT-MMT
  const base23 = await prisma.trainingProgram.findFirst({ where: { sProgramCode: 'CQ23CT' } });
  if (base23) {
    const baseCourses23 = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: base23.id, sSemesterNo: { lte: 4 } },
    });

    for (const code of ['CQ23CT-PM', 'CQ23CT-MMT']) {
      const prog = await prisma.trainingProgram.findFirst({ where: { sProgramCode: code } });
      if (!prog) continue;

      const existingCourseIds = new Set(
        (await prisma.trainingProgramCourse.findMany({
          where: { trainingProgramId: prog.id },
          select: { courseId: true }
        })).map(c => c.courseId)
      );

      let addedCount = 0;
      for (const bc of baseCourses23) {
        if (!existingCourseIds.has(bc.courseId)) {
          await prisma.trainingProgramCourse.create({
            data: {
              id: crypto.randomUUID(),
              trainingProgramId: prog.id,
              courseId: bc.courseId,
              sSemesterNo: bc.sSemesterNo,
              sCredits: bc.sCredits,
              sTheoryHours: bc.sTheoryHours,
              sPracticeHours: bc.sPracticeHours,
              sRequirementType: bc.sRequirementType,
              sNote: bc.sNote,
              sYearStudy: bc.sYearStudy,
              sTermId: bc.sTermId,
              sDepartmentCode: bc.sDepartmentCode,
              sFacultyCode: bc.sFacultyCode,
              academicTermId: bc.academicTermId
            }
          });
          addedCount++;
        }
      }
      console.log(`[K47] ${code}: Đã bổ sung ${addedCount} học phần đại cương (HK 1-4) từ CQ23CT.`);
    }
  }

  // 3. Chuẩn hóa K48: Bổ sung các môn đại cương (HK 1-5) từ CQ24CT vào CQ24CT-PM, CQ24CT-MMT, CQ24CT-KHDL
  const base24 = await prisma.trainingProgram.findFirst({ where: { sProgramCode: 'CQ24CT' } });
  if (base24) {
    const baseCourses24 = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: base24.id, sSemesterNo: { lte: 5 } },
    });

    for (const code of ['CQ24CT-PM', 'CQ24CT-MMT', 'CQ24CT-KHDL']) {
      const prog = await prisma.trainingProgram.findFirst({ where: { sProgramCode: code } });
      if (!prog) continue;

      const existingCourseIds = new Set(
        (await prisma.trainingProgramCourse.findMany({
          where: { trainingProgramId: prog.id },
          select: { courseId: true }
        })).map(c => c.courseId)
      );

      let addedCount = 0;
      for (const bc of baseCourses24) {
        if (!existingCourseIds.has(bc.courseId)) {
          await prisma.trainingProgramCourse.create({
            data: {
              id: crypto.randomUUID(),
              trainingProgramId: prog.id,
              courseId: bc.courseId,
              sSemesterNo: bc.sSemesterNo,
              sCredits: bc.sCredits,
              sTheoryHours: bc.sTheoryHours,
              sPracticeHours: bc.sPracticeHours,
              sRequirementType: bc.sRequirementType,
              sNote: bc.sNote,
              sYearStudy: bc.sYearStudy,
              sTermId: bc.sTermId,
              sDepartmentCode: bc.sDepartmentCode,
              sFacultyCode: bc.sFacultyCode,
              academicTermId: bc.academicTermId
            }
          });
          addedCount++;
        }
      }
      console.log(`[K48] ${code}: Đã bổ sung ${addedCount} học phần đại cương (HK 1-5) từ CQ24CT.`);
    }
  }

  console.log('--- HOÀN TẤT CHUẨN HÓA HỌC KỲ CTĐT ---');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
