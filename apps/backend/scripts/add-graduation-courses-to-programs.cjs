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
  console.log('--- BỔ SUNG HỌC PHẦN TỐT NGHIỆP HK9 CHO CÁC CTĐT CNTT ---');

  const c4201 = await prisma.course.findFirst({
    where: { sCourseCode: '20CT4201D', deletedAt: null }
  });
  const c4202 = await prisma.course.findFirst({
    where: { sCourseCode: '20CT4202D', deletedAt: null }
  });

  if (!c4201 || !c4202) {
    console.error('Không tìm thấy môn 20CT4201D hoặc 20CT4202D trong bảng courses');
    return;
  }

  const targetProgramCodes = [
    'CQ22CT',
    'CQ22CT-MMT',
    'CQ22CT-PM',
    'CQ23CT',
    'CQ23CT-MMT',
    'CQ23CT-PM',
    'CQ24CT',
    'CQ24CT-MMT',
    'CQ24CT-PM',
    'CQ24CT-KHDL',
    'CQ25CT'
  ];

  const progs = await prisma.trainingProgram.findMany({
    where: { sProgramCode: { in: targetProgramCodes } }
  });

  for (const prog of progs) {
    const existingCourses = await prisma.trainingProgramCourse.findMany({
      where: { trainingProgramId: prog.id }
    });

    const has4201 = existingCourses.some(c => c.courseId === c4201.id);
    const has4202 = existingCourses.some(c => c.courseId === c4202.id);

    if (!has4201) {
      await prisma.trainingProgramCourse.create({
        data: {
          id: crypto.randomUUID(),
          trainingProgramId: prog.id,
          courseId: c4201.id,
          sSemesterNo: 9,
          sCredits: 8,
          sTheoryHours: 0,
          sPracticeHours: 8,
          sRequirementType: 'Bắt Buộc',
          sNote: 'Thực tập nghề nghiệp (theo Kế hoạch giảng dạy)',
          sYearStudy: '5',
        }
      });
      console.log(`[${prog.sProgramCode}] Đã thêm 20CT4201D (8 TC, HK 9).`);
    } else {
      // Ensure semester is 9 and credits is 8
      const entry = existingCourses.find(c => c.courseId === c4201.id);
      if (entry && (entry.sSemesterNo !== 9 || entry.sCredits !== 8)) {
        await prisma.trainingProgramCourse.update({
          where: { id: entry.id },
          data: { sSemesterNo: 9, sCredits: 8 }
        });
        console.log(`[${prog.sProgramCode}] Đã cập nhật 20CT4201D thành HK 9, 8 TC.`);
      }
    }

    if (!has4202) {
      await prisma.trainingProgramCourse.create({
        data: {
          id: crypto.randomUUID(),
          trainingProgramId: prog.id,
          courseId: c4202.id,
          sSemesterNo: 9,
          sCredits: 10,
          sTheoryHours: 0,
          sPracticeHours: 10,
          sRequirementType: 'Bắt Buộc',
          sNote: 'Đồ án tốt nghiệp (theo Kế hoạch giảng dạy)',
          sYearStudy: '5',
        }
      });
      console.log(`[${prog.sProgramCode}] Đã thêm 20CT4202D (10 TC, HK 9).`);
    } else {
      // Ensure semester is 9 and credits is 10
      const entry = existingCourses.find(c => c.courseId === c4202.id);
      if (entry && (entry.sSemesterNo !== 9 || entry.sCredits !== 10)) {
        await prisma.trainingProgramCourse.update({
          where: { id: entry.id },
          data: { sSemesterNo: 9, sCredits: 10 }
        });
        console.log(`[${prog.sProgramCode}] Đã cập nhật 20CT4202D thành HK 9, 10 TC.`);
      }
    }
  }

  console.log('--- HOÀN TẤT BỔ SUNG HỌC PHẦN TỐT NGHIỆP HK9 ---');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
