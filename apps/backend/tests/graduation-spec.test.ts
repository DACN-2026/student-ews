import assert from "node:assert/strict";
import test from "node:test";
import { resolveGraduationStatus } from "../lib/services/graduation-evaluations";
import {
  buildGraduationForecast,
  type ForecastCourse,
  type ForecastGrade,
  type ForecastSchedule,
} from "../lib/services/graduation-forecast";

// TC1: Required course PASS -> completed
test("TC1: Required course PASS -> completed", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1101", courseName: "Nhập môn CNTT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1101", isPassed: true, scoreStatus: "graded", score10: 8.0, score4: 3.5, letterGrade: "B+" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 3,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 3,
  });

  assert.equal(forecast.requirements.requiredCourses.completed, 1);
  assert.equal(forecast.requirements.requiredCourses.remaining, 0);
  assert.equal(forecast.requiredCoursesBreakdown.completed.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.completed[0].courseCode, "20CT1101");
  assert.equal(forecast.missingRequiredCourses.length, 0);
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.curriculumComplete, true);
});

// TC2: Required course FAIL -> failed + NOT_ELIGIBLE
test("TC2: Required course FAIL -> failed + NOT_ELIGIBLE", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1102", courseName: "Nguyên lý lập trình", credits: 4, requirementType: "mandatory", semesterNo: 1 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1102", isPassed: false, scoreStatus: "graded", score10: 3.0, score4: 0.0, letterGrade: "F" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 4,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 4,
  });

  assert.equal(forecast.requiredCoursesBreakdown.failed.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.failed[0].courseCode, "20CT1102");
  assert.equal(forecast.failedCourses.length, 1);
  assert.equal(forecast.missingRequiredCourses.length, 1);
  assert.equal(forecast.curriculumComplete, false);

  const status = resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "FAIL" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]);
  assert.equal(status, "NOT_ELIGIBLE");
});

// TC3: No record -> missing
test("TC3: No record -> missing", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT2102", courseName: "Kiến trúc máy tính", credits: 3, requirementType: "mandatory", semesterNo: 2 },
  ];
  const grades: ForecastGrade[] = [];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 3,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 3,
  });

  assert.equal(forecast.requiredCoursesBreakdown.missing.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.missing[0].courseCode, "20CT2102");
  assert.equal(forecast.requiredCoursesBreakdown.missing[0].state, "not_completed");
  assert.equal(forecast.requiredCoursesBreakdown.failed.length, 0);
  assert.equal(forecast.requiredCoursesBreakdown.completed.length, 0);
  assert.equal(forecast.missingRequiredCourses.length, 1);
  assert.equal(forecast.curriculumComplete, false);
});

// TC4: No score -> unknown/noScore -> không mặc định PENDING_GRADE
test("TC4: No score -> unknown/noScore -> không mặc định PENDING_GRADE", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20TN0002", courseName: "Toán rời rạc", credits: 4, requirementType: "mandatory", semesterNo: 2 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20TN0002", isPassed: false, scoreStatus: "ungraded", notScore: true },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 4,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 4,
  });

  assert.equal(forecast.requiredCoursesBreakdown.noScore.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.noScore[0].courseCode, "20TN0002");
  assert.equal(forecast.requiredCoursesBreakdown.noScore[0].state, "no_score");
  assert.equal(forecast.noScoreCourses.length, 1);
  assert.equal(forecast.summary.completedCredits, 0);

  // Without proof of pending grade, a missing mandatory course is NOT_ELIGIBLE, not PENDING_GRADE
  const status = resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "FAIL" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]);
  assert.equal(status, "NOT_ELIGIBLE");
});

// TC5: Học lại nhiều lần, có một lần PASS -> completed một lần, tín chỉ tính một lần
test("TC5: Học lại nhiều lần, có một lần PASS -> completed một lần, tín chỉ tính một lần", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1201", courseName: "Cấu trúc dữ liệu và giải thuật", credits: 3, requirementType: "mandatory", semesterNo: 2 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1201", isPassed: false, scoreStatus: "graded", score10: 3.0, letterGrade: "F" },
    { courseCode: "20CT1201", isPassed: false, scoreStatus: "graded", score10: 4.0, letterGrade: "F" },
    { courseCode: "20CT1201", isPassed: true, scoreStatus: "graded", score10: 7.0, letterGrade: "B" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 3,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 3,
  });

  assert.equal(forecast.requirements.requiredCourses.completed, 1);
  assert.equal(forecast.requirements.requiredCourses.remaining, 0);
  assert.equal(forecast.requiredCoursesBreakdown.completed.length, 1);
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.failedCourses.length, 0);
});

// TC6: Elective required 6 TC, earned 9 TC -> credited 6, remaining 0, extra 3
test("TC6: Elective required 6 TC, earned 9 TC -> credited 6, remaining 0, extra 3", () => {
  const courses: ForecastCourse[] = [
    { courseId: "e1", courseCode: "E1", courseName: "Tự chọn 1", credits: 3, requirementType: "elective", semesterNo: 3 },
    { courseId: "e2", courseCode: "E2", courseName: "Tự chọn 2", credits: 3, requirementType: "elective", semesterNo: 3 },
    { courseId: "e3", courseCode: "E3", courseName: "Tự chọn 3", credits: 3, requirementType: "elective", semesterNo: 3 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "E1", isPassed: true, scoreStatus: "graded" },
    { courseCode: "E2", isPassed: true, scoreStatus: "graded" },
    { courseCode: "E3", isPassed: true, scoreStatus: "graded" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredElectiveCredits: 6,
    requiredTotalCredits: 6,
  });

  assert.equal(forecast.requirements.electives.passedCredits, 9);
  assert.equal(forecast.requirements.electives.completedCredits, 6);
  assert.equal(forecast.requirements.electives.remainingCredits, 0);
  assert.equal(forecast.requirements.electives.excessCredits, 3);
  assert.equal(forecast.summary.completedCredits, 6);
});

// TC7: Elective required 6, earned 3 -> remaining 3
test("TC7: Elective required 6, earned 3 -> remaining 3", () => {
  const courses: ForecastCourse[] = [
    { courseId: "e1", courseCode: "E1", courseName: "Tự chọn 1", credits: 3, requirementType: "elective", semesterNo: 3 },
    { courseId: "e2", courseCode: "E2", courseName: "Tự chọn 2", credits: 3, requirementType: "elective", semesterNo: 3 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "E1", isPassed: true, scoreStatus: "graded" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredElectiveCredits: 6,
    requiredTotalCredits: 6,
  });

  assert.equal(forecast.requirements.electives.passedCredits, 3);
  assert.equal(forecast.requirements.electives.completedCredits, 3);
  assert.equal(forecast.requirements.electives.remainingCredits, 3);
  assert.equal(forecast.requirements.electives.excessCredits, 0);
  assert.equal(forecast.summary.remainingCredits, 3);
});

// TC8: Hai elective groups: A vượt 3 TC, B thiếu 3 TC -> A không bù B
test("TC8: Hai elective groups: A vượt 3 TC, B thiếu 3 TC -> A không bù B", () => {
  const courses: ForecastCourse[] = [
    { courseId: "a1", courseCode: "A1", courseName: "Môn A1", credits: 3, requirementType: "elective", semesterNo: 4 },
    { courseId: "a2", courseCode: "A2", courseName: "Môn A2", credits: 3, requirementType: "elective", semesterNo: 4 },
    { courseId: "a3", courseCode: "A3", courseName: "Môn A3", credits: 3, requirementType: "elective", semesterNo: 4 },
    { courseId: "b1", courseCode: "B1", courseName: "Môn B1", credits: 3, requirementType: "elective", semesterNo: 4 },
    { courseId: "b2", courseCode: "B2", courseName: "Môn B2", credits: 3, requirementType: "elective", semesterNo: 4 },
  ];
  const schedule: ForecastSchedule[] = [
    { courseId: "a1", academicYear: "2026-2027", termCode: "HK1", semesterNo: 4, choiceGroupCode: "GROUP_A:6" },
    { courseId: "a2", academicYear: "2026-2027", termCode: "HK1", semesterNo: 4, choiceGroupCode: "GROUP_A:6" },
    { courseId: "a3", academicYear: "2026-2027", termCode: "HK1", semesterNo: 4, choiceGroupCode: "GROUP_A:6" },
    { courseId: "b1", academicYear: "2026-2027", termCode: "HK1", semesterNo: 4, choiceGroupCode: "GROUP_B:6" },
    { courseId: "b2", academicYear: "2026-2027", termCode: "HK1", semesterNo: 4, choiceGroupCode: "GROUP_B:6" },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "A1", isPassed: true, scoreStatus: "graded" },
    { courseCode: "A2", isPassed: true, scoreStatus: "graded" },
    { courseCode: "A3", isPassed: true, scoreStatus: "graded" }, // Group A earned 9, required 6 -> extra 3
    { courseCode: "B1", isPassed: true, scoreStatus: "graded" }, // Group B earned 3, required 6 -> short 3
  ];
  const forecast = buildGraduationForecast({
    courses,
    schedule,
    grades,
    requiredElectiveCredits: 12,
    requiredTotalCredits: 12,
  });

  const groupA = forecast.electiveGroups.find((g) => g.code === "GROUP_A:6");
  const groupB = forecast.electiveGroups.find((g) => g.code === "GROUP_B:6");
  assert.ok(groupA);
  assert.ok(groupB);

  assert.equal(groupA.passedCredits, 9);
  assert.equal(groupA.creditedCredits, 6);
  assert.equal(groupA.remainingCredits, 0);
  assert.equal(groupA.extraCredits, 3);
  assert.equal(groupA.status, "PASS");

  assert.equal(groupB.passedCredits, 3);
  assert.equal(groupB.creditedCredits, 3);
  assert.equal(groupB.remainingCredits, 3);
  assert.equal(groupB.extraCredits, 0);
  assert.equal(groupB.status, "FAIL");

  // Group A's extra 3 does NOT compensate Group B's deficit
  assert.equal(forecast.requirements.electives.passedCredits, 12);
  assert.equal(forecast.requirements.electives.completedCredits, 9);
  assert.equal(forecast.requirements.electives.remainingCredits, 3);
});

// TC9: Course ngoài CTĐT -> không cộng vào completion
test("TC9: Course ngoài CTĐT -> không cộng vào completion", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1101", courseName: "Môn CTĐT", credits: 3, requirementType: "mandatory", semesterNo: 1 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1101", isPassed: true, scoreStatus: "graded" },
    { courseCode: "NGOAI_CTDT", courseName: "Môn ngoài chương trình", isPassed: true, scoreStatus: "graded" },
  ];
  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 3,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 3,
  });

  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.unmatchedGrades.length, 1);
  assert.equal(forecast.unmatchedGrades[0].courseCode, "NGOAI_CTDT");
});

// TC10: Thiếu rule CTĐT -> MANUAL_REVIEW / INCOMPLETE_RULES -> không xuất remainingCredits giả
test("TC10: Thiếu rule CTĐT -> MANUAL_REVIEW / INCOMPLETE_RULES -> không xuất remainingCredits giả", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "CQ25_01", courseName: "Môn CQ25", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    { courseId: "c2", courseCode: "CQ25_E1", courseName: "Tự chọn CQ25", credits: 3, requirementType: "elective", semesterNo: 2 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "CQ25_01", isPassed: true, scoreStatus: "graded" },
  ];
  // No requiredElectiveCredits or requiredTotalCredits configured
  const forecast = buildGraduationForecast({
    courses,
    grades,
  });

  assert.equal(forecast.summary.requiredCredits, null);
  assert.equal(forecast.summary.remainingCredits, null);
  assert.equal(forecast.summary.completedCredits, null);
  assert.equal(forecast.curriculumComplete, null);
  assert.ok(forecast.warnings.some((w) => w.includes("không cung cấp mức tín chỉ")));

  // In evaluation, missing credit rule triggers MANUAL_REVIEW
  const status = resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "NOT_AVAILABLE" },
    { ruleCode: "TOTAL_CREDITS", result: "NOT_AVAILABLE" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]);
  assert.equal(status, "MANUAL_REVIEW");
});

// TC11: Missing foreign language data -> UNKNOWN / MANUAL_REVIEW -> không FAIL
test("TC11: Missing foreign language data -> UNKNOWN / MANUAL_REVIEW -> không FAIL", () => {
  const status = resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
    { ruleCode: "TOTAL_CREDITS", result: "PASS" },
    { ruleCode: "FOREIGN_LANGUAGE", result: "NOT_AVAILABLE" },
  ]);

  assert.notEqual(status, "NOT_ELIGIBLE");
  assert.equal(status, "MANUAL_REVIEW");
});

// TC12: Một điều kiện FAIL + một dữ liệu UNKNOWN -> finalStatus NOT_ELIGIBLE + needsManualReview = true
test("TC12: Một điều kiện FAIL + một dữ liệu UNKNOWN -> finalStatus NOT_ELIGIBLE + needsManualReview = true", () => {
  const details = [
    { ruleCode: "PROGRAM_COMPLETION", result: "PASS" as const },
    { ruleCode: "CUMULATIVE_GPA", result: "FAIL" as const }, // Confirmed FAIL
    { ruleCode: "FOREIGN_LANGUAGE", result: "NOT_AVAILABLE" as const }, // UNKNOWN
  ];

  const status = resolveGraduationStatus(details);
  const needsManualReview = details.some((d) => d.result === "NOT_AVAILABLE");

  assert.equal(status, "NOT_ELIGIBLE");
  assert.equal(needsManualReview, true);
});

// TC13: Môn đang học (no_score) không được coi là đạt hoặc rớt, và tín chỉ đang học không cộng vào tín chỉ tích lũy
test("TC13: Môn đang học không cộng vào completedCredits và không coi là pass/fail", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1101", courseName: "Môn đã đạt", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    { courseId: "c2", courseCode: "20CT1102", courseName: "Môn đang học", credits: 4, requirementType: "mandatory", semesterNo: 2 },
  ];
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1101", isPassed: true, scoreStatus: "graded", score10: 8.0, letterGrade: "B" },
    { courseCode: "20CT1102", isPassed: false, scoreStatus: "ungraded", notScore: true }, // Môn đang học
  ];

  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 7,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 7,
  });

  // Môn đang học có state là no_score
  assert.equal(forecast.requiredCoursesBreakdown.noScore.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.noScore[0].courseCode, "20CT1102");
  assert.equal(forecast.requiredCoursesBreakdown.noScore[0].state, "no_score");

  // Không nằm trong danh sách completed hay failed
  assert.equal(forecast.requiredCoursesBreakdown.completed.length, 1);
  assert.equal(forecast.requiredCoursesBreakdown.failed.length, 0);

  // Tín chỉ tích lũy chỉ tính môn đã đạt (3 TC), KHÔNG cộng 4 TC đang học
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.summary.pendingCredits, 4);
  assert.equal(forecast.summary.remainingCredits, 4);
  assert.equal(forecast.curriculumComplete, false);
});

// TC14: Đủ tổng tín chỉ nhưng thiếu học phần bắt buộc -> không được coi là hoàn thành CTĐT
test("TC14: Đủ tổng tín chỉ nhưng thiếu học phần bắt buộc -> curriculumComplete = false", () => {
  const courses: ForecastCourse[] = [
    { courseId: "c1", courseCode: "20CT1101", courseName: "HP Bắt buộc 1", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    { courseId: "c2", courseCode: "20CT1102", courseName: "HP Bắt buộc 2 (Chưa học)", credits: 3, requirementType: "mandatory", semesterNo: 1 },
    { courseId: "e1", courseCode: "20CT2101", courseName: "HP Tự chọn 1", credits: 3, requirementType: "elective", semesterNo: 2 },
    { courseId: "e2", courseCode: "20CT2102", courseName: "HP Tự chọn 2", credits: 3, requirementType: "elective", semesterNo: 2 },
  ];
  // SV đạt 1 bắt buộc (3 TC) + 2 tự chọn (6 TC) = 9 TC, vượt mức tổng 6 TC cần thiết
  const grades: ForecastGrade[] = [
    { courseCode: "20CT1101", isPassed: true, scoreStatus: "graded", score10: 8.0 },
    { courseCode: "20CT2101", isPassed: true, scoreStatus: "graded", score10: 7.0 },
    { courseCode: "20CT2102", isPassed: true, scoreStatus: "graded", score10: 7.5 },
  ];

  const forecast = buildGraduationForecast({
    courses,
    grades,
    requiredCompulsoryCredits: 6,
    requiredElectiveCredits: 0,
    requiredTotalCredits: 6,
  });

  // Thiếu môn bắt buộc c2
  assert.equal(forecast.missingRequiredCourses.length, 1);
  assert.equal(forecast.missingRequiredCourses[0].courseCode, "20CT1102");
  // Dù tổng tín chỉ đạt >= 6, nhưng thiếu môn bắt buộc -> curriculumComplete vẫn là false!
  assert.equal(forecast.curriculumComplete, false);
});

// TC15: Đang hoàn thiện (PENDING_GRADE) khi tất cả điều kiện còn thiếu đều đang chờ điểm
test("TC15: Sinh viên có điều kiện đang chờ điểm học phần -> PENDING_GRADE", () => {
  const status = resolveGraduationStatus([
    { ruleCode: "PROGRAM_COMPLETION", result: "PENDING" },
    { ruleCode: "TOTAL_CREDITS", result: "PENDING" },
    { ruleCode: "CUMULATIVE_GPA", result: "PASS" },
  ]);

  // Phải là PENDING_GRADE (Đang hoàn thiện), không bị đánh thành NOT_ELIGIBLE
  assert.equal(status, "PENDING_GRADE");
});

