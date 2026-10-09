import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/auth/types";
import { ApiError } from "@/lib/utils/api-error";
import { courseOutcome, isConditionalCourse } from "@/lib/academic-course-rules";
import { InterventionCasesService } from "./intervention-cases";
import { StudentTrainingProgressService } from "./student-training-progress";
import { academicWarningProgressSignal } from "./academic-warning-progress";
import { loadAcademicDebt, type AcademicDebtCalculation } from "./academic-debt";
import { calculateAssessmentTermFailedCredits } from "./academic-warning-capabilities";
import { GraduationEvaluationsService } from "./graduation-evaluations";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function evidenceNumber(value: unknown): number | null {
  if (value == null || (typeof value === "string" && value.trim() === "") || typeof value === "boolean" || Array.isArray(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function compareWarningEvidence(recorded: number | null, current: number | null, complete = true) {
  if (!complete || recorded == null || current == null) return "UNAVAILABLE" as const;
  return Math.abs(recorded - current) < 0.00001 ? "MATCHED" as const : "CHANGED" as const;
}
function sameCodes(left: unknown, right: string[]) {
  return Array.isArray(left) && JSON.stringify(left.map(String).sort()) === JSON.stringify([...right].sort());
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical).sort());
  if (value && typeof value === "object") return JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return JSON.stringify(value) ?? "undefined";
}
export function sameDebtEvidence(recorded: Record<string, unknown>, current: Partial<AcademicDebtCalculation>) {
  return sameCodes(recorded.outstandingCourses, current.outstandingCourses || [])
    && ["electiveSelections", "replacements"].every((key) => canonical(recorded[key]) === canonical(current[key as keyof AcademicDebtCalculation]));
}

/** Keep the recorded warning intact; verify current sources at its assessment cutoff. */
export class AcademicWarningEvidenceService {
  static async getForCase(caseId: string, actor: Actor, expectedResultId?: string | null) {
    // Authorize the case before reading any student grades or supporting results.
    const detail = await InterventionCasesService.getDetail(caseId, actor);
    const resultId = expectedResultId || detail.currentWarning?.resultId;
    if (!resultId) throw new ApiError("No warning result available", "NOT_FOUND", 404);
    const result = await prisma.academicWarningStudentResult.findUnique({ where: { id: resultId } });
    if (!result || result.studentId !== detail.case.student.id) throw new ApiError("Warning result not found for this case", "NOT_FOUND", 404);
    const run = await prisma.academicWarningRun.findUniqueOrThrow({ where: { id: result.runId } });
    const term = await prisma.academicTerm.findUniqueOrThrow({ where: { id: run.assessmentAcademicTermId } });
    const year = await prisma.academicYear.findUniqueOrThrow({ where: { id: term.academicYearId } });
    const snapshot = object(run.sourceSnapshot);
    const studentSnapshot = Array.isArray(snapshot.students) ? object(snapshot.students.find((student) => object(student).id === result.studentId)) : {};
    const capability = object(studentSnapshot.qd600CapabilityData);
    const recordedProgress = object(capability.trainingProgress);
    const recordedDebt = object(capability.accumulatedDebtCreditCalculation);
    const recordedFailed = object(capability.failedCreditCalculation);
    const context = { academicYear: year.sYearCode, termCode: term.sTermCode, termOrder: term.sTermOrder };
    const reads = await Promise.allSettled([
      StudentTrainingProgressService.getStudentTrainingProgress(result.studentId, null, context),
      loadAcademicDebt([result.studentId], run.trainingProgramId, term.id),
      prisma.studentTermSummary.findFirst({ where: { studentId: result.studentId, academicTermId: term.id, sProgramCode: result.sProgramCode || "" } }),
      prisma.studentCourseOffering.findMany({ where: { studentId: result.studentId, academicTermId: term.id }, orderBy: { sCurriculumId: "asc" } }),
      prisma.graduationEvaluationStudent.findFirst({ where: { studentId: result.studentId, sProgramCode: result.sProgramCode }, orderBy: { evaluatedAt: "desc" } }),
    ] as const);
    const progress = reads[0].status === "fulfilled" ? reads[0].value : null;
    const debt = reads[1].status === "fulfilled" ? reads[1].value.get(result.studentId) ?? null : null;
    const summary = reads[2].status === "fulfilled" ? reads[2].value : null;
    const offerings = reads[3].status === "fulfilled" ? reads[3].value : [];
    const graduationRow = reads[4].status === "fulfilled" ? reads[4].value : null;
    const unavailableSources = reads.flatMap((read, index) => read.status === "rejected" ? [["Tiến độ học tập", "Nợ tín chỉ", "GPA học kỳ", "Bảng điểm học kỳ", "Dự kiến tốt nghiệp"][index]] : []);
    const grades = offerings.length ? await prisma.studentCourseGrade.findMany({ where: { offeringId: { in: offerings.map((offering) => offering.id) } } }) : [];
    const gradesById = new Map(grades.map((grade) => [grade.offeringId, grade]));
    const failed = calculateAssessmentTermFailedCredits(term.id, offerings.map((offering) => {
      const grade = gradesById.get(offering.id);
      return { offeringId: offering.id, academicTermId: term.id, credits: offering.sCredits, courseCode: offering.sCurriculumId, courseName: offering.sCourseName,
        scoreStatus: grade?.scoreStatus ?? null, hasFinalGrade: grade?.scoreStatus === "graded", isPass: grade?.isPass ?? null, specialCode: grade?.specialCode };
    }));
    const progressSignal = progress ? academicWarningProgressSignal(progress, run.trainingProgramId) : null;
    const sameProgram = progress?.curriculum.programCode === result.sProgramCode;
    const checks: Array<{ key: string; label: string; status: "MATCHED" | "CHANGED" | "UNAVAILABLE"; recorded: number | null; current: number | null }> = [];
    const reasons = await prisma.academicWarningReason.findMany({ where: { studentResultId: result.id } });
    const ruleCodes = reasons.map((reason) => String(object(reason.details).ruleCode || reason.reasonCode));
    const addCheck = (key: string, label: string, recorded: unknown, current: unknown, complete = true, sameDetails = true) => {
      const storedValue = evidenceNumber(recorded), currentValue = evidenceNumber(current);
      const numericStatus = compareWarningEvidence(storedValue, currentValue, complete);
      checks.push({ key, label, recorded: storedValue, current: currentValue, status: numericStatus === "MATCHED" && !sameDetails ? "CHANGED" : numericStatus });
    };
    if (ruleCodes.some((code) => code.includes("TERM_GPA"))) addCheck("termGpa", "GPA học kỳ (hệ 4)", result.termGpa4, summary?.gpa4);
    if (ruleCodes.some((code) => code.includes("CUMULATIVE_GPA"))) addCheck("cumulativeGpa", "GPA tích lũy (hệ 4)", result.cumulativeGpa4, summary?.cumulativeGpa4);
    if (ruleCodes.some((code) => code.includes("FAILED_CREDIT_RATIO"))) addCheck("failedRatio", "Tỷ lệ tín chỉ không đạt", recordedFailed.failedCreditRatio, failed.failedCreditRatio, recordedFailed.dataStatus === "COMPLETE" && failed.dataStatus === "COMPLETE",
      evidenceNumber(recordedFailed.registeredCredits) === failed.registeredCredits && evidenceNumber(recordedFailed.failedCredits) === failed.failedCredits);
    if (ruleCodes.some((code) => code.includes("ACCUMULATED_DEBT"))) addCheck("debt", "Nợ tín chỉ còn lại", recordedDebt.accumulatedDebtCredits, debt?.accumulatedDebtCredits,
      recordedDebt.dataStatus === "COMPLETE" && debt?.dataStatus === "COMPLETE", sameDebtEvidence(recordedDebt, debt || {}));
    if (ruleCodes.some((code) => code.includes("PROGRESS"))) {
      const recordedMissing = Array.isArray(recordedProgress.missingRequiredCourses) ? recordedProgress.missingRequiredCourses.map((course) => String(object(course).courseCode)) : null;
      addCheck("progress", "Thiếu so với lộ trình học kỳ", recordedProgress.creditDeficit, progressSignal?.creditDeficit, recordedProgress.dataStatus === "COMPLETE" && sameProgram && progressSignal?.dataStatus === "COMPLETE",
        evidenceNumber(recordedProgress.expectedCreditsToDate) === progressSignal?.expectedCreditsToDate && evidenceNumber(recordedProgress.earnedCreditsToDate) === progressSignal?.earnedCreditsToDate
        && sameCodes(recordedMissing, progressSignal?.missingRequiredCourses?.map((course) => course.courseCode) || []));
    }
    let graduation = null;
    if (graduationRow) {
      try {
        const [evaluation, output] = await Promise.all([
          prisma.graduationEvaluation.findUniqueOrThrow({ where: { id: graduationRow.evaluationId } }),
          GraduationEvaluationsService.getStudent(graduationRow.evaluationId, result.studentId),
        ]);
        const graduationTerm = await prisma.academicTerm.findUniqueOrThrow({ where: { id: evaluation.assessmentAcademicTermId } });
        const graduationYear = await prisma.academicYear.findUniqueOrThrow({ where: { id: graduationTerm.academicYearId } });
        if (output) graduation = { evaluationId: evaluation.id, academicYear: graduationYear.sYearCode, termCode: graduationTerm.sTermCode, capturedAt: evaluation.sourceCapturedAt?.toISOString() ?? graduationRow.evaluatedAt.toISOString(),
          sameAssessment: graduationTerm.id === term.id, summary: output.forecast.summary, electiveMissingCredits: output.forecast.requirements.electives.remainingCredits,
          missingRequiredCourses: output.forecast.missingRequiredCourses.map((course) => ({ courseCode: course.courseCode, courseName: course.courseName, credits: course.credits, semesterNo: course.semesterNo })) };
      } catch { unavailableSources.push("Dự kiến tốt nghiệp"); }
    } else if (reads[4].status === "fulfilled") {
      unavailableSources.push("Dự kiến tốt nghiệp (chưa có đợt đánh giá)");
    }
    return {
      context: { resultId: result.id, academicYear: year.sYearCode, termCode: term.sTermCode, programCode: result.sProgramCode, capturedAt: run.sourceCapturedAt?.toISOString() ?? result.createdAt.toISOString(), checkedAt: new Date().toISOString() },
      checks, unavailableSources,
      courseNames: Object.fromEntries(progress?.semesters.flatMap((semester) => semester.courses.map((course) => [course.courseCode, course.courseName])) || []),
      debt: evidenceNumber(recordedDebt.accumulatedDebtCredits) == null ? null : recordedDebt as Partial<AcademicDebtCalculation>,
      term: { gpa4: evidenceNumber(summary?.gpa4), cumulativeGpa4: evidenceNumber(summary?.cumulativeGpa4), registeredCredits: failed.dataStatus === "COMPLETE" ? failed.registeredCredits : null, failedCredits: failed.dataStatus === "COMPLETE" ? failed.failedCredits : null,
        courses: offerings.filter((offering) => !isConditionalCourse(offering.sCurriculumId, offering.sCourseName)).map((offering) => {
          const grade = gradesById.get(offering.id);
          const outcome = grade ? courseOutcome({ ...grade, score10: evidenceNumber(grade.score10), score4: evidenceNumber(grade.score4) }) : "unknown";
          return { id: offering.id, courseCode: offering.sCurriculumId, courseName: offering.sCourseName, credits: offering.sCredits, score4: evidenceNumber(grade?.score4), score10: evidenceNumber(grade?.score10), letter: grade?.specialCode || grade?.letterCode || null,
            status: outcome === "passed" ? "PASSED" : outcome === "failed" ? "FAILED" : outcome === "pending" ? "PENDING" : "UNKNOWN", excludedFromGpa: grade?.notComputeAverageScore ?? false };
        }) },
      progress: progress && sameProgram ? { latestSemester: progress.scheduleProgress.latestCompletedSemester, expectedCredits: progress.scheduleProgress.expectedCreditsToDate, earnedCredits: progress.scheduleProgress.earnedCreditsToDate,
        electiveMissingCredits: Math.max(0, progress.scheduleProgress.expectedElectiveCredits - progress.scheduleProgress.earnedElectiveCredits),
        missingRequiredCourses: progress.scheduleProgress.missingRequiredCourses.map((course) => ({ courseCode: course.courseCode, courseName: course.courseName, credits: course.credits, semesterNo: course.semesterNo, status: course.status, letter: course.latestLetterCode ?? null })),
        semesters: progress.semesters.filter((semester) => semester.semesterNo <= progress.scheduleProgress.latestCompletedSemester).map((semester) => ({ semesterNo: semester.semesterNo, plannedCredits: semester.plannedCredits ?? null, earnedCredits: semester.completedCredits,
          mandatoryCredits: semester.mandatoryCredits ?? null, electivePlannedCredits: semester.electivePlannedCredits ?? null,
          courses: semester.courses.filter((course) => !course.isConditional).map((course) => ({ courseCode: course.courseCode, courseName: course.courseName, credits: course.credits, status: course.status, requirementType: course.requirementType,
            score10: course.latestScore10 ?? null, score4: course.latestScore4 ?? null, letter: course.latestLetterCode ?? null, attemptCount: course.attemptCount,
            passedAcademicYear: course.passedAcademicYear ?? null, passedTermCode: course.passedTermCode ?? null })) })) } : null,
      graduation,
    };
  }
}
