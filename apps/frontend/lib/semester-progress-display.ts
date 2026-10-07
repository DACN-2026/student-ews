import type { StudentProgressSemesterItem } from "../components/training-progress/types";

/** Keep every existing semester badge consistent with the API's assessment.
 * A failed elective remains in the transcript but need not leave a semester
 * incomplete after another permitted option has satisfied its requirement. */
export function semesterProgressDisplay(semester: StudentProgressSemesterItem) {
  const plannedCredits = semester.plannedCredits ?? semester.requiredCredits ?? 0;
  const plannedCreditsLabel = semester.plannedCredits === null ? "—" : plannedCredits;
  const missingMandatoryCredits = semester.courses
    .filter((course) => !course.isConditional && course.requirementType === "mandatory" && course.status !== "PASSED")
    .reduce((sum, course) => sum + course.credits, 0);
  const remainingCredits = Math.max(0, semester.remainingCredits ?? 0, plannedCredits - semester.completedCredits, missingMandatoryCredits);
  const isCompleted = semester.plannedCredits !== null && semester.status !== "UNKNOWN" && semester.status !== "INCOMPLETE" && semester.courses.length > 0 && remainingCredits === 0;
  const label = semester.status === "UNKNOWN" ? "Cần đối soát"
    : isCompleted ? (semester.statusLabel || "Đạt kỳ")
    : missingMandatoryCredits > 0 ? "Nợ môn bắt buộc"
    : remainingCredits > 0 ? `Thiếu ${remainingCredits} TC tự chọn`
    : "Cần đối soát";
  return { plannedCredits, plannedCreditsLabel, remainingCredits, isCompleted, label };
}

/** Sum the left/right semester credit figures only through the assessment milestone. */
export function semesterMilestoneCredits(semesters: StudentProgressSemesterItem[], latestSemester: number) {
  const pastSemesters = semesters.filter((semester) => semester.semesterNo <= latestSemester);
  const expectedCreditsToDate = pastSemesters.reduce((sum, semester) => sum + semesterProgressDisplay(semester).plannedCredits, 0);
  const earnedCreditsToDate = pastSemesters.reduce((sum, semester) => sum + semester.completedCredits, 0);
  return { expectedCreditsToDate, earnedCreditsToDate, creditDifference: earnedCreditsToDate - expectedCreditsToDate };
}
