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
};

/** Use the visible semester milestone, keeping mandatory debt separate. */
export function academicWarningProgressSignal(
  evaluation: StudentTrainingProgressOutput,
  sourceId: string,
): AcademicWarningProgressSignal {
  const progress = evaluation.scheduleProgress;
  const hasPending = evaluation.semesters.some((semester) => semester.courses.some((course) =>
    !course.isConditional && course.isCurrentlyStudying,
  )) || evaluation.warnings.some((warning) => warning.startsWith("Kết quả học phần"));
  const configurationIncomplete = evaluation.warnings.some((warning) =>
    warning.includes("UNKNOWN_REQUIREMENT") || warning.includes("chưa có danh mục"),
  );
  const progressUnknown = progress.progressStatus === "UNKNOWN";
  return {
    creditDeficit: hasPending || progressUnknown ? null : Math.max(0, -progress.creditDifference),
    dataStatus: configurationIncomplete || progressUnknown || hasPending ? "PARTIAL" : "COMPLETE",
    reasonCode: progressUnknown ? "TRAINING_PROGRESS_EVIDENCE_INSUFFICIENT" : hasPending
      ? "TRAINING_PROGRESS_PENDING_RESULTS"
      : configurationIncomplete ? "TRAINING_PROGRESS_ELECTIVE_CONFIGURATION_PARTIAL" : null,
    sourceId,
    expectedCreditsToDate: progress.expectedCreditsToDate,
    earnedCreditsToDate: progress.earnedCreditsToDate,
    latestCompletedSemester: progress.latestCompletedSemester,
    progressStatus: progress.progressStatus,
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
