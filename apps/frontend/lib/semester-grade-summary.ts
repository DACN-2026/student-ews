import type { StudentProgressSemesterItem, StudentTrainingProgressData } from "../components/training-progress/types";

export interface StudentTermGradeSummary {
  academicYear?: string | null;
  termCode?: string | null;
  isSummer?: boolean;
  programCode?: string | null;
  gpa10?: number | null;
  gpa4?: number | null;
  cumulativeGpa10?: number | null;
  cumulativeGpa4?: number | null;
}

export function semesterGradeSummary(
  semester: StudentProgressSemesterItem,
  data: StudentTrainingProgressData,
  summaries: StudentTermGradeSummary[],
): StudentTermGradeSummary | undefined {
  const hasAcademicGrades = semester.courses.some((course) =>
    !course.isConditional && course.requirementType !== "conditional" &&
    (course.status === "PASSED" || course.status === "FAILED") &&
    (Number.isFinite(course.latestScore10) || Number.isFinite(course.latestScore4)),
  );
  if (!hasAcademicGrades) return undefined;

  const studyCohort = data.student.studyCohortCode || data.student.cohortCode;
  const cohortNo = Number(studyCohort?.match(/^K(\d+)$/i)?.[1]);
  if (!cohortNo) return undefined;

  // Use the API's confirmed or inferred study schedule, which can differ from
  // the administrative cohort. Retakes do not move the semester's summary.
  const yearStart = 1976 + cohortNo + semester.yearStudy - 1;
  const academicYear = `${yearStart}-${yearStart + 1}`;
  const candidates = summaries.filter((summary) =>
    summary.academicYear === academicYear && !summary.isSummer &&
    Number(summary.termCode?.match(/^(?:HK)?0?([12])$/i)?.[1]) === semester.termNo,
  );

  const programCodes = [data.curriculum.programCode, data.student.programCode]
    .filter((code): code is string => Boolean(code))
    .map((code) => code.trim().toUpperCase());
  return candidates.find((summary) => programCodes.includes(summary.programCode?.trim().toUpperCase() || ""))
    ?? (candidates.length === 1 && (!candidates[0].programCode || !programCodes.length) ? candidates[0] : undefined);
}
