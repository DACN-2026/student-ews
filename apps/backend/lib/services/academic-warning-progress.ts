import { prisma } from "@/lib/prisma";
import {
  StudentTrainingProgressService,
  type StudentTrainingProgressOutput,
} from "@/lib/services/student-training-progress";

export type AcademicWarningProgressSignal = {
  creditDeficit: number | null;
  dataStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
  reasonCode: string | null;
  sourceId: string;
  expectedCreditsToDate: number | null;
  earnedCreditsToDate: number | null;
  latestCompletedSemester?: number;
  progressStatus?: "ON_TRACK" | "BEHIND" | "UNKNOWN";
  missingRequiredCredits?: number;
  missingRequiredCourses?: Array<{ courseCode: string; courseName: string; credits: number; semesterNo: number }>;
  pendingCourses?: Array<{ courseCode: string; courseName: string; credits: number; context: "IMPROVEMENT" | "RETAKE" | "AWAITING_RESULT" }>;
};

/** Use the visible semester milestone, keeping mandatory debt separate. */
export function academicWarningProgressSignal(
  evaluation: StudentTrainingProgressOutput,
  sourceId: string,
): AcademicWarningProgressSignal {
  const progress = evaluation.scheduleProgress;
  const dueCourses = evaluation.semesters.filter(semester => semester.semesterNo <= progress.latestCompletedSemester)
    .flatMap(semester => semester.courses).filter(course => !course.isConditional);
  const pendingCourses: NonNullable<AcademicWarningProgressSignal["pendingCourses"]> = dueCourses
    .filter(course => course.hasPendingAttempt || course.isCurrentlyStudying || course.status === "NO_SCORE")
    .map(course => ({ courseCode: course.courseCode, courseName: course.courseName, credits: course.credits,
      context: course.confirmedOutcome === "PASSED" || course.status === "PASSED" ? "IMPROVEMENT"
        : course.confirmedOutcome === "FAILED" || course.status === "FAILED" ? "RETAKE" : "AWAITING_RESULT" }));
  const hasUnknownOutcome = dueCourses.some(course => course.attemptCount > 0 && course.status === "NOT_COMPLETED");
  const configurationIncomplete = evaluation.warnings.some((warning) =>
    warning.includes("UNKNOWN_REQUIREMENT") || warning.includes("chưa có danh mục"),
  );
  const progressUnknown = progress.progressStatus === "UNKNOWN";
  return {
    creditDeficit: hasUnknownOutcome || progressUnknown ? null : Math.max(0, -progress.creditDifference),
    dataStatus: configurationIncomplete || progressUnknown || hasUnknownOutcome || pendingCourses.some(course => course.context === "AWAITING_RESULT") ? "PARTIAL" : "COMPLETE",
    reasonCode: progressUnknown || hasUnknownOutcome ? "TRAINING_PROGRESS_EVIDENCE_INSUFFICIENT" : pendingCourses.some(course => course.context === "AWAITING_RESULT")
      ? "TRAINING_PROGRESS_AWAITING_RESULTS"
      : configurationIncomplete ? "TRAINING_PROGRESS_ELECTIVE_CONFIGURATION_PARTIAL" : null,
    sourceId,
    expectedCreditsToDate: progress.expectedCreditsToDate,
    earnedCreditsToDate: progress.earnedCreditsToDate,
    latestCompletedSemester: progress.latestCompletedSemester,
    progressStatus: progress.progressStatus,
    pendingCourses,
    missingRequiredCredits: progress.missingRequiredCredits,
    missingRequiredCourses: progress.missingRequiredCourses.map(({ courseCode, courseName, credits, semesterNo }) =>
      ({ courseCode, courseName, credits, semesterNo })),
  };
}

/** Historical MAIN-term assessment shares the live Training Progress loader. */
export async function calculateAcademicWarningProgressSignals(input: {
  students: Array<{ id: string }>;
  cohortId: string;
  trainingProgramId: string;
  assessmentTermId: string;
  programCode: string;
}) {
  const signals = new Map<string, AcademicWarningProgressSignal>();
  if (!input.students.length) return signals;
  const term = await prisma.academicTerm.findFirst({ where: { id: input.assessmentTermId, deletedAt: null } });
  const year = term && await prisma.academicYear.findFirst({ where: { id: term.academicYearId, deletedAt: null } });
  if (!term || !year) {
    for (const student of input.students) {
      signals.set(student.id, {
        creditDeficit: null,
        dataStatus: "INSUFFICIENT",
        reasonCode: !term ? "ASSESSMENT_TERM_MISSING" : "ASSESSMENT_ACADEMIC_YEAR_MISSING",
        sourceId: input.trainingProgramId,
        expectedCreditsToDate: null,
        earnedCreditsToDate: null,
      });
    }
    return signals;
  }

  // Bound concurrency; the shared service caches curriculum and semester plans.
  for (let offset = 0; offset < input.students.length; offset += 12) {
    await Promise.all(input.students.slice(offset, offset + 12).map(async (student) => {
      const evaluation = await StudentTrainingProgressService.getStudentTrainingProgress(student.id, null, {
        academicYear: year.sYearCode,
        termCode: term.sTermCode,
        termOrder: term.sTermOrder,
      });
      if (evaluation) signals.set(student.id, academicWarningProgressSignal(evaluation, input.trainingProgramId));
    }));
  }
  return signals;
}
