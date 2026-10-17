/** Criteria deliberately outside this feature's current scope. Source conduct
 * records and the student profile remain independent of graduation forecasts. */
export function isGraduationCriterionEnabled(code: string) {
  return code !== "WHOLE_COURSE_TRAINING" && code !== "WHOLE_COURSE_TRAINING_CONFIG";
}

export function omitGraduationConduct<T extends object>(record: T) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "wholeCourseTrainingScore" && key !== "trainingStatus")) as Omit<T, "wholeCourseTrainingScore" | "trainingStatus">;
}

export function graduationReasonsWithoutConduct(reasons: unknown) {
  return Array.isArray(reasons) ? reasons.filter(reason => {
    if (!reason || typeof reason !== "object") return true;
    return isGraduationCriterionEnabled(String(reason.code || "")) && !/rèn luyện|whole.course.training/i.test(String(reason.message || ""));
  }) : [];
}

export function graduationSnapshotWithoutConduct(snapshot: Record<string, unknown>) {
  const result = { ...snapshot };
  if (Array.isArray(result.rules)) result.rules = result.rules.filter(rule => isGraduationCriterionEnabled(String(rule?.code || "")));
  if (result.readiness && typeof result.readiness === "object" && !Array.isArray(result.readiness)) {
    result.readiness = Object.fromEntries(Object.entries(result.readiness).filter(([key]) => key !== "missingWholeCourseTraining"));
  }
  return result;
}
