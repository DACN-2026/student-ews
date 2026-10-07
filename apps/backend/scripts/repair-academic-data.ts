import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type TrainingProgressPlan, type TrainingProgressPlanCourse } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { GradesService, type SourceGrade } from "../lib/services/grades";
import { ACADEMIC_RULE_VERSION, isK44StandardProgram } from "../lib/academic-course-rules";
import { academicOfferingPredicate } from "../lib/academic-course-sql";

/** Targeted, additive repair using an audited API snapshot; never truncates data
 * or rewrites evaluation history. Default is a read-only preview. */
async function main() {
  const snapshotArg = process.argv.indexOf("--snapshot");
  if (snapshotArg < 0 || !process.argv[snapshotArg + 1]) throw new Error("Provide --snapshot <audited API snapshot directory>");
  const snapshotDir = path.resolve(process.argv[snapshotArg + 1]);
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(snapshotDir, file), "utf8"));
  const apply = process.argv.includes("--apply");
  const repairs = [
    ["CQ22CT-PM", "20CT3102D"], ["CQ22CT-PM", "TN1008D"],
    ["CQ22CT-PM", "TN1001D"], ["CQ25CT", "25TC1001"],
  ];
  const catalogToRestore: Prisma.CourseCreateManyInput[] = [];
  const curricula: Prisma.TrainingProgramCourseCreateManyInput[] = [];
  for (const [programCode, code] of repairs) {
    const raw = read(`curriculum-${programCode}.json`).payload.body.tbStudyPrograms.find((row: { MaHP: string }) => row.MaHP === code);
    if (!raw || raw.MaCTDT !== programCode || !Number.isInteger(raw.STC)) throw new Error(`Invalid source curriculum ${programCode}/${code}`);
    const [program, existingCourse] = await Promise.all([
      prisma.trainingProgram.findFirst({ where: { sProgramCode: programCode, deletedAt: null } }),
      prisma.course.findFirst({ where: { sCourseCode: code, deletedAt: null } }),
    ]);
    if (!program) throw new Error(`Unresolved program ${programCode}`);
    const course = existingCourse ?? { id: randomUUID(), sCourseCode: code, sCourseName: raw.TenHP };
    if (!existingCourse) catalogToRestore.push(course);
    const existing = await prisma.trainingProgramCourse.findFirst({ where: { trainingProgramId: program.id, courseId: course.id } });
    if (!existing) curricula.push({ trainingProgramId: program.id, courseId: course.id, sSemesterNo: Number(String(raw.HocKy).match(/\d+/)?.[0]), sCredits: raw.STC,
      sRequirementType: raw.BatBuoc === "Bắt Buộc" ? "mandatory" : "elective", sNote: raw.GhiChu || null, sYearStudy: raw.YearStudy || null, sTermId: raw.TermID || null,
      sDepartmentCode: raw.BoMon || null, sFacultyCode: raw.Khoa || null });
  }
  const source = read("grades-2347B017-CQ23CT-PM.json").payload.body;
  const year = source.find((row: { NamHoc: string }) => row.NamHoc === "2023-2024");
  const term = year?.DanhSachDiem.find((row: { HocKy: string }) => row.HocKy === "HK01");
  const grades: SourceGrade[] = term?.DanhSachDiemHK.filter((row: SourceGrade) => /^QP210[1-4]D$/.test(row.CurriculumID) && !(row.StudyUnitID || "").trim() && !(row.ScheduleStudyUnitID || "").trim()) ?? [];
  if (grades.length !== 4 || grades.some((row) => row.StudentID !== "2347B017" || row.StudyProgramID !== "CQ23CT-PM")) throw new Error("GDQP repair source does not match audited scope");
  const gradeInput = [{ NamHoc: "2023-2024", DanhSachDiem: [{ HocKy: "HK01", DanhSachDiemHK: grades }] }];
  const programs = (await prisma.trainingProgram.findMany({ where: { deletedAt: null } })).filter((program) => isK44StandardProgram(program.sProgramCode));
  const thresholds = [["TOTAL_CREDITS", "Tổng tín chỉ học thuật", "150"], ["COMPULSORY_CREDITS", "Tín chỉ bắt buộc", "104"], ["ELECTIVE_CREDITS", "Tín chỉ tự chọn", "46"], ["CUMULATIVE_GPA", "Điểm trung bình tích lũy hệ 4", "2.00"]];
  const rules: Prisma.GraduationRuleCreateManyInput[] = [];
  for (const program of programs) for (const [ruleCode, ruleName, requiredValue] of thresholds) {
    const existing = await prisma.graduationRule.findMany({ where: { trainingProgramId: program.id, cohortId: null, ruleCode, status: "active" } });
    if (existing.length > 1 || existing.some((rule) => Number(rule.requiredValue) !== Number(requiredValue))) throw new Error(`Conflicting configured rule ${program.sProgramCode}/${ruleCode}`);
    if (!existing.length) rules.push({ trainingProgramId: program.id, cohortId: null, ruleCode, ruleName, requiredValue, ruleType: ruleCode === "CUMULATIVE_GPA" ? "GPA" : "CREDIT", operator: ">=", version: ACADEMIC_RULE_VERSION,
      sourceDocument: ruleCode === "CUMULATIVE_GPA" ? "QĐ600, Điều 17; phạm vi CTĐT được người dùng xác nhận" : "2020_CTDT_K44.pdf, chuẩn áp dụng K44 trở đi: 150/104/46, không gồm GDTC/GDQP", status: "active" });
  }
  const alternate = ["CQ23CT-PM", "CQ23CT-MMT"].map((code) => read(`alternate-grades-2347A052-${code}.json`).payload.body);
  const extract = (body: Array<{NamHoc: string; DanhSachDiem: Array<{HocKy: string; DanhSachDiemHK: SourceGrade[]}>}>) => body.flatMap((year) => year.DanhSachDiem.flatMap((term) => term.DanhSachDiemHK.map((grade) => ({year: year.NamHoc, term: term.HocKy, grade}))));
  const left = extract(alternate[0]), right = extract(alternate[1]);
  const identity = (row: typeof left[number]) => `${row.year}|${row.term}|${row.grade.CurriculumID}|${row.grade.StudyUnitID}|${row.grade.ScheduleStudyUnitID || ""}|${row.grade.NotScore}`;
  if (left.length !== 3 || right.length !== 3 || left.some((row) => !right.some((other) => identity(row) === identity(other)) || row.grade.StudentID !== "2347A052" || row.grade.NotScore !== "1")) throw new Error("Ambiguous-program source differs from audited evidence");
  const transfer = await prisma.student.findFirst({ where: { sStudentId: "2347A052", sStudyProgramId: "CQ23CT" } });
  const quarantined = transfer ? await prisma.unscopedGradeRecord.findMany({ where: { studentId: transfer.id, reason: "API_PROGRAM_SCOPE_CONFLICT" }, select: { sCourseCode: true } }) : [];
  const toQuarantine = transfer ? left.filter((row) => !quarantined.some((item) => item.sCourseCode === row.grade.CurriculumID)) : [];
  const physicalPlans = await prisma.trainingProgressPlan.findMany({ where: { isCurrent: true, status: "locked", requiredElectiveCredits: 7, curriculumSemesterNo: 3 } });
  const plansToVersion: Array<{plan: TrainingProgressPlan; rows: TrainingProgressPlanCourse[]; version: number}> = [];
  for (const plan of physicalPlans) {
    const program = programs.find((row) => row.id === plan.trainingProgramId);
    const cohort = await prisma.cohort.findUnique({where:{id:plan.cohortId}});
    if (program?.sProgramCode !== "CQ25CT" || cohort?.sCohortCode !== "K49") continue;
    const rows = await prisma.trainingProgressPlanCourse.findMany({where:{planId:plan.id}});
    if (!rows.some((row)=>row.choiceGroupCode==="GDTC3:1")) throw new Error("Unverified conditional plan minimum");
    const versions=await prisma.trainingProgressPlan.findMany({where:{cohortId:plan.cohortId,trainingProgramId:plan.trainingProgramId,academicTermId:plan.academicTermId},select:{version:true}});
    plansToVersion.push({plan,rows,version:Math.max(...versions.map((row)=>row.version))+1});
  }
  const before = {
    offerings: await prisma.studentCourseOffering.count(), grades: await prisma.studentCourseGrade.count(),
    curricula: await prisma.trainingProgramCourse.count(), rules: await prisma.graduationRule.count(),
    evaluations: await prisma.graduationEvaluation.count(), evaluationStudents: await prisma.graduationEvaluationStudent.count(), warnings: await prisma.academicWarningRun.count(),
  };
  console.log(JSON.stringify({ mode: apply ? "apply" : "preview", curriculaToRestore: curricula.length, rulesToAdd: rules.length, ambiguousRegistrationsToReconcile: toQuarantine.length, academicPlanVersionsToCreate: plansToVersion.length, sourceDefenseParts: grades.map((grade) => grade.CurriculumID), before }));
  if (!apply) return;
  const backupDir = path.join(snapshotDir, "..", "repair-backup");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ before,
    offerings: await prisma.studentCourseOffering.findMany({ where: { sStudentId: "2347B017" } }),
    grades: await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: (await prisma.studentCourseOffering.findMany({ where: { sStudentId: "2347B017" }, select: { id: true } })).map((row) => row.id) } } }),
    termSummaries: await prisma.studentTermSummary.findMany(), cumulativeSummaries: await prisma.studentCumulativeSummary.findMany(),
    planVersions: plansToVersion,
    rules: await prisma.graduationRule.findMany(), curricula: await prisma.trainingProgramCourse.findMany(),
  }, null, 2));
  // The offering identity migration must be deployed before this importer.
  const result = await GradesService.importGrades(gradeInput, `academic-repair-${createHash("sha256").update(JSON.stringify(gradeInput)).digest("hex").slice(0, 32)}`);
  await prisma.$transaction(async (tx) => {
    for (const {plan,rows,version} of plansToVersion) {
      const {id:oldId,createdAt:oldCreated,updatedAt:oldUpdated,...data}=plan;
      await tx.trainingProgressPlan.update({where:{id:oldId},data:{status:"archived",isCurrent:false}});
      const created=await tx.trainingProgressPlan.create({data:{...data,version,requiredElectiveCredits:6,clonedFromPlanId:oldId,clonedFromProgramId:plan.trainingProgramId}});
      await tx.trainingProgressPlanCourse.createMany({data:rows.map(({id,planId,createdAt,...row})=>({...row,planId:created.id}))});
    }
    if (transfer && toQuarantine.length) await tx.unscopedGradeRecord.createMany({ data: toQuarantine.map((row) => ({
      studentId: transfer.id, sStudentId: transfer.sStudentId, sCourseCode: row.grade.CurriculumID,
      sCourseName: row.grade.CurriculumNamePrint || row.grade.CurriculumName || null, sCredits: Number(row.grade.Credits),
      reason: "API_PROGRAM_SCOPE_CONFLICT", sourcePayload: { ...row.grade, YearStudy: row.year, TermID: row.term, reconciliationPrograms: ["CQ23CT-PM", "CQ23CT-MMT"], rosterProgram: "CQ23CT" } as Prisma.InputJsonObject,
    })) });
    if (catalogToRestore.length) await tx.course.createMany({ data: catalogToRestore });
    if (curricula.length) await tx.trainingProgramCourse.createMany({ data: curricula });
    if (rules.length) await tx.graduationRule.createMany({ data: rules });
    await tx.$executeRaw`UPDATE student_term_summaries s SET registered_credits = (
      SELECT COALESCE(SUM(o.s_credits),0) FROM student_course_offerings o
      WHERE o.student_id = s.student_id AND o.academic_term_id = s.academic_term_id
        AND o.s_program_code = s.s_program_code AND ${academicOfferingPredicate}
    ), updated_at = now()`;
    await tx.$executeRaw`UPDATE student_cumulative_summaries s SET cumulative_registered_credits = (
      SELECT COALESCE(SUM(o.s_credits),0) FROM student_course_offerings o
      JOIN academic_years y ON y.id = o.academic_year_id JOIN academic_terms t ON t.id = o.academic_term_id
      JOIN academic_years sy ON sy.id = s.source_academic_year_id JOIN academic_terms st ON st.id = s.source_academic_term_id
      WHERE o.student_id = s.student_id AND o.s_program_code = s.s_program_code
        AND (y.s_year_code < sy.s_year_code OR (y.s_year_code = sy.s_year_code AND t.s_term_order <= st.s_term_order))
        AND ${academicOfferingPredicate}
    ), refreshed_at = now()`;
  });
  console.log(JSON.stringify({ imported: result, after: { offerings: await prisma.studentCourseOffering.count(), grades: await prisma.studentCourseGrade.count(), curricula: await prisma.trainingProgramCourse.count(), rules: await prisma.graduationRule.count(), evaluations: await prisma.graduationEvaluation.count(), evaluationStudents: await prisma.graduationEvaluationStudent.count(), warnings: await prisma.academicWarningRun.count() } }));
}

main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
