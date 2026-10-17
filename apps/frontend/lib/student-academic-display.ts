export type DisplayGrade = {
  isPass?: boolean | null; isPassed?: boolean | null; scoreStatus?: string | null; notScore?: boolean | null;
  score10?: number | string | null; score4?: number | string | null; specialCode?: string | null;
  letterCode?: string | null; letterGrade?: string | null; isRecognized?: boolean;
};

/** Attendance, pending flags and a confirmed outcome are separate source facts. */
export function displayedCourseOutcome(grade: DisplayGrade): "passed" | "failed" | "pending" | "unknown" {
  const marker = (grade.specialCode || grade.letterCode || grade.letterGrade || "").trim().toUpperCase();
  const pass = grade.isPass ?? grade.isPassed;
  if ((marker === "VT" || grade.isRecognized) && typeof pass === "boolean") return pass ? "passed" : "failed";
  if (grade.notScore === true || grade.scoreStatus === "pending") return "pending";
  if (marker === "VT") return "unknown";
  if (grade.notScore === false && typeof pass === "boolean") return pass ? "passed" : "failed";
  if (grade.scoreStatus === "graded" && pass === true) return "passed";
  if (grade.scoreStatus === "graded" && pass === false && (grade.score10 != null || grade.score4 != null || marker)) return "failed";
  return "unknown";
}

export function courseFailureLabel(grade?: DisplayGrade | null) {
  const marker = (grade?.specialCode || grade?.letterCode || grade?.letterGrade || "").trim().toUpperCase();
  return marker === "VT" ? "Vắng thi (VT) — chưa đạt"
    : marker === "F" ? "Chưa đạt (F)" : "Chưa đạt";
}

export function completionCoursePresentation(course: { passed: boolean; pendingResult: boolean; requirementType: string; isRegistrationRequired: boolean }, isDue: boolean, needsReview = false) {
  if (course.passed) return { tone: "passed", label: "Đã tích lũy" };
  if (needsReview) return { tone: "neutral", label: "Chưa kết luận" };
  if (!isDue) return { tone: "neutral", label: "Chưa đến hạn" };
  if (course.pendingResult) return { tone: "pending", label: "Chờ kết quả" };
  if (course.requirementType === "elective" && !course.isRegistrationRequired) return { tone: "neutral", label: "Môn lựa chọn — chưa tích lũy" };
  return { tone: "required", label: "Chưa hoàn thành yêu cầu" };
}

export function latestTermWithGpa<T extends { gpa4?: number | null; gpa10?: number | null; programCode?: string | null }>(terms: T[], programCode?: string | null): T | undefined {
  // The API supplies chronological order; never call an ungraded term a result.
  return terms.filter(term => (!programCode || term.programCode === programCode) && (term.gpa4 != null || term.gpa10 != null)).at(-1);
}
