// Rebuild the visible training plans from 2026-Ke-hoach-giang-day-nh-26-27 (1).pdf.
// Run without --apply to validate and preview; --apply archives the superseded plans.
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

for (const name of ['.env', '.env.local']) {
  const file = path.join(__dirname, '..', name);
  if (!fs.existsSync(file)) continue;
  const match = fs.readFileSync(file, 'utf8').match(/^DATABASE_URL=(.*)$/m);
  if (match) process.env.DATABASE_URL = match[1].trim().replace(/^"|"$/g, '');
}

const db = new PrismaClient();
const marker = '20262027-0000-4000-8000-000000000001';
const creditOverrides = new Map(Object.entries({
  '25TC3001': 1, '25TC3002': 1, '25TC3003': 1,
  '20CT3204': 1, 'LC2101D': 2, 'LC2102D': 2, 'LC3101D': 2,
  '20CT2201': 4, '20CT2203': 4, '20CT2202': 4, '20CT2101': 4,
  '20CT3121': 4, '20CT3103': 4, '20CT3123': 4, '20CT3124': 4,
  '20CT3113': 4, '20CT4201': 8, '20CT4202': 10,
}));
const creditsFor = (code) => creditOverrides.get(code) || 3;
const mandatory = (codes) => codes.map((code) => ({ code, type: 'mandatory' }));
const elective = (codes, group) => codes.map((code) => ({ code, type: 'elective', group }));
const plans = [
  { cohort: 'K49', program: 'CQ25CT', term: 'HK01', semester: 3, electiveCredits: 7, courses: [
    ...mandatory(['LC2101D', '20CT1201', '20CT2102', '20CT2103', '20CT3204']),
    ...elective(['25TC3001', '25TC3002', '25TC3003'], 'GDTC3:1'),
    ...elective(['20TN2102', '20QT0004', '20QT0001'], 'DAI_CUONG:6'),
  ] },
  { cohort: 'K49', program: 'CQ25CT', term: 'HK02', semester: 4, electiveCredits: 3, courses: [
    ...mandatory(['LC2102D', '20CT2201', '20CT2203', '20CT2204']),
    ...elective(['20NV0002', '20QT0006', '20SP0001'], 'DAI_CUONG:3'),
  ] },
  { cohort: 'K48', program: 'CQ24CT', term: 'HK01', semester: 5, electiveCredits: 3, courses: [
    ...mandatory(['LC3101D', '20CT2202', '20CT2101', '20CT2205']),
    ...elective(['20CT3107', '20CT3108'], 'TU_CHON:3'),
  ] },
  { cohort: 'K48', program: 'CQ24CT-MMT', term: 'HK02', semester: 6, electiveCredits: 7, draft: true, courses: [
    ...mandatory(['20CT3120', '20CT3121', '20CT3122']),
    ...elective(['20CT3106'], 'BO_TRO:3'),
    ...elective(['20CT3103', '20CT3123', '20CT3124'], 'CHUYEN_NGANH:4'),
  ] },
  { cohort: 'K48', program: 'CQ24CT-PM', term: 'HK02', semester: 6, electiveCredits: 9, draft: true, courses: [
    ...mandatory(['20CT3101', '20CT3132', '20CT3103']),
    ...elective(['20CT3106'], 'BO_TRO:3'),
    ...elective(['20CT3104', '20CT3105', '20CT3208'], 'CHUYEN_NGANH:6'),
  ] },
  { cohort: 'K48', program: 'CQ24CT-KHDL', term: 'HK02', semester: 6, electiveCredits: 6, draft: true, courses: [
    ...mandatory(['20TN3111', '20CT3112', '20CT3113']),
    ...elective(['20CT3106'], 'BO_TRO:3'),
    ...elective(['20CT3103', '20CT3132', '20CT3123'], 'CHUYEN_NGANH:3'),
  ] },
  { cohort: 'K47', program: 'CQ23CT-MMT', term: 'HK01', semester: 7, electiveCredits: 9, courses: [
    ...mandatory(['20CT3220', '20CT3202', '20CT3221']),
    ...elective(['20CT3222', '20CT3223', '20CT3224', '20CT3225'], 'CHUYEN_NGANH:9'),
  ] },
  { cohort: 'K47', program: 'CQ23CT-MMT', term: 'HK02', semester: 8, electiveCredits: 12, courses: [
    ...mandatory(['20CT4120', '20CT4121']),
    ...elective(['20CT4122', '20CT4107', '20CT4124', '20CT4125', '20CT4126'], 'CHUYEN_NGANH:12'),
  ] },
  { cohort: 'K47', program: 'CQ23CT-PM', term: 'HK01', semester: 7, electiveCredits: 9, courses: [
    ...mandatory(['20CT3201', '20CT3202', '20CT3203']),
    ...elective(['20CT3205', '20CT3206', '20CT3207', '20CT4103'], 'CHUYEN_NGANH:9'),
  ] },
  { cohort: 'K47', program: 'CQ23CT-PM', term: 'HK02', semester: 8, electiveCredits: 12, courses: [
    ...mandatory(['20CT4101', '20CT4102']),
    ...elective(['20CT4104', '20CT3113', '20CT4105', '20CT4106', '20CT4107'], 'CHUYEN_NGANH:12'),
  ] },
  ...['CQ22CT-MMT', 'CQ22CT-PM'].map((program) => ({
    cohort: 'K46', program, term: 'HK01', semester: 9, electiveCredits: 0, final: true,
    courses: mandatory(['20CT4201', '20CT4202']),
  })),
];

const branchNames = {
  'CQ24CT-MMT': 'Công nghệ thông tin K48 - Mạng máy tính',
  'CQ24CT-PM': 'Công nghệ thông tin K48 - Kỹ thuật phần mềm',
  'CQ24CT-KHDL': 'Công nghệ thông tin K48 - Khoa học dữ liệu',
};

async function main() {
  const existingMarker = await db.trainingProgressPlan.count({ where: { cloneBatchId: marker } });
  if (existingMarker) {
    if (existingMarker !== plans.length) throw new Error(`Found only ${existingMarker}/${plans.length} rebuilt plans`);
    console.log(`Already rebuilt: ${existingMarker} plans`);
    return;
  }
  const [cohorts, programs, year, terms, catalog, oldPlans, programCourses] = await Promise.all([
    db.cohort.findMany({ where: { deletedAt: null } }),
    db.trainingProgram.findMany({ where: { deletedAt: null } }),
    db.academicYear.findUnique({ where: { sYearCode: '2026-2027' } }),
    db.academicTerm.findMany({ where: { deletedAt: null } }),
    db.course.findMany({ where: { deletedAt: null } }),
    db.trainingProgressPlan.findMany(),
    db.trainingProgramCourse.findMany(),
  ]);
  if (!year) throw new Error('Academic year 2026-2027 is missing');
  const cohortByCode = new Map(cohorts.map((x) => [x.sCohortCode, x]));
  const programByCode = new Map(programs.map((x) => [x.sProgramCode, x]));
  const termByCode = new Map(terms.filter((x) => x.academicYearId === year.id).map((x) => [x.sTermCode, x]));
  const courseByCode = new Map(catalog.map((x) => [x.sCourseCode, x]));
  const targetCohortIds = new Set(['K46', 'K47', 'K48', 'K49'].map((code) => cohortByCode.get(code)?.id));
  if (oldPlans.some((plan) => !targetCohortIds.has(plan.cohortId))) {
    throw new Error('Plans for other cohorts exist; review them before archiving all plans');
  }
  const prepared = plans.map((plan) => {
    if (!cohortByCode.has(plan.cohort)) throw new Error(`Missing cohort ${plan.cohort}`);
    if (!termByCode.has(plan.term)) throw new Error(`Missing term ${plan.term}`);
    if (!programByCode.has(plan.program) && !branchNames[plan.program]) throw new Error(`Missing program ${plan.program}`);
    const courses = plan.courses.map((item) => {
      const course = courseByCode.get(item.code) || courseByCode.get(`${item.code}D`);
      if (!course) throw new Error(`Missing catalog course ${item.code}`);
      return { ...item, course };
    });
    const existingProgram = programByCode.get(plan.program);
    if (existingProgram) {
      const requirements = programCourses.filter((x) => x.trainingProgramId === existingProgram.id && x.sSemesterNo === plan.semester);
      for (const entry of courses) {
        const requirement = requirements.find((x) => x.courseId === entry.course.id);
        if (!requirement) throw new Error(`${plan.program} semester ${plan.semester} lacks ${entry.code}`);
        const expectedType = requirement.sRequirementType.toLocaleLowerCase('vi').includes('bắt') ? 'mandatory' : 'elective';
        if (entry.type !== expectedType || creditsFor(entry.code) !== requirement.sCredits) {
          throw new Error(`${plan.program}/${entry.code}: PDF type or credits differ from current curriculum`);
        }
      }
    }
    if (new Set(courses.map((x) => x.course.id)).size !== courses.length) throw new Error(`Duplicate course in ${plan.cohort}/${plan.program}/${plan.term}`);
    const groupRequirements = new Map();
    for (const item of courses.filter((x) => x.group)) {
      const [group, requiredText] = item.group.split(':');
      const required = Number(requiredText);
      if (!group || !Number.isInteger(required) || required < 1) throw new Error(`Invalid group ${item.group}`);
      groupRequirements.set(item.group, required);
    }
    const minimum = [...groupRequirements.values()].reduce((a, b) => a + b, 0);
    if (minimum !== plan.electiveCredits) throw new Error(`Elective threshold mismatch in ${plan.cohort}/${plan.program}/${plan.term}`);
    for (const [group, required] of groupRequirements) {
      const available = courses.filter((x) => x.group === group).reduce((sum, x) => sum + creditsFor(x.code), 0);
      if (available < required) throw new Error(`Insufficient options in ${group}`);
    }
    return { ...plan, courses };
  });
  console.table(prepared.map((x) => ({ cohort: x.cohort, program: x.program, term: x.term, semester: x.semester, courses: x.courses.length, electiveCredits: x.electiveCredits, status: x.draft ? 'draft' : 'locked' })));
  console.log(`Superseded plans: ${oldPlans.length}`);
  if (!process.argv.includes('--apply')) return;

  const backupFile = path.resolve(__dirname, '../../../backups/training-plans-before-2026-2027.json');
  if (!fs.existsSync(backupFile)) {
    const oldCourses = await db.trainingProgressPlanCourse.findMany({ where: { planId: { in: oldPlans.map((x) => x.id) } } });
    fs.writeFileSync(backupFile, JSON.stringify({ source: 'Before rebuilding from 2026-2027 teaching plan', plans: oldPlans, courses: oldCourses }, null, 2));
  }
  await db.$transaction(async (tx) => {
    await tx.trainingProgressPlan.updateMany({
      where: { OR: [{ cloneBatchId: null }, { cloneBatchId: { not: marker } }] },
      data: { status: 'archived', isCurrent: false },
    });
    const base = programByCode.get('CQ24CT');
    if (!base) throw new Error('Missing CQ24CT');
    for (const [code, name] of Object.entries(branchNames)) {
      if (!programByCode.has(code)) {
        const created = await tx.trainingProgram.create({ data: {
          sProgramCode: code, sProgramName: name, sDegreeLevel: base.sDegreeLevel,
          sMajor: base.sMajor, sStudyType: base.sStudyType, s_faculty_code: base.s_faculty_code,
        } });
        programByCode.set(code, created);
      }
    }
    for (const item of prepared.filter((plan) => branchNames[plan.program])) {
      const trainingProgramId = programByCode.get(item.program).id;
      const existingRequirements = await tx.trainingProgramCourse.findMany({ where: { trainingProgramId, sSemesterNo: item.semester } });
      if (existingRequirements.length === 0) {
        await tx.trainingProgramCourse.createMany({ data: item.courses.map((entry) => ({
          trainingProgramId, courseId: entry.course.id, sSemesterNo: item.semester,
          sCredits: creditsFor(entry.code), sRequirementType: entry.type === 'mandatory' ? 'Bắt Buộc' : 'Tự Chọn',
          sYearStudy: '2026-2027', sTermId: item.term, academicTermId: termByCode.get(item.term).id,
        })) });
      }
    }
    for (const item of prepared) {
      const cohortId = cohortByCode.get(item.cohort).id;
      const trainingProgramId = programByCode.get(item.program).id;
      const academicTermId = termByCode.get(item.term).id;
      const previousVersion = oldPlans.filter((plan) => plan.cohortId === cohortId && plan.trainingProgramId === trainingProgramId && plan.academicTermId === academicTermId)
        .reduce((max, plan) => Math.max(max, plan.version), 0);
      const created = await tx.trainingProgressPlan.create({ data: {
        cohortId,
        trainingProgramId,
        academicYearId: year.id,
        academicTermId,
        curriculumSemesterNo: item.semester,
        requiredElectiveCredits: item.electiveCredits,
        is_program_final: Boolean(item.final),
        version: previousVersion + 1,
        status: item.draft ? 'draft' : 'locked',
        isCurrent: !item.draft,
        cloneBatchId: marker,
      } });
      await tx.trainingProgressPlanCourse.createMany({ data: item.courses.map((entry) => ({
        planId: created.id, courseId: entry.course.id,
        sCourseCode: entry.code, sCourseName: entry.course.sCourseName,
        sCredits: creditsFor(entry.code),
        requirementType: entry.type, choiceGroupCode: entry.group || null,
        isRegistrationRequired: entry.type === 'mandatory',
      })) });
    }
  }, { maxWait: 10_000, timeout: 60_000 });
  console.log(`Rebuilt ${prepared.length} plans; archived ${oldPlans.length} superseded plans. Backup: ${backupFile}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
