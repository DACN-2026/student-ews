import assert from "node:assert/strict";
import test from "node:test";
import { semesterGradeSummary, type StudentTermGradeSummary } from "../../frontend/lib/semester-grade-summary";
import type { StudentProgressSemesterItem, StudentTrainingProgressData } from "../../frontend/components/training-progress/types";

const semester = (no: number, status: "PASSED" | "FAILED" | "NO_SCORE" | "NOT_COMPLETED" = "PASSED"): StudentProgressSemesterItem => ({
  semesterNo: no, yearStudy: Math.ceil(no / 2), termNo: no % 2 ? 1 : 2, name: `HK${no}`,
  requiredCredits: 3, completedCredits: status === "PASSED" ? 3 : 0,
  courses: [{
    courseId: `c${no}`, courseCode: `C${no}`, courseName: "Academic", semesterNo: no, credits: 3, requirementType: "mandatory",
    status, attemptCount: status === "NOT_COMPLETED" ? 0 : 1,
    latestScore10: status === "PASSED" ? 8.5 : status === "FAILED" ? 0 : null,
    latestScore4: status === "PASSED" ? 4 : status === "FAILED" ? 0 : null,
  }],
});
const data: StudentTrainingProgressData = {
  student: { id: "s", studentCode: "s", fullName: "Test", cohortCode: "K46", studyCohortCode: "K47", programCode: "CQ22CT-PM" },
  curriculum: { programCode: "CQ22CT-PM", totalCourses: 9 }, summary: { requiredCredits: null, completedCredits: 0 },
  scheduleProgress: { currentAcademicYear: "2026-2027", currentTermCode: "HK01", expectedSemesterNo: 7, isOnTrack: true, isBehind: false, isAhead: false },
  semesters: [], courseStatus: { passed: [], failed: [], noScore: [], notCompleted: [], pastDue: [], future: [], unmatched: [] }, electiveGroups: [], warnings: [],
};
const summary = (academicYear: string, termCode: string, gpa10: number | null, gpa4: number | null): StudentTermGradeSummary => ({
  academicYear, termCode, programCode: "CQ22CT-PM", gpa10, gpa4, cumulativeGpa10: gpa10, cumulativeGpa4: gpa4,
});

test("delayed K46 student matches first, second and sixth semesters to the K47 study schedule", () => {
  const first = summary("2023-2024", "HK01", 7.86, 3.38);
  const second = summary("2023-2024", "HK02", 8.47, 3.32);
  const sixth = { ...summary("2025-2026", "HK02", 7.69, 3.32), cumulativeGpa10: 7.73, cumulativeGpa4: 3.12 };
  const summaries = [summary("2022-2023", "HK01", 0, 0), first, second, summary("2024-2025", "HK02", 7.65, 2.95), sixth];
  assert.equal(semesterGradeSummary(semester(1), data, summaries), first);
  assert.equal(semesterGradeSummary(semester(2), data, summaries), second);
  assert.equal(semesterGradeSummary(semester(6), data, summaries), sixth);
});

test("ongoing and unregistered semesters cannot display old grades or carried-forward GPA", () => {
  const summaries = [
    summary("2025-2026", "HK01", 6.66, 2.42), summary("2025-2026", "HK02", 7.69, 3.32),
    { ...summary("2026-2027", "HK01", null, null), cumulativeGpa10: 7.73, cumulativeGpa4: 3.12 },
    summary("2026-2027", "HK02", 8, 3),
  ];
  assert.equal(semesterGradeSummary(semester(7, "NO_SCORE"), data, summaries), undefined);
  assert.equal(semesterGradeSummary(semester(8, "NOT_COMPLETED"), data, summaries), undefined);
});

test("regular schedule fallback preserves genuine zero grades but never borrows another program or summer term", () => {
  const regular = { ...data, student: { ...data.student, studyCohortCode: null } };
  const zero = summary("2022-2023", "HK01", 0, 0);
  assert.equal(semesterGradeSummary(semester(1, "FAILED"), regular, [zero]), zero);
  assert.equal(semesterGradeSummary(semester(1), regular, [{ ...zero, programCode: "OTHER" }]), undefined);
  assert.equal(semesterGradeSummary(semester(1), regular, [{ ...zero, isSummer: true }]), undefined);
  assert.equal(semesterGradeSummary(semester(1), regular, [{ ...zero, termCode: "HK03" }]), undefined);
});

test("conditional courses alone cannot create academic GPA and retakes do not change the schedule", () => {
  const retake = semester(1);
  retake.courses[0].passedAcademicYear = "2025-2026";
  retake.courses[0].passedTermCode = "HK03";
  const first = summary("2023-2024", "HK01", 7.86, 3.38);
  assert.equal(semesterGradeSummary(retake, data, [first]), first);
  const conditional = { ...retake, courses: retake.courses.map(course => ({ ...course, isConditional: true, requirementType: "conditional" })) };
  assert.equal(semesterGradeSummary(conditional, data, [first]), undefined);
});
