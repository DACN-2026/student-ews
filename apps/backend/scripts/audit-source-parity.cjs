// Read-only comparison with the School API. Never imports or deletes records.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS CLI, matching the source importer. */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { prisma } = require("../lib/prisma.ts");
const { fetchSourceData, clean } = require("./import-apidog-data.cjs");
const outputDirectory = path.resolve(__dirname, "../../../.tmp");
const cachePath = path.join(outputDirectory, "data-integrity-source-cache.json.gz");
const pick = (row, fields) => Object.fromEntries(fields.map(field => [field, row?.[field] ?? null]));
const canonical = row => JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)));

async function main() {
  // Validate database projections before making the external read requests.
  const [offerings, grades, conduct, decisions, students, terms, years, unscoped, fees, programs, curriculum, courses] = await Promise.all([
    prisma.studentCourseOffering.findMany({ select: { id: true, sStudentId: true, sCurriculumId: true, sStudyUnitId: true, sScheduleStudyUnitId: true, academicTermId: true } }),
    prisma.studentCourseGrade.findMany({ select: { offeringId: true, sourcePayload: true } }),
    prisma.studentConductRecord.findMany({ select: { sStudentId: true, academicTermId: true, sourcePayload: true } }),
    prisma.studentDecision.findMany({ select: { sourcePayload: true } }),
    prisma.student.findMany({ where: { deletedAt: null }, select: { sStudentId: true, sClassStudentId: true, sStudyProgramId: true } }),
    prisma.academicTerm.findMany(), prisma.academicYear.findMany(),
    prisma.unscopedGradeRecord.findMany({ select: { sStudentId: true, sCourseCode: true, sourcePayload: true, reason: true } }),
    prisma.studentFeePolicy.findMany({ select: { sourcePayload: true } }),
    prisma.trainingProgram.findMany(), prisma.trainingProgramCourse.findMany(), prisma.course.findMany(),
  ]);
  const cached = process.argv.includes("--cached");
  const source = cached ? JSON.parse(zlib.gunzipSync(fs.readFileSync(cachePath))) : await fetchSourceData();
  if (!cached) fs.writeFileSync(cachePath, zlib.gzipSync(JSON.stringify(source)));
  const yearMap = new Map(years.map(year => [year.id, year.sYearCode]));
  const termMap = new Map(terms.map(term => [term.id, `${yearMap.get(term.academicYearId)}|${term.sTermCode}`]));
  const gradeMap = new Map(grades.map(grade => [grade.offeringId, grade.sourcePayload]));
  const offeringMap = new Map(offerings.map(row => [[row.sStudentId, termMap.get(row.academicTermId), row.sCurriculumId, row.sStudyUnitId, row.sScheduleStudyUnitId].join("|"), gradeMap.get(row.id)]));
  const gradeFields = ["Credits", "IsPass", "NotScore", "DiemTK_10", "DiemTK_4", "DiemTK_Chu", "DiemChuyenMien", "StudyProgramID", "TB_HK_4", "TB_HK_10", "TB_TL_HK_4", "Dat_HK", "Dat_TL_HK"];
  const gradeIssues = [];
  for (const row of source.gradeRows) {
    const key = [row.studentId, row.yearCode, row.termCode, clean(row.grade.CurriculumID), clean(row.grade.StudyUnitID), clean(row.grade.ScheduleStudyUnitID)].join("|");
    const local = offeringMap.get(key);
    if (!local) gradeIssues.push({ studentCode: row.studentId, courseCode: row.grade.CurriculumID, type: "SOURCE_RECORD_NOT_IMPORTED" });
    else if (canonical(pick(local, gradeFields)) !== canonical(pick(row.grade, gradeFields))) gradeIssues.push({ studentCode: row.studentId, courseCode: row.grade.CurriculumID, type: "SOURCE_VALUES_DIFFER", fields: gradeFields.filter(field => canonical({ v: local[field] ?? null }) !== canonical({ v: row.grade[field] ?? null })) });
  }
  const conductMap = new Map(conduct.map(row => [[row.sStudentId, termMap.get(row.academicTermId)].join("|"), row.sourcePayload]));
  const conductFields = ["StudentScore", "ClassScore", "DepartmentScore", "StatusID", "LastScore"];
  const uniqueConduct = new Map(source.conductRows.map(row => [[clean(row.record.StudentID), row.yearCode, row.termCode].join("|"), row.record]));
  const conductIssues = [];
  const managedStudentCodes = new Set(students.map(row => row.sStudentId));
  const outOfScopeConduct = [];
  for (const [key, row] of uniqueConduct) {
    if (!managedStudentCodes.has(clean(row.StudentID))) {
      outOfScopeConduct.push({ key, reason: "STUDENT_OUTSIDE_MANAGED_ROSTER" });
      continue;
    }
    const local = conductMap.get(key);
    if (!local || canonical(pick(local, conductFields)) !== canonical(pick(row, conductFields))) conductIssues.push({ key, type: local ? "SOURCE_VALUES_DIFFER" : "SOURCE_RECORD_NOT_IMPORTED" });
  }
  const decisionFields = ["StudentID", "YearStudy", "TermID", "DecisionTypeID", "DecisionNumber", "DecisionAlias"];
  const decisionKey = row => decisionFields.map(field => clean(row[field])).join("|");
  const decisionMap = new Map(decisions.map(row => [decisionKey(row.sourcePayload), row.sourcePayload]));
  const uniqueDecisions = new Map(source.decisions.map(row => [decisionKey(row), row]));
  const decisionIssues = [...uniqueDecisions].filter(([key]) => !decisionMap.has(key)).map(([key]) => ({ key, type: "SOURCE_RECORD_NOT_IMPORTED" }));
  const studentMap = new Map(students.map(row => [row.sStudentId, row]));
  const rosterIssues = source.students.filter(row => !studentMap.has(clean(row.StudentID)) || studentMap.get(clean(row.StudentID)).sStudyProgramId !== clean(row.StudyProgramID) || studentMap.get(clean(row.StudentID)).sClassStudentId !== clean(row.ClassStudentID)).map(row => ({ studentCode: row.StudentID }));
  const localUnscoped = new Set(unscoped.map(row => [row.sStudentId, row.sCourseCode, clean(row.sourcePayload.DiemChuyenMien)].join("|")));
  const unscopedIssues = source.unscopedGradeRows.filter(row => !localUnscoped.has([row.studentId, clean(row.grade.CurriculumID), clean(row.grade.DiemChuyenMien)].join("|"))).map(row => ({ studentCode: row.studentId, courseCode: row.grade.CurriculumID }));
  const historicalQuarantines = unscoped.filter(row => row.reason === "API_PROGRAM_SCOPE_CONFLICT").map(row => ({ studentCode: row.sStudentId, courseCode: row.sCourseCode,
    sourceProgram: row.sourcePayload.StudyProgramID, reason: row.reason, retainedForTraceability: true }));
  const localFees = new Set(fees.map(row => canonical(row.sourcePayload)));
  const feeIssues = source.feePolicies.filter(row => !localFees.has(canonical(row))).map(row => ({ studentCode: row.StudentID }));
  const programMap = new Map(programs.map(row => [row.id, row.sProgramCode]));
  const courseMap = new Map(courses.map(row => [row.id, row.sCourseCode]));
  const curriculumMap = new Map(curriculum.map(row => [[programMap.get(row.trainingProgramId), courseMap.get(row.courseId)].join("|"), row]));
  const sourceCurriculumMap = new Map(source.curricula.map(row => [[clean(row.MaCTDT), clean(row.MaHP)].join("|"), row]));
  const sourceSemester = row => Number(clean(row.HocKy).match(/\d+/)?.[0] || 1);
  const curriculumIssues = [];
  const configuredSemesterDifferences = [];
  const inheritedCommonSemesters = [];
  for (const row of source.curricula) {
    const local = curriculumMap.get([clean(row.MaCTDT), clean(row.MaHP)].join("|"));
    let semester = sourceSemester(row);
    // Match the existing importer's explicit base/branch curriculum inheritance,
    // rather than comparing branch section labels with the whole-course timeline.
    if (semester === 1 && clean(row.MaCTDT).includes("-")) {
      const base = sourceCurriculumMap.get([clean(row.MaCTDT).split("-")[0], clean(row.MaHP)].join("|"));
      const branchSemesters = source.curricula.filter(item => item.MaCTDT === row.MaCTDT).map(sourceSemester).filter(value => value > 1);
      const branchStart = branchSemesters.length ? Math.min(...branchSemesters) : 5;
      if (base && sourceSemester(base) > 1 && sourceSemester(base) < branchStart) {
        semester = sourceSemester(base);
        inheritedCommonSemesters.push({ programCode: row.MaCTDT, courseCode: row.MaHP, sourceSemester: 1, commonSemester: semester });
      }
    }
    if (!local || local.sCredits !== Number(row.STC)) {
      curriculumIssues.push({ programCode: row.MaCTDT, courseCode: row.MaHP, type: local ? "CREDITS_DIFFER" : "SOURCE_RECORD_NOT_IMPORTED" });
    } else if (local.sSemesterNo !== semester) {
      configuredSemesterDifferences.push({ programCode: row.MaCTDT, courseCode: row.MaHP, sourceSemester: sourceSemester(row), configuredSemester: local.sSemesterNo,
        configurationSource: "scripts/fix-training-program-semesters.cjs", note: "Existing explicit semester configuration; reported separately from source identity, credits and per-student missing-data checks. Not changed by this audit." });
    }
  }
  const report = { checkedAt: new Date().toISOString(), cached, sourceCounts: { students: source.students.length, curricula: source.curricula.length, grades: source.gradeRows.length, unscoped: source.unscopedGradeRows.length, conductRaw: source.conductRows.length, conductUnique: uniqueConduct.size, decisionsRaw: source.decisions.length, decisionsUnique: uniqueDecisions.size, fees: source.feePolicies.length }, inheritedCommonSemesters, configuredSemesterDifferences, historicalQuarantines, outOfScopeConduct, gradeIssues, conductIssues, decisionIssues, rosterIssues, unscopedIssues, feeIssues, curriculumIssues };
  fs.writeFileSync(path.join(outputDirectory, "data-integrity-live-source-parity.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, gradeIssues: gradeIssues.slice(0, 5), gradeIssueCount: gradeIssues.length }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
