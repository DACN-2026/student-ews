// Read-only audit of the source API against the students shown as unassessed.
const fs = require("node:fs");
const path = require("node:path");
const { prisma } = require("../lib/prisma.ts");
const { ReportsService } = require("../lib/services/reports.ts");

// Reuse the importer's source authentication and parsing without running main.
const importerFile = path.join(__dirname, "import-apidog-data.cjs");
const importerModule = { exports: {} };
new Function("require", "module", "exports", "__dirname", fs.readFileSync(importerFile, "utf8") + `
module.exports.audit = { createSourceClient, mapLimit, clean, normalizeTerm, validYear,
  parseNumber, parseInteger, marker, scoreParts };
`)(require, importerModule, importerModule.exports, __dirname);
const source = importerModule.exports.audit;
const clean = source.clean;
const number = (value) => value == null ? null : Number(value);
const key = (...values) => JSON.stringify(values);

async function main() {
  const year = await prisma.academicYear.findUnique({ where: { sYearCode: "2025-2026" } });
  const term = await prisma.academicTerm.findFirst({ where: { academicYearId: year.id, sTermCode: "HK02" } });
  const report = await ReportsService.academicWarningStudents({ academicTermId: term.id, includeAllStates: true, pageSize: 1000 });
  const represented = new Set(report.items.map((row) => row.studentId));
  const allStudents = await prisma.student.findMany({ where: { deletedAt: null }, orderBy: { sStudentId: "asc" } });
  const students = allStudents.filter((student) => !represented.has(student.id));
  const ids = students.map((student) => student.id);
  const [offerings, grades, summaries, terms, years] = await Promise.all([
    prisma.studentCourseOffering.findMany({ where: { studentId: { in: ids } } }),
    prisma.studentCourseGrade.findMany({ where: { offeringId: { in: (await prisma.studentCourseOffering.findMany({ where: { studentId: { in: ids } }, select: { id: true } })).map((row) => row.id) } } }),
    prisma.studentTermSummary.findMany({ where: { studentId: { in: ids } } }),
    prisma.academicTerm.findMany(),
    prisma.academicYear.findMany(),
  ]);
  const yearMap = new Map(years.map((row) => [row.id, row.sYearCode]));
  const periodMap = new Map(terms.map((row) => [row.id, [yearMap.get(row.academicYearId), row.sTermCode]]));
  const gradeMap = new Map(grades.map((row) => [row.offeringId, row]));
  const call = await source.createSourceClient();
  if (students.length !== 35) throw new Error("Audit scope changed; expected the 35 previously listed students");
  console.log(`Auditing only the ${students.length} previously listed unassessed students.`);
  let completed = 0;
  const results = await source.mapLimit(students, 4, async (student) => {
    const data = await call("LayBangDiemSinhVien", { p1: student.sStudentId, p2: student.sStudyProgramId, p3: "ALL", p4: "ALL" });
    if (!Array.isArray(data)) throw new Error("Invalid source transcript");
    const apiRows = new Map();
    const apiSummaries = new Map();
    let unscoped = 0;
    const apiPeriods = [];
    for (const sourceYear of data) for (const sourceTerm of sourceYear.DanhSachDiem || []) {
      const rows = sourceTerm.DanhSachDiemHK || [];
      const first = rows[0] || {};
      const yearCode = clean(sourceYear.NamHoc) || clean(first.NamHoc) || clean(first.YearStudy);
      const rawTerm = clean(sourceTerm.HocKy) || clean(sourceTerm.TermID) || clean(first.HocKy) || clean(first.TermID);
      if (!source.validYear(yearCode) || !rawTerm) { unscoped += rows.length; continue; }
      const termCode = source.normalizeTerm(rawTerm);
      apiPeriods.push({ year: yearCode, term: termCode, rows: rows.length });
      for (const row of rows) {
        apiRows.set(key(yearCode, termCode, clean(row.CurriculumID), clean(row.StudyUnitID), clean(row.ScheduleStudyUnitID)), row);
        const summaryKey = key(yearCode, termCode, clean(row.StudyProgramID));
        if (!apiSummaries.has(summaryKey)) apiSummaries.set(summaryKey, row);
      }
    }
    const dbOffers = offerings.filter((row) => row.studentId === student.id);
    const dbRows = new Map(dbOffers.map((row) => [key(...periodMap.get(row.academicTermId), row.sCurriculumId, row.sStudyUnitId, row.sScheduleStudyUnitId), row]));
    const differences = [];
    const compare = (recordKey, field, apiValue, dbValue) => {
      if (apiValue !== dbValue) differences.push({ key: recordKey, field, api: apiValue, system: dbValue });
    };
    for (const [recordKey, row] of apiRows) {
      const offering = dbRows.get(recordKey);
      if (!offering) { differences.push({ key: recordKey, field: "missing_from_system" }); continue; }
      const grade = gradeMap.get(offering.id);
      if (!grade) { differences.push({ key: recordKey, field: "missing_system_grade" }); continue; }
      const score10 = source.scoreParts(row.DiemTK_10, 10);
      const score4 = source.scoreParts(row.DiemTK_4, 4);
      let letter = clean(row.DiemTK_Chu) || null;
      let special = score10.special || score4.special;
      if (letter && (letter.toUpperCase() === "VT" || (score10.value == null && score4.value == null && letter.toUpperCase() !== "N/A"))) { special ||= letter.slice(0, 16); letter = null; }
      for (const [field, apiValue, dbValue] of [
        ["credits", source.parseInteger(row.Credits), offering.sCredits],
        ["program", clean(row.StudyProgramID), clean(offering.sProgramCode)],
        ["score10", score10.value, number(grade.score10)], ["score4", score4.value, number(grade.score4)],
        ["letter", letter, grade.letterCode], ["special", special, grade.specialCode],
        ["isPass", source.marker(row.IsPass), grade.isPass], ["isGather", source.marker(row.IsGather), grade.isGather],
        ["notScore", source.marker(row.NotScore), grade.notScore],
        ["notComputeAverageScore", source.marker(row.NotComputeAverageScore), grade.notComputeAverageScore],
      ]) compare(recordKey, field, apiValue, dbValue);
    }
    for (const recordKey of dbRows.keys()) if (!apiRows.has(recordKey)) differences.push({ key: recordKey, field: "missing_from_api" });
    const dbSummaries = new Map(summaries.filter((row) => row.studentId === student.id).map((row) => [key(...periodMap.get(row.academicTermId), row.sProgramCode), row]));
    for (const [recordKey, row] of apiSummaries) {
      const summary = dbSummaries.get(recordKey);
      if (!summary) { differences.push({ key: recordKey, field: "missing_system_summary" }); continue; }
      for (const [field, apiField, max] of [["gpa10", "TB_HK_10", 10], ["gpa4", "TB_HK_4", 4], ["cumulativeGpa10", "TB_TL_HK_10", 10], ["cumulativeGpa4", "TB_TL_HK_4", 4], ["creditsEarned", "Dat_HK", Infinity], ["cumulativeCredits", "Dat_TL_HK", Infinity]]) {
        compare(recordKey, field, source.parseNumber(row[apiField], max === Infinity ? -Infinity : 0, max), number(summary[field]));
      }
    }
    for (const recordKey of dbSummaries.keys()) if (!apiSummaries.has(recordKey)) differences.push({ key: recordKey, field: "missing_api_summary" });
    completed++;
    if (completed % 5 === 0 || completed === students.length) console.log(`Compared ${completed}/${students.length} transcripts.`);
    return { studentCode: student.sStudentId, studentName: student.sFullName, classCode: student.sClassStudentId, programCode: student.sStudyProgramId, apiGradeRows: apiRows.size, systemGradeRows: dbRows.size, apiSummaryRows: apiSummaries.size, systemSummaryRows: dbSummaries.size, apiTargetTermRows: apiPeriods.filter((row) => row.year === "2025-2026" && row.term === "HK02").reduce((sum, row) => sum + row.rows, 0), systemTargetTermRows: dbOffers.filter((row) => row.academicTermId === term.id).length, unscopedApiRows: unscoped, apiPeriods, differences };
  });
  // This existing inconsistency is documented in API_DATA_AUDIT_2026-10-06.md.
  // Check the same student's known variants; do not infer their specialization.
  const transferStudent = students.find((student) => student.sStudentId === "2347A052");
  const knownProgramVariants = transferStudent ? await source.mapLimit(["CQ23CT-PM", "CQ23CT-MMT"], 2, async (programCode) => {
    const data = await call("LayBangDiemSinhVien", { p1: transferStudent.sStudentId, p2: programCode, p3: "ALL", p4: "ALL" });
    if (!Array.isArray(data)) throw new Error("Invalid variant transcript");
    const rows = data.flatMap((year) => (year.DanhSachDiem || []).flatMap((term) => (term.DanhSachDiemHK || []).map((row) => ({
      year: clean(year.NamHoc) || clean(row.NamHoc) || clean(row.YearStudy), term: clean(term.HocKy) || clean(term.TermID) || clean(row.HocKy) || clean(row.TermID),
      sourceProgramCode: clean(row.StudyProgramID), courseCode: clean(row.CurriculumID), courseName: clean(row.CurriculumNamePrint) || clean(row.CurriculumName),
      credits: source.parseInteger(row.Credits), notScore: source.marker(row.NotScore), isPass: source.marker(row.IsPass),
      score10: source.scoreParts(row.DiemTK_10, 10).value, score4: source.scoreParts(row.DiemTK_4, 4).value,
    }))));
    return { studentCode: transferStudent.sStudentId, requestedProgramCode: programCode, rows };
  }) : [];
  const output = {
    checkedAt: new Date().toISOString(), period: "HK02 (2025-2026)", sourceEndpoint: "LayBangDiemSinhVien",
    summary: { studentsChecked: results.length, matchingStudents: results.filter((row) => row.differences.length === 0).length, differenceCount: results.reduce((sum, row) => sum + row.differences.length, 0), apiGradeRows: results.reduce((sum, row) => sum + row.apiGradeRows, 0), systemGradeRows: results.reduce((sum, row) => sum + row.systemGradeRows, 0), apiTargetTermRows: results.reduce((sum, row) => sum + row.apiTargetTermRows, 0), systemTargetTermRows: results.reduce((sum, row) => sum + row.systemTargetTermRows, 0) }, students: results, knownProgramVariants,
  };
  const outputPath = path.resolve(__dirname, "../../../docs/reports/source-api-warning-data-audit-HK02-2025-2026.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ summary: output.summary, knownProgramVariants, outputPath }));
}

main().catch((error) => {
  // Do not print API response bodies or authentication information.
  console.error(JSON.stringify({ auditFailed: true, errorType: error.name, networkCode: error.cause?.code || null }));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
