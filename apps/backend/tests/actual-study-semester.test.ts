import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStudentTrainingProgress, type StudentGradeAttempt, type TrainingProgressCourse } from "../lib/services/student-training-progress";
import { studentProgressCohort } from "../lib/student-progress-cohort";

const student = { id: "s", studentCode: "2246A001", fullName: "Lâm Anh Vỹ", classCode: "ITK46A", cohortCode: "K46", programCode: "TEST" };
const timeline = { currentAcademicYear: "2026-2027", currentTermCode: "HK01", expectedYear: 5, expectedSemester: "HK1", expectedSemesterNo: 9 };
const course = (code: string, semesterNo: number, conditional = false): TrainingProgressCourse => ({ courseId: code, courseCode: code, courseName: code, credits: 3, requirementType: conditional ? "conditional" : "mandatory", isConditional: conditional, semesterNo });
const pending = (courseCode: string, academicYear = "2026-2027", termCode = "HK01"): StudentGradeAttempt => ({ courseCode, academicYear, termCode, scoreStatus: "pending", notScore: true });
const evaluate = (curriculum: TrainingProgressCourse[], grades: StudentGradeAttempt[]) => evaluateStudentTrainingProgress({ student, timeline, curriculum, grades });

test("delayed student studies HK7, not the cohort's HK9; benchmark and overdue calculations stay fixed", () => {
  const curriculum = [course("FIRST", 1), course("HK7", 7), course("HK8", 8), course("HK9", 9)];
  const old = { courseCode: "FIRST", scoreStatus: "graded", isPass: true };
  const baseline = evaluate(curriculum, [old]);
  const result = evaluate(curriculum, [old, pending("HK7")]);
  assert.deepEqual(result.scheduleProgress.studyingSemesterNos, [7]);
  assert.equal(result.semesters.find(s => s.semesterNo === 7)?.timelineType, "CURRENT_STUDYING");
  assert.equal(result.semesters.find(s => s.semesterNo === 7)?.statusLabel, "Đang theo học");
  assert.equal(result.semesters.find(s => s.semesterNo === 9)?.timelineType, "CURRENT_PLAN");
  assert.equal(result.semesters.find(s => s.semesterNo === 9)?.statusLabel, "Chưa đăng ký");
  assert.equal(result.scheduleProgress.expectedSemesterNo, 9);
  assert.equal(result.scheduleProgress.expectedCreditsToDate, baseline.scheduleProgress.expectedCreditsToDate);
  assert.equal(result.scheduleProgress.earnedCreditsToDate, baseline.scheduleProgress.earnedCreditsToDate);
  assert.equal(result.scheduleProgress.missingRequiredCredits, baseline.scheduleProgress.missingRequiredCredits);
});

test("old pending courses, VT, and condition courses never create a current-study semester", () => {
  const result = evaluate([course("OLD", 7), course("VT", 8), course("QP2101D", 1, true)], [
    pending("OLD", "2025-2026"), { ...pending("VT"), specialCode: "VT" }, pending("QP2101D"),
  ]);
  assert.deepEqual(result.scheduleProgress.studyingSemesterNos, []);
  assert.equal(result.courseStatus.noScore.find(c => c.courseCode === "OLD")?.isCurrentlyStudying, false);
  assert.equal(result.courseStatus.failed.find(c => c.courseCode === "VT")?.isCurrentlyStudying, false);
  assert.ok(!result.semesters.some(s => s.timelineType === "CURRENT_STUDYING"));
});

test("current retakes and current benchmark courses may both be active without moving the milestone", () => {
  const history: StudentGradeAttempt[] = [{ courseCode: "RETAKE", academicYear: "2025-2026", termCode: "HK02", scoreStatus: "graded", isPass: false, letterCode: "F", score4: 0 }, pending("RETAKE"), pending("HK9")];
  const before = JSON.stringify(history);
  const result = evaluate([course("RETAKE", 3), course("HK9", 9)], history);
  assert.deepEqual(result.scheduleProgress.studyingSemesterNos, [3, 9]);
  assert.equal(result.scheduleProgress.expectedSemesterNo, 9);
  assert.equal(JSON.stringify(history), before);
});

test("a current offering without a grade is active, while finalized grades and unscoped pending records are not", () => {
  const result = evaluate([course("EMPTY", 7), course("DONE", 8), course("UNSCOPED", 9)], [
    { courseCode: "EMPTY", academicYear: "2026-2027", termCode: "HK01" },
    { courseCode: "DONE", academicYear: "2026-2027", termCode: "HK01", scoreStatus: "graded", isPass: true, score4: 3 },
    { courseCode: "UNSCOPED", scoreStatus: "pending", notScore: true },
  ]);
  assert.deepEqual(result.scheduleProgress.studyingSemesterNos, [7]);
  assert.equal(result.courseStatus.noScore.find(c => c.courseCode === "EMPTY")?.isCurrentlyStudying, true);
  assert.equal(result.semesters.find(s => s.semesterNo === 9)?.statusLabel, "Chưa đăng ký");
});

test("confirmed study cohort only applies from its effective year; retakes alone do not change it", () => {
  assert.equal(studentProgressCohort({}, "2026-2027"),null);
  const schedule={progressCohortCode:"K47",progressCohortFromYear:"2026-2027"};
  assert.equal(studentProgressCohort(schedule,"2025-2026"),null);
  assert.equal(studentProgressCohort(schedule,"2026-2027"),"K47");
  assert.equal(studentProgressCohort(schedule,"2027-2028"),"K47");
  assert.equal(studentProgressCohort({progressCohortCode:"K47"},"2026-2027"),null);
});

test("confirmed K47 schedule excludes active HK7 and unregistered HK8/9 from past-due debt while preserving administrative K46", () => {
  const result=evaluateStudentTrainingProgress({student,curriculum:[course("DONE",6),course("ACTIVE",7),course("NEXT",8),course("FINAL",9)],
    grades:[{courseCode:"DONE",scoreStatus:"graded",isPass:true},pending("ACTIVE")],
    timeline:{...timeline,expectedYear:4,expectedSemesterNo:7,administrativeSemesterNo:9}});
  assert.equal(result.student.cohortCode,"K46");
  assert.equal(result.scheduleProgress.expectedSemesterNo,7);
  assert.equal(result.scheduleProgress.administrativeSemesterNo,9);
  assert.equal(result.scheduleProgress.missingRequiredCoursesCount,0);
  assert.equal(result.scheduleProgress.overdueCredits,0);
  assert.equal(result.scheduleProgress.progressStatus,"ON_TRACK");
  assert.ok(result.courseStatus.future.some(c=>c.courseCode==="NEXT"));
  assert.deepEqual(result.scheduleProgress.studyingSemesterNos,[7]);
});

test("adjusted schedule still detects failed compulsory courses from semesters already due", () => {
  const result=evaluateStudentTrainingProgress({student,curriculum:[course("DEBT",3),course("ACTIVE",7)],
    grades:[{courseCode:"DEBT",scoreStatus:"graded",isPass:false,letterCode:"F"},pending("ACTIVE")],
    timeline:{...timeline,expectedYear:4,expectedSemesterNo:7,administrativeSemesterNo:9}});
  assert.equal(result.scheduleProgress.progressStatus,"BEHIND");
  assert.deepEqual(result.scheduleProgress.missingRequiredCourses.map(c=>c.courseCode),["DEBT"]);
});
