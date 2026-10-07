import assert from "node:assert/strict";
import test from "node:test";
import { evaluateStudentTrainingProgress, type StudentGradeAttempt, type TrainingProgressCourse } from "../lib/services/student-training-progress";
import { semesterMilestoneCredits } from "../../frontend/lib/semester-progress-display";

// Semester rows from the reported 2246A001 progress screen.
const rows: Array<[number, string, number, string, boolean]> = [
  [1,"20CT1101",3,"mandatory",true], [1,"20CT1102",4,"mandatory",true],
  [1,"20LH0001",3,"mandatory",true], [1,"LC1101D",3,"mandatory",true],
  [1,"QP2101D",3,"conditional",true], [1,"QP2102D",2,"conditional",true],
  [1,"QP2103D",2,"conditional",true], [1,"QP2104D",2,"conditional",true], [1,"TC1001D",1,"conditional",true],
  [2,"20TN1201",3,"elective",true], [2,"20TN1202",4,"mandatory",true],
  [2,"20CT1103",3,"elective",true], [2,"20CT1202",4,"mandatory",true],
  [2,"20CT1203",3,"elective",true], [2,"LC1102D",2,"mandatory",true], [2,"TC1002D",1,"conditional",true],
  [3,"20CT1201",3,"mandatory",true], [3,"20CT2102",3,"mandatory",true],
  [3,"20CT2103",3,"mandatory",true], [3,"20CT3204",1,"mandatory",true],
  [3,"20QT0001",3,"elective",false], [3,"20QT0004",3,"elective",true],
  [3,"20TN2102",3,"elective",true], [3,"LC2101D",2,"mandatory",true], [3,"TC2003D",1,"conditional",true],
  [4,"20CT2201",4,"mandatory",true], [4,"20CT2203",4,"mandatory",true],
  [4,"20CT2204",3,"mandatory",true], [4,"20NV0002",3,"elective",true],
  [4,"20QT0006",3,"elective",false], [4,"20SP0001",3,"elective",true], [4,"LC2102D",2,"mandatory",true],
  [5,"20CT2101",4,"mandatory",true], [5,"20CT2202",4,"mandatory",true],
  [5,"20CT2205",3,"mandatory",true], [5,"20CT3107D",3,"elective",true],
  [5,"20CT3108D",3,"elective",true], [5,"LC3101D",2,"mandatory",true],
  [6,"20CT3132D",3,"mandatory",true], [6,"20CT3101D",3,"mandatory",true],
  [6,"20CT3103D",4,"mandatory",true], [6,"20CT3104D",3,"elective",true],
  [6,"20CT3105D",3,"elective",false], [6,"20CT3106D",3,"elective",true], [6,"20CT3208",3,"elective",true],
  [7,"20CT3201",3,"mandatory",false], [7,"20CT3202",3,"mandatory",false],
  [7,"20CT3203",3,"mandatory",false], [7,"20CT3205",3,"elective",false],
  [7,"20CT3206",3,"elective",false], [7,"20CT3207",3,"elective",false], [7,"20CT4103D",3,"elective",false],
  [8,"20CT4101D",3,"mandatory",false], [9,"20CT4201D",8,"mandatory",false],
];
const curriculum: TrainingProgressCourse[] = rows.map(([semesterNo, courseCode, credits, requirementType]) => ({
  courseId: courseCode, courseCode, courseName: courseCode, credits, semesterNo, requirementType,
}));
const grades: StudentGradeAttempt[] = rows.filter((row) => row[4]).map(([, courseCode]) => ({
  courseCode, isPass: true, scoreStatus: "graded", letterCode: "B",
}));
const input = {
  student: { id: "s", studentCode: "2246A001", fullName: "Lâm Anh Vỹ", classCode: "ITK46A", cohortCode: "K46", programCode: "CQ22CT-PM" },
  timeline: { currentAcademicYear: "2026-2027", currentTermCode: "HK01", expectedYear: 4, expectedSemester: "HK1", expectedSemesterNo: 7 },
  curriculum, grades, rules: { requiredTotalCredits: 150, requiredElectiveCredits: 46 },
  // Only the current annual plan is supplied; historical rows still use their semester quotas.
  semesterPlans: new Map([[7,18]]),
};

test("reported HK1-HK6 rows total 107 earned / 98 planned, including extra passed electives", () => {
  const result = evaluateStudentTrainingProgress(input);
  assert.deepEqual(result.semesters.slice(0,6).map((semester) => [semester.completedCredits, semester.plannedCredits]), [
    [13,13], [19,16], [18,18], [19,16], [19,16], [19,19],
  ]);
  assert.equal(result.scheduleProgress.expectedCreditsToDate,98);
  assert.equal(result.scheduleProgress.earnedCreditsToDate,107);
  assert.equal(result.scheduleProgress.creditDifference,9);
  assert.equal(result.scheduleProgress.creditDifferenceText,"Học vượt +9 TC");
  assert.deepEqual(semesterMilestoneCredits(result.semesters,6), {
    expectedCreditsToDate:98, earnedCreditsToDate:107, creditDifference:9,
  });
});

test("current/pending and future-semester credits never change the end-of-HK6 totals", () => {
  const result = evaluateStudentTrainingProgress({
    ...input,
    grades: [...grades,
      { courseCode:"20CT3201", isPass:true, scoreStatus:"graded" },
      { courseCode:"20CT3202", notScore:true, scoreStatus:"pending", academicYear:"2026-2027", termCode:"HK01" },
      { courseCode:"20CT4101D", isPass:true, scoreStatus:"graded" },
    ],
  });
  assert.equal(result.semesters.find((semester) => semester.semesterNo === 7)?.completedCredits,3);
  assert.equal(result.semesters.find((semester) => semester.semesterNo === 8)?.completedCredits,3);
  assert.equal(result.scheduleProgress.earnedCreditsToDate,107);
  assert.equal(result.scheduleProgress.expectedCreditsToDate,98);
  assert.deepEqual(semesterMilestoneCredits(result.semesters,6), {
    expectedCreditsToDate:98, earnedCreditsToDate:107, creditDifference:9,
  });
});

test("retakes, duplicate curriculum rows and GDTC/GDQP do not inflate milestone credit totals", () => {
  const result = evaluateStudentTrainingProgress({
    ...input, curriculum: [...curriculum, curriculum[0]],
    grades: [...grades, grades[0], { courseCode:"20CT1101", isPass:false, letterCode:"F", scoreStatus:"graded" }],
  });
  assert.equal(result.scheduleProgress.earnedCreditsToDate,107);
  assert.equal(result.scheduleProgress.creditDifference,9);
});

test("a failed old course reduces earned credit without changing the semester plan", () => {
  const result = evaluateStudentTrainingProgress({
    ...input,
    grades: [...grades.filter((grade) => grade.courseCode !== "20CT1102"),
      { courseCode:"20CT1102", isPass:false, letterCode:"F", scoreStatus:"graded" }],
  });
  assert.equal(result.scheduleProgress.earnedCreditsToDate,103);
  assert.equal(result.scheduleProgress.expectedCreditsToDate,98);
  assert.equal(result.scheduleProgress.creditDifference,5);
  assert.equal(result.scheduleProgress.missingRequiredCredits,4);
  assert.equal(result.scheduleProgress.progressStatus,"BEHIND");
  assert.deepEqual(semesterMilestoneCredits(result.semesters,6), {
    expectedCreditsToDate:98, earnedCreditsToDate:103, creditDifference:5,
  });
});
