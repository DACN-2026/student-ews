export function studyTimeline(cohort: string | number | null | undefined, academicYear?: string | null, termCode?: string | null) {
  const cohortNo = typeof cohort === "number" ? cohort : Number(cohort?.match(/K(\d+)/i)?.[1]);
  const year = Number(academicYear?.match(/^(\d{4})/)?.[1]);
  const term = Number(termCode?.match(/(\d+)$/)?.[1]);
  if (!cohortNo || !year || !term) return null;
  const studyYear = Math.max(1, year - (1976 + cohortNo) + 1);
  const semester = (studyYear - 1) * 2 + Math.min(term, 2);
  return { studyYear, semester, isOngoing: semester < 9 };
}
