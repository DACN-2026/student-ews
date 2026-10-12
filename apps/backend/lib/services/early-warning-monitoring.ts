import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";
import { studentIdWhere } from "@/lib/utils/is-uuid";
import { courseOutcome, sourcePassOutcome, isConditionalCourse } from "../academic-course-rules";
import { createAcademicWarningCapabilitySnapshot, createQd600StudentCapabilityData } from "./academic-warning-capabilities";
import { evaluateQd600ForCohort } from "./academic-warning-qd600-rules";
import { findEarlyWarningPolicy } from "./early-warning-policy";
import { loadEarlyWarningSources, verifiedRepeatedFailureSource } from "./early-warning-sources";
import { loadAcademicDebt } from "./academic-debt";
import { calculateAcademicWarningProgressSignals } from "./academic-warning-progress";
import { loadAcademicStandingSources } from "./academic-standing";
import { assessAcademicStanding } from "./academic-standing-rules";
import { assertStudentSupportAllowed } from "../student-monitoring-scope";

/** Read-only preview: no runs, grade finalization, official history or intervention writes. */
export async function previewCurrentTermMonitoring(studentId: string) {
  const student = await prisma.student.findFirst({ where: { ...studentIdWhere(studentId), deletedAt: null } });
  if (!student) throw new ApiError("Không tìm thấy sinh viên đang được theo dõi.", "NOT_FOUND", 404);
  await assertStudentSupportAllowed(student.id);
  const terms = await prisma.academicTerm.findMany({ where: { isCurrent: true, sIsSummer: false, deletedAt: null }, take: 2 });
  if (terms.length !== 1) throw new ApiError("Cần cấu hình đúng một học kỳ chính hiện tại để theo dõi trong kỳ.", "CURRENT_MAIN_TERM_UNAVAILABLE", 422);
  const term = terms[0];
  const year = await prisma.academicYear.findUnique({ where: { id: term.academicYearId } });
  const offerings = await prisma.studentCourseOffering.findMany({ where: { studentId: student.id, sProgramCode: student.sStudyProgramId, academicTermId: term.id } });
  const period = { id: term.id, label: `${term.sTermCode} (${year?.sYearCode || ""})` };
  const [{ policy, definition }, studentClass, program, summaries, cumulatives, grades] = await Promise.all([
    findEarlyWarningPolicy(),
    prisma.class.findFirst({ where: { classId: student.sClassStudentId || "", deletedAt: null } }),
    prisma.trainingProgram.findFirst({ where: { sProgramCode: student.sStudyProgramId || "", deletedAt: null, isActive: true } }),
    prisma.studentTermSummary.findMany({ where: { studentId: student.id, sProgramCode: student.sStudyProgramId || "", academicTermId: term.id }, take: 1 }),
    prisma.studentCumulativeSummary.findMany({ where: { studentId: student.id, sProgramCode: student.sStudyProgramId || "", sourceAcademicTermId: term.id }, take: 1 }),
    prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map(offering => offering.id) } } }),
  ]);
  if (!program || !studentClass?.cohortId || !definition.regulatory.applicableCohortIds.includes(studentClass.cohortId)) {
    return { eligible: false, period, note: "Khóa hoặc chương trình chưa thuộc phạm vi chính sách theo dõi đang cấu hình.", capturedAt: new Date().toISOString() };
  }
  const standingSources = await loadAcademicStandingSources([student.id], program.sProgramCode, term.id, studentClass.cohortId);
  const standing = standingSources.get(student.id)!;
  standing.termResultsExpected = false;
  const standingAssessment = assessAcademicStanding(standing);
  if (standingAssessment.excluded) return { eligible: false, period,
    note: standingAssessment.exemption ? `Ngoài phạm vi theo dõi kỳ này theo quyết định ${standingAssessment.exemption.number}: ${standingAssessment.exemption.reason}` : "Kỳ hiện tại trước thời điểm nhập học của khóa.", capturedAt: new Date().toISOString() };
  if (!offerings.some(offering => offering.sCredits > 0) && standingAssessment.absenceEvidence !== "REGISTERED") return { eligible: true, period, provisional: true, businessStatus: "HIGH_RISK", rules: standingAssessment.rules,
    policy: { id: policy.id, name: policy.name, version: policy.version }, registeredCredits: 0, pendingCourses: 0, failedCourses: 0,
    note: "Chưa ghi nhận đăng ký trong kỳ hiện tại. Ưu tiên xác minh với sinh viên và đối chiếu thời hạn đăng ký; chưa kết luận vi phạm học vụ.", capturedAt: new Date().toISOString() };
  const numeric = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const gradeById = new Map(grades.map(grade => [grade.offeringId, grade]));
  const academicOfferings = offerings.filter(offering => !isConditionalCourse(offering.sCurriculumId, offering.sCourseName));
  const attempts = academicOfferings.map(offering => {
    const grade = gradeById.get(offering.id);
    const outcome = grade ? courseOutcome({ ...grade, score10: numeric(grade.score10), score4: numeric(grade.score4) }) : "unknown";
    return { offeringId: offering.id, academicTermId: term.id, credits: offering.sCredits,
      courseCode: offering.sCurriculumId, courseName: offering.sCourseName,
      scoreStatus: grade?.scoreStatus || null, specialCode: grade?.specialCode || null,
      hasFinalGrade: outcome === "passed" || outcome === "failed", isPass: grade?.specialCode?.trim().toUpperCase() === "VT" ? sourcePassOutcome(grade.sourcePayload) : outcome === "passed" ? true : outcome === "failed" ? false : null,
      notScore: grade?.notScore ?? null };
  });
  const [sources, debt, progress] = await Promise.all([
    loadEarlyWarningSources([student.id], program.sProgramCode, term.id),
    loadAcademicDebt([student.id], program.id, term.id),
    calculateAcademicWarningProgressSignals({ students: [{ id: student.id }], cohortId: studentClass.cohortId,
      trainingProgramId: program.id, assessmentTermId: term.id, programCode: program.sProgramCode }),
  ]);
  const summary = summaries[0];
  const evaluated = evaluateQd600ForCohort({ cohortId: studentClass.cohortId, policyDefinition: definition,
    capabilities: createAcademicWarningCapabilitySnapshot({ debtVerified: true }),
    capabilityData: createQd600StudentCapabilityData({ assessmentTermId: term.id, attempts,
      cumulativeCredits: numeric(cumulatives[0]?.cumulativeCredits ?? summary?.cumulativeCredits), isFirstMainSemester: null, debt: debt.get(student.id) }),
    termGpa4: numeric(summary?.gpa4), cumulativeGpa4: numeric(cumulatives[0]?.cumulativeGpa4 ?? summary?.cumulativeGpa4),
    termKind: "MAIN", provisional: true, earlyWarningSources: verifiedRepeatedFailureSource(sources.get(student.id), debt.get(student.id)),
    academicStandingSources: standing,
    trainingProgress: progress.has(student.id) ? { ...progress.get(student.id)!, runId: progress.get(student.id)!.sourceId } : null,
  });
  const rules = evaluated.result?.rules.filter(rule => rule.sourceType !== "REGULATORY") || [];
  const triggered = rules.filter(rule => rule.isNearThreshold || rule.isThresholdBreached);
  const state = triggered.some(rule => rule.riskLevel === "RED") ? "HIGH_RISK" : triggered.length ? "MONITORING" : "NORMAL";
  return { eligible: true, period, provisional: true, businessStatus: state, rules,
    policy: { id: policy.id, name: policy.name, version: policy.version },
    registeredCredits: attempts.reduce((sum, attempt) => sum + attempt.credits, 0),
    pendingCourses: attempts.filter(attempt => !attempt.hasFinalGrade).length,
    failedCourses: attempts.filter(attempt => attempt.isPass === false).length,
    note: "Theo dõi tham khảo bằng dữ liệu hiện có. Điểm chưa công bố không được tính là không đạt; kết quả này không thay thế đánh giá học kỳ đã lưu.",
    capturedAt: new Date().toISOString() };
}
