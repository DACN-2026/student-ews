/** Incremental repair: --apply changes derived status only and records a source audit. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeGrade } from "./audit-warning-source-quality.cjs";
import { isConditionalCourse } from "../lib/academic-course-rules";
import { loadAcademicDebt } from "../lib/services/academic-debt";
import { calculateAcademicWarningProgressSignals } from "../lib/services/academic-warning-progress";
import { AcademicWarningAutomationService } from "../lib/services/academic-warning-automation";
import { AcademicWarningsService } from "../lib/services/academic-warnings";
import { findEarlyWarningPolicy } from "../lib/services/early-warning-policy";
import { loadAcademicStandingSources } from "../lib/services/academic-standing";
import { assessAcademicStanding } from "../lib/services/academic-standing-rules";
import type { SourceQualityIssue } from "../lib/services/academic-source-quality";

type Row = { year: string; term: string; program: string; courseCode: string; credits: number; unit: string; schedule: string; raw: Record<string, unknown> };
type SourceStudent = { studentId: string; studentCode: string; studentName: string; classCode: string; programCode: string; active: boolean;
  rows: Row[]; sourceUnscoped: Record<string, unknown>[]; classHk2: { gpa4: unknown; credits: unknown } | null;
  differences: Array<{ field: string; api?: unknown; system?: unknown }>; decisionDifferences: unknown[] };
const numeric = (value: unknown) => value == null || String(value).trim() === "" || !Number.isFinite(Number(value)) ? null : Number(value);

async function main() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const snapshotFile = process.argv.find(arg => arg.startsWith("--snapshot="))?.slice(11) || path.resolve(__dirname, `../../../.tmp/warning-source-quality-snapshot-${day}.json`);
  const bytes = fs.readFileSync(snapshotFile);
  const sourceHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const snapshot = JSON.parse(bytes.toString("utf8")) as { summary: { checkedAt: string; students: number }; students: SourceStudent[] };
  if (!Array.isArray(snapshot.students) || snapshot.students.length !== snapshot.summary.students || snapshot.students.length < 600
    || !Number.isFinite(Date.parse(snapshot.summary.checkedAt)) || Math.abs(Date.now() - Date.parse(snapshot.summary.checkedAt)) > 86_400_000) throw new Error("A complete successful live audit less than 24 hours old is required");
  if (snapshot.students.some(student => student.decisionDifferences.length || student.differences.some(row => row.field !== "scoreStatus" || row.api !== "unknown" || row.system !== "graded"))) throw new Error("Source differences require reconciliation before incremental repair");
  const term = (await AcademicWarningsService.resolveRunAssessmentTerm({})).assessmentTerm;
  const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: term.academicYearId } });
  if (year.sYearCode !== "2025-2026" || term.sTermCode !== "HK02") throw new Error("This repair requires the audited HKII 2025-2026 assessment period");
  const [students, offerings, grades, terms, years, classes] = await Promise.all([
    prisma.student.findMany({ where: { deletedAt: null } }), prisma.studentCourseOffering.findMany(), prisma.studentCourseGrade.findMany(),
    prisma.academicTerm.findMany(), prisma.academicYear.findMany(), prisma.class.findMany({ where: { deletedAt: null } }),
  ]);
  if (students.length !== snapshot.students.length || students.some(student => !snapshot.students.some(source => source.studentId === student.id && source.studentCode === student.sStudentId && source.programCode === student.sStudyProgramId && source.active === student.sIsInClass))) throw new Error("Student scope changed after the audit; fetch sources again");
  const yearsById = new Map(years.map(row => [row.id, row.sYearCode]));
  const periodById = new Map(terms.map(row => [row.id, [yearsById.get(row.academicYearId), row.sTermCode]]));
  const key = (...values: unknown[]) => JSON.stringify(values);
  const offeringByKey = new Map(offerings.map(row => [key(row.studentId, ...periodById.get(row.academicTermId)!, row.sCurriculumId, row.sStudyUnitId, row.sScheduleStudyUnitId), row]));
  const gradeByOffering = new Map(grades.map(row => [row.offeringId, row]));
  const changes: Array<{ offeringId: string; studentCode: string; courseCode: string; from: string; to: string; updatedAt: Date }> = [];
  for (const student of snapshot.students) for (const row of student.rows) {
    const offering = offeringByKey.get(key(student.studentId, row.year, row.term, row.courseCode, row.unit, row.schedule));
    const grade = offering && gradeByOffering.get(offering.id);
    if (!offering || !grade || offering.sProgramCode !== row.program || offering.sCredits !== row.credits) throw new Error("Offering scope changed; a fresh audit is required");
    const normalized = normalizeGrade(row.raw);
    for (const [field, value] of Object.entries(normalized)) {
      if (field === "scoreStatus") continue;
      const current = grade[field as keyof typeof grade];
      if (value !== (["score10", "score4"].includes(field) ? numeric(current) : current)) throw new Error("Grade evidence changed; a fresh audit is required");
    }
    if (grade.scoreStatus !== normalized.scoreStatus) {
      if (grade.scoreStatus !== "graded" || normalized.scoreStatus !== "unknown") throw new Error("Unexpected status difference; manual reconciliation is required");
      changes.push({ offeringId: offering.id, studentCode: student.studentCode, courseCode: row.courseCode, from: grade.scoreStatus, to: normalized.scoreStatus, updatedAt: grade.updatedAt });
    }
  }
  const { definition } = await findEarlyWarningPolicy();
  const scopes = await AcademicWarningAutomationService.evaluationScopes(definition.regulatory.applicableCohortIds);
  const debts = new Map<string, Awaited<ReturnType<typeof loadAcademicDebt>> extends Map<string, infer V> ? V : never>();
  const progress = new Map<string, Awaited<ReturnType<typeof calculateAcademicWarningProgressSignals>> extends Map<string, infer V> ? V : never>();
  const standing = new Map<string, ReturnType<typeof assessAcademicStanding>>();
  for (const scope of scopes) {
    const classCodes = new Set(classes.filter(row => row.cohortId === scope.cohortId).map(row => row.classId));
    const members = students.filter(row => row.sIsInClass && row.sStudyProgramId === scope.programCode && classCodes.has(row.sClassStudentId || ""));
    const ids = members.map(row => row.id);
    const standingRows = await loadAcademicStandingSources(ids, scope.programCode, term.id, scope.cohortId);
    for (const [id, row] of standingRows) standing.set(id, assessAcademicStanding(row));
    const eligibleIds = ids.filter(id => !standing.get(id)?.excluded);
    const [debtRows, progressRows] = await Promise.all([loadAcademicDebt(eligibleIds, scope.trainingProgramId, term.id),
      calculateAcademicWarningProgressSignals({ students: eligibleIds.map(id => ({ id })), cohortId: scope.cohortId, trainingProgramId: scope.trainingProgramId, assessmentTermId: term.id, programCode: scope.programCode })]);
    for (const [id, row] of debtRows) debts.set(id, row);
    for (const [id, row] of progressRows) progress.set(id, row);
  }
  const quality = snapshot.students.map(student => {
    const issues: SourceQualityIssue[] = [];
    const add = (code: string, summary: string, blocking: boolean, evidence: Record<string, unknown>) => issues.push({ code, summary, blocking, evidence });
    const target = student.rows.filter(row => row.year === year.sYearCode && row.term === term.sTermCode && row.program === student.programCode);
    const academic = target.filter(row => !isConditionalCourse(row.courseCode, String(row.raw.CurriculumName || "")));
    const historicalRows = student.rows.filter(row => row.year < year.sYearCode || row.year === year.sYearCode && Number(row.term.slice(-1)) <= term.sTermOrder);
    const exempt = standing.get(student.studentId)?.excluded;
    if (!target.length && exempt) add("TERM_OUTSIDE_MONITORING", "Kỳ xét được loại khỏi phân tích theo quyết định hợp lệ. Vắng dữ liệu kỳ này không tự tạo cảnh báo bổ sung.", false, { exemption: standing.get(student.studentId)?.exemption });
    else if (!target.length && student.active) add("MISSING_TERM_SOURCE", "API bảng điểm cá nhân chưa có kỳ xét đúng chương trình. Chưa đủ căn cứ kết luận sinh viên không đăng ký; cần đối chiếu hồ sơ và quyết định nghỉ.", true, { endpoint: "LayBangDiemSinhVien", targetRows: 0 });
    if (!academic.length && target.length) add("NO_ACADEMIC_COURSES", "Kỳ này chỉ có học phần điều kiện hoặc SHCD; chưa có học phần học thuật để đối chiếu GPA. SHCD 0 tín chỉ không chứng minh đã đăng ký học phần.", true, { courses: target.map(row => ({ courseCode: row.courseCode, credits: row.credits })) });
    if (target.length && numeric(target[0].raw.TB_HK_4) == null) {
      const absent = academic.filter(row => normalizeGrade(row.raw).specialCode === "VT");
      add("OFFICIAL_GPA_UNAVAILABLE", absent.length ? "Nguồn chưa có GPA hệ 4, nhưng có kết quả VT. Giữ GPA trống; VT vẫn được tính là không đạt trong tín chỉ học phần." : "Nguồn chưa có GPA chính thức; không tự gán 0 hoặc dùng điểm lớp để lấp.", false,
        { vtCourses: absent.map(row => row.courseCode), academicCourses: academic.length });
    }
    if (!academic.length && numeric(student.classHk2?.gpa4) != null) add("SOURCE_PERIOD_CONFLICT", "Bảng điểm lớp có GPA HKII nhưng bảng điểm cá nhân chưa có học phần HKII. Cần xác minh kỳ điểm; không tự chuyển điểm HKIII sang HKII.", true,
        { classGpa4: numeric(student.classHk2?.gpa4), classCredits: numeric(student.classHk2?.credits), personalPeriods: [...new Set(student.rows.filter(row => row.year === year.sYearCode).map(row => row.term))] });
    const unscopedAcademic = student.sourceUnscoped.filter(row => !isConditionalCourse(String(row.CurriculumID || ""), String(row.CurriculumName || "")));
    if (unscopedAcademic.length) add("UNSCOPED_ACADEMIC_HISTORY", "Có kết quả học thuật chưa xác định được năm/kỳ; chưa dùng vào phép tính theo mốc kỳ. Cần đối chiếu hồ sơ công nhận hoặc phạm vi chương trình.", true,
      { courseCodes: unscopedAcademic.map(row => row.CurriculumID) });
    const debt = debts.get(student.studentId);
    if (debt && debt.dataStatus !== "COMPLETE") add("INCOMPLETE_ACADEMIC_DEBT", "Lịch sử nợ học tập còn chưa đầy đủ: kết quả trống hoặc mã môn chưa khớp CTĐT. Chưa dùng số nợ một phần để kết luận theo ngưỡng.", true,
      { reason: debt.reasonCode, knownDebtCredits: debt.accumulatedDebtCredits, unknownOrUnmatchedCourses: historicalRows.filter(row => !isConditionalCourse(row.courseCode, String(row.raw.CurriculumName || "")) &&
        ["unknown", "pending"].includes(normalizeGrade(row.raw).scoreStatus) || row.courseCode === "TN1008D").map(row => ({ courseCode: row.courseCode, year: row.year, term: row.term })) });
    const progressRow = progress.get(student.studentId);
    if (progressRow && progressRow.dataStatus !== "COMPLETE") add("INCOMPLETE_ACADEMIC_PROGRESS", "Tiến độ học thuật còn kết quả hoặc cấu hình cần xác minh; giữ riêng số liệu đã biết và phần chưa đủ căn cứ.", true, { reason: progressRow.reasonCode });
    return { studentId: student.studentId, studentCode: student.studentCode, programCode: student.programCode, issues };
  });
  const plan = { sourceHash, checkedAt: snapshot.summary.checkedAt, gradeStatusChanges: changes.map(({ updatedAt, ...row }) => row),
    auditedStudents: quality.length, studentsWithIssues: quality.filter(row => row.issues.length).length, issueCounts: quality.flatMap(row => row.issues).reduce<Record<string, number>>((counts, row) => { counts[row.code] = (counts[row.code] || 0) + 1; return counts; }, {}), apply: process.argv.includes("--apply") };
  const reportPath = path.resolve(__dirname, `../../../docs/reports/warning-source-repair-${day}.json`);
  if (!plan.apply) {
    fs.writeFileSync(reportPath.replace(/\.json$/, "-plan.json"), JSON.stringify({ ...plan, students: quality.filter(row => row.issues.length) }, null, 2) + "\n");
    console.log(JSON.stringify(plan)); return;
  }
  const previous = await prisma.auditLog.findFirst({ where: { action: "academic_warning.source.audit", resourceType: "AcademicTerm", resourceId: term.id }, orderBy: { createdAt: "desc" } });
  const previousDetails = previous?.details as Record<string, unknown> | null;
  if (!changes.length && previousDetails?.sourceHash === sourceHash) { console.log(JSON.stringify({ ...plan, alreadyApplied: true })); return; }
  const audits = await prisma.$transaction(async tx => {
    for (const row of changes) {
      const changed = await tx.studentCourseGrade.updateMany({ where: { offeringId: row.offeringId, scoreStatus: row.from, updatedAt: row.updatedAt }, data: { scoreStatus: row.to } });
      if (changed.count !== 1) throw new Error("Grade changed during repair; transaction rolled back");
    }
    const audit = await tx.auditLog.create({ data: { action: "academic_warning.source.audit", resourceType: "AcademicTerm", resourceId: term.id,
      details: { schemaVersion: 1, checkedAt: plan.checkedAt, sourceHash, sourceDocument: "https://kg8vuz7mh4.apidog.io/llms.txt", students: quality } as Prisma.InputJsonValue } });
    const repair = await tx.auditLog.create({ data: { action: "academic_warning.source.repair", resourceType: "AcademicTerm", resourceId: term.id,
      details: plan as Prisma.InputJsonValue } });
    return { sourceAuditId: audit.id, repairAuditId: repair.id };
  });
  const applied = { ...plan, applied: true, appliedAt: new Date().toISOString(), ...audits };
  fs.writeFileSync(reportPath, JSON.stringify({ ...applied, students: quality.filter(row => row.issues.length) }, null, 2) + "\n");
  console.log(JSON.stringify(applied));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Source repair failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
