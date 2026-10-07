import assert from "node:assert/strict";
import test from "node:test";
import { assessCertificateRequirements, courseOutcome, type CertificateAttempt } from "../lib/academic-course-rules";
import { buildGraduationForecast } from "../lib/services/graduation-forecast";
import { calculateAssessmentTermFailedCredits } from "../lib/services/academic-warning-capabilities";
import { evaluateProgress } from "../lib/services/training-progress";
import { gradeImportRowKey, GradesService } from "../lib/services/grades";
import { calculateAcademicDebt } from "../lib/services/academic-debt";
import { evaluateStudentTrainingProgress } from "../lib/services/student-training-progress";
import { semesterProgressDisplay } from "../../frontend/lib/semester-progress-display";
import { assessTeachingSemester, teachingSemesterCredits } from "../lib/semester-teaching-requirements";

const pass = (courseCode: string, credits = 1): CertificateAttempt & { courseCode: string } => ({ courseCode, credits, isPass: true, scoreStatus: "graded", letterCode: "D" });

const planCourse = (code: string, credits: number, requirementType = "elective", status = "PASSED") => ({ courseId: code, courseCode: code, courseName: code, credits, requirementType, status, semesterNo: 2 });
const semester2Pool = [planCourse("20TN1202",4,"mandatory"),planCourse("20CT1202",4,"mandatory"),planCourse("LC1102D",2,"mandatory"),
  planCourse("20CT1103",3),planCourse("20CT1203",3),planCourse("20TN1201",3,"elective","NOT_COMPLETED"),planCourse("TC1002D",1,"conditional")];

test("HK2 screenshot: 10 compulsory + 6 elective credits is 16/16, with GDTC separate", () => {
  const semester = evaluateStudentTrainingProgress({
    student:{id:"s",studentCode:"s",fullName:"Test",classCode:null,cohortCode:"K46",programCode:"CQ22CT-PM"},
    curriculum:semester2Pool,grades:semester2Pool.filter(c=>c.status==='PASSED').map(c=>({...pass(c.courseCode,c.credits),academicYear:'2022-2023',termCode:'HK02'})),
    rules:{requiredTotalCredits:150,requiredElectiveCredits:46},
    timeline:{currentAcademicYear:"2026-2027",currentTermCode:"HK01",expectedYear:5,expectedSemester:"HK1",expectedSemesterNo:9},
  }).semesters.find(s=>s.semesterNo===2)!;
  assert.equal(semester.plannedCredits,16);
  assert.equal(semester.completedCredits,16);
  assert.equal(semester.electivePlannedCredits,6);
  assert.equal(semester.remainingCredits,0);
  assert.equal(semesterProgressDisplay(semester).label,'Đạt kỳ');
  assert.equal(semester.courses.find(c=>c.courseCode==='TC1002D')?.status,'PASSED');
});

test("all teaching-plan quotas cover semesters 1–9 and specialization is not guessed", () => {
  assert.deepEqual(Array.from({length:9},(_,i)=>teachingSemesterCredits(i+1,'CQ22CT-PM')),[13,16,18,16,16,19,18,18,18]);
  assert.equal(teachingSemesterCredits(6,'CQ23CT-MMT'),17);
  assert.equal(teachingSemesterCredits(6,'CQ24CT-KHDL'),16);
  assert.equal(teachingSemesterCredits(6,'CQ24CT'),null);
  assert.equal(teachingSemesterCredits(7,'CQ23CT'),null);
  assert.equal(teachingSemesterCredits(2,'CQ26CT'),null);
});

test("HK6 PM: extra branch electives cannot replace the Python supporting-group requirement", () => {
  const courses=[planCourse('20CT3101D',3,'mandatory'),planCourse('20CT3132D',3,'mandatory'),planCourse('20CT3103D',4,'mandatory'),
    planCourse('20CT3106D',3,'elective','FAILED'),planCourse('20CT3104D',3),planCourse('20CT3105D',3),planCourse('20CT3208',3)];
  const result=assessTeachingSemester(6,'CQ22CT-PM',courses)!;
  assert.equal(result.curriculumConfirmed,true);
  assert.equal(result.plannedCredits,19);
  assert.equal(courses.filter(c=>c.status==='PASSED').reduce((sum,c)=>sum+c.credits,0),19);
  assert.equal(result.remainingCredits,3);
  assert.equal(result.groups[0].remainingCredits,3);
});

test("a missing specialization pool is not completed at zero credits", () => {
  const result=evaluateStudentTrainingProgress({
    student:{id:'s',studentCode:'s',fullName:'Test',classCode:null,cohortCode:'K47',programCode:'CQ23CT'},
    curriculum:semester2Pool,grades:semester2Pool.filter(c=>c.status==='PASSED').map(c=>pass(c.courseCode,c.credits)),
    rules:{requiredTotalCredits:150,requiredElectiveCredits:46},
    timeline:{currentAcademicYear:'2026-2027',currentTermCode:'HK01',expectedYear:4,expectedSemester:'HK1',expectedSemesterNo:7},
  });
  const semester=result.semesters.find(s=>s.semesterNo===6)!;
  assert.equal(semester.status,'UNKNOWN');
  assert.equal(semester.plannedCredits,null);
  assert.equal(semesterProgressDisplay(semester).isCompleted,false);
  assert.equal(semesterProgressDisplay(semester).plannedCreditsLabel,'—');
  assert.equal(semesterProgressDisplay(semester).label,'Cần đối soát');
});

test("K49 HK2 offers the PDF-confirmed blockchain elective without adding conditional credits", () => {
  const courses=[...semester2Pool.map(c=>({...c,status:c.requirementType==='elective'?'NOT_COMPLETED':c.status})),planCourse('25BC0001',3),planCourse('20CT1103',3)];
  const result=assessTeachingSemester(2,'CQ25CT',courses)!;
  assert.equal(result.curriculumConfirmed,true);
  assert.equal(result.plannedCredits,16);
  assert.equal(result.remainingCredits,0);
});

const semester4Courses = [
  {code:"20CT2201",credits:4,kind:"mandatory"}, {code:"20CT2203",credits:4,kind:"mandatory"},
  {code:"20CT2204",credits:3,kind:"mandatory"}, {code:"LC2102D",credits:2,kind:"mandatory"},
  {code:"20NV0002",credits:3,kind:"elective"}, {code:"20QT0006",credits:3,kind:"elective"}, {code:"20SP0001",credits:3,kind:"elective"},
].map(c=>({courseId:c.code,courseCode:c.code,courseName:c.code,credits:c.credits,requirementType:c.kind,semesterNo:4}));

function evaluateSemester4(grades: Parameters<typeof evaluateStudentTrainingProgress>[0]["grades"]) {
  return evaluateStudentTrainingProgress({
    student:{id:"s",studentCode:"s",fullName:"Test",classCode:null,cohortCode:"K46",programCode:"CQ22CT-PM"},
    curriculum:semester4Courses,grades,
    rules:{requiredTotalCredits:150,requiredElectiveCredits:46},
    timeline:{currentAcademicYear:"2026-2027",currentTermCode:"HK01",expectedYear:5,expectedSemester:"HK1",expectedSemesterNo:9},
    semesterPlans:new Map([[9,18]]),
  }).semesters.find(s=>s.semesterNo===4)!;
}

const semester4MandatoryPasses = semester4Courses.filter(c=>c.requirementType==='mandatory').map(c=>({courseCode:c.courseCode,isPass:true,scoreStatus:'graded',letterCode:'D'}));

test("HK4 screenshot: 13 mandatory credits plus 3/9 elective credits means 13/16 and a 3-credit deficit", () => {
  const failed = {courseCode:'20NV0002',isPass:false,scoreStatus:'graded',letterCode:'F'};
  const pending = {courseCode:'20SP0001',isPass:false,notScore:true,scoreStatus:'pending'};
  const sem = evaluateSemester4([...semester4MandatoryPasses,failed,pending]);
  assert.equal(sem.plannedCredits,16);
  assert.equal(sem.mandatoryCredits,13);
  assert.equal(sem.completedCredits,13);
  assert.equal(sem.remainingCredits,3);
  assert.equal(sem.status,'INCOMPLETE');
  const display = semesterProgressDisplay(sem);
  assert.equal(display.label,'Thiếu 3 TC tự chọn');
  assert.equal(display.isCompleted,false);
  assert.equal(sem.courses.find(c=>c.courseCode==='20NV0002')?.status,'FAILED');
  assert.equal(sem.courses.find(c=>c.courseCode==='20SP0001')?.status,'NO_SCORE');
});

test("HK4: a permitted alternative satisfies the elective quota without deleting another option's F", () => {
  const failed = {courseCode:'20NV0002',isPass:false,scoreStatus:'graded',letterCode:'F'};
  const sem = evaluateSemester4([...semester4MandatoryPasses,failed,{courseCode:'20SP0001',isPass:true,scoreStatus:'graded',letterCode:'D'}]);
  assert.equal(sem.completedCredits,16);
  assert.equal(sem.remainingCredits,0);
  assert.equal(sem.status,'COMPLETED');
  const display = semesterProgressDisplay(sem);
  assert.equal(display.isCompleted,true);
  assert.equal(display.label,'Đạt kỳ');
  assert.equal(sem.courses.find(c=>c.courseCode==='20NV0002')?.latestLetterCode,'F');
  assert.equal(sem.failedCourses,1);
});

test("HK4: extra electives cannot replace an unpassed compulsory course or render a zero-credit debt badge", () => {
  const grades = semester4MandatoryPasses.filter(g=>g.courseCode!=='20CT2204');
  const sem = evaluateSemester4([...grades,...['20SP0001','20QT0006'].map(courseCode=>({courseCode,isPass:true,scoreStatus:'graded',letterCode:'D'}))]);
  assert.equal(sem.completedCredits,16);
  assert.equal(sem.remainingCredits,3);
  const display = semesterProgressDisplay(sem);
  assert.equal(display.isCompleted,false);
  assert.equal(display.label,'Nợ môn bắt buộc');
  assert.equal(display.remainingCredits,3);
});

test("K44 final-term landmark is 132 academic credits, never a hybrid 155-credit program", () => {
  const curriculum = [
    {courseId:"mandatory",courseCode:"M",courseName:"Compulsory before final",credits:86,requirementType:"mandatory",semesterNo:8},
    {courseId:"final",courseCode:"FINAL",courseName:"Final",credits:18,requirementType:"mandatory",semesterNo:9},
    ...[["20CT1103",9,3],["20QT0001",6,4],["20CT4104D",25,8],["20CT3107D",6,6]].map(([code,credits,semester]) => ({courseId:String(code),courseCode:String(code),courseName:String(code),credits:Number(credits),requirementType:"elective",semesterNo:Number(semester)})),
  ];
  const result = evaluateStudentTrainingProgress({
    student:{id:"s",studentCode:"s",fullName:"Test",classCode:null,cohortCode:"K46",programCode:"CQ22CT-PM"},
    curriculum,grades:curriculum.filter(c=>c.semesterNo<9).map(c=>({courseCode:c.courseCode,isPass:true,scoreStatus:"graded"})),
    rules:{requiredTotalCredits:150,requiredElectiveCredits:46},
    timeline:{currentAcademicYear:"2026-2027",currentTermCode:"HK01",expectedYear:5,expectedSemester:"HK1",expectedSemesterNo:9},
    semesterPlans:new Map([[9,18]]),
  });
  assert.equal(result.scheduleProgress.expectedCreditsToDate,132);
  assert.equal(result.scheduleProgress.expectedElectiveCredits,46);
  assert.equal(result.scheduleProgress.progressStatus,"ON_TRACK");
  assert.equal(result.scheduleProgress.currentPlanCredits,18);
});

test("GDQP requires all four distinct parts, accepts PDF/API credit differences and retakes cannot fill a missing part", () => {
  const attempts = [pass("QP2101D", 3), pass("QP2102D", 2), pass("QP2103D", 1.5), pass("QP2104D", 2)];
  assert.equal(assessCertificateRequirements(attempts).defense.status, "PASSED");
  assert.equal(assessCertificateRequirements([...attempts.slice(0, 3), pass("QP2101D", 3)]).defense.status, "NOT_PASSED");
});

test("GDTC recognizes three one-credit requirements and deduplicates alternatives/retakes", () => {
  const attempts = [pass("25TC1001"), pass("TC1001D"), pass("25TC2001"), pass("25TC2002")];
  assert.equal(assessCertificateRequirements(attempts).physical.status, "NOT_PASSED");
  assert.equal(assessCertificateRequirements(attempts).physical.recognizedCredits, 2);
  assert.equal(assessCertificateRequirements([...attempts, pass("25TC3003")]).physical.status, "PASSED");
  assert.equal(assessCertificateRequirements([pass("TC1001D", 0), pass("TC1002C"), pass("TC2003D")]).physical.status, "NOT_PASSED");
});

test("VT is failed even with a contradictory pending/pass flag; pending certificate requires all missing parts to be registered", () => {
  const vt = { courseCode: "QP2104D", isPass: true, notScore: true, scoreStatus: "pending", specialCode: "VT" };
  assert.equal(courseOutcome(vt), "failed");
  const attempts = [pass("QP2101D", 3), pass("QP2102D", 2), pass("QP2103D", 2)];
  assert.equal(assessCertificateRequirements([...attempts, vt]).defense.status, "NOT_PASSED");
  assert.equal(assessCertificateRequirements([...attempts, { courseCode: "QP2104D", notScore: true }]).defense.status, "PENDING");
});

test("forecast excludes conditional credits and a summer D resolves F without modifying either attempt", () => {
  const grades = [{ courseCode: "HP1", isPassed: false, scoreStatus: "graded", letterGrade: "F" }, { courseCode: "HP1", isPassed: true, scoreStatus: "graded", letterGrade: "D" }];
  const before = JSON.stringify(grades);
  const forecast = buildGraduationForecast({
    courses: [{ courseId: "1", courseCode: "HP1", courseName: "Academic", credits: 3, requirementType: "mandatory", semesterNo: 1 },
      { courseId: "2", courseCode: "25TC1001", courseName: "GDTC", credits: 1, requirementType: "mandatory", semesterNo: 1 }],
    grades, requiredCompulsoryCredits: 3, requiredElectiveCredits: 0, requiredTotalCredits: 3,
  });
  assert.equal(forecast.summary.completedCredits, 3);
  assert.equal(forecast.curriculumComplete, true);
  assert.equal(JSON.stringify(grades), before);
  assert.equal(buildGraduationForecast({ courses: [{ courseId: "1", courseCode: "HP1", courseName: "Academic", credits: 3, requirementType: "mandatory", semesterNo: 1 }], grades: [{ courseCode: "HP1", isPassed: false, specialCode: "VT", scoreStatus: "special" }], requiredCompulsoryCredits: 3, requiredElectiveCredits: 0, requiredTotalCredits: 3 }).failedCourses.length, 1);
});

test("semester registration and warning ratio exclude GDTC/GDQP but keep certificate-group completion", () => {
  const courses = [
    { courseId: "a", courseCode: "HP1", courseName: "Academic", credits: 3, requirementType: "mandatory", choiceGroupCode: null, isRegistrationRequired: true },
    { courseId: "p", courseCode: "25TC3001", courseName: "GDTC", credits: 1, requirementType: "elective", choiceGroupCode: "PHYSICAL:1", isRegistrationRequired: false },
  ];
  const result = evaluateProgress(courses, courses, false);
  assert.equal(result.mandatoryRegisteredCredits, 3);
  assert.equal(result.registeredElectiveCredits, 0);
  assert.equal(result.choiceGroupResults[0].status, "pass");
  const failed = calculateAssessmentTermFailedCredits("t", courses.map((c) => ({ offeringId: c.courseId, academicTermId: "t", credits: c.credits, courseCode: c.courseCode, scoreStatus: "graded", hasFinalGrade: true, isPass: false })));
  assert.equal(failed.registeredCredits, 3);
  assert.equal(failed.failedCredits, 3);
});

test("blank source IDs do not merge different courses", () => {
  const row = { StudentID: "S", StudyProgramID: "P", CurriculumID: "QP2101D", StudyUnitID: "", ScheduleStudyUnitID: "", Credits: "3" };
  assert.notEqual(gradeImportRowKey("2023-2024", "HK01", row), gradeImportRowKey("2023-2024", "HK01", { ...row, CurriculumID: "QP2102D" }));
});

test("conflicting programs for the same source attempt are rejected before any database write", async () => {
  const row = { StudentID: "S", CurriculumID: "HP1", StudyUnitID: "U", ScheduleStudyUnitID: "V", Credits: "3", CurriculumName: "Course" };
  await assert.rejects(GradesService.importGrades([{ NamHoc: "2025-2026", DanhSachDiem: [{ HocKy: "HK01", DanhSachDiemHK: [
    { ...row, StudyProgramID: "CQ23CT-PM" }, { ...row, StudyProgramID: "CQ23CT-MMT" },
  ] }] }]), (error: unknown) => error instanceof Error && "code" in error && error.code === "AMBIGUOUS_GRADE_ATTEMPT");
});

test("debt is computed at the supplied cutoff; pending retake retains F, summer D clears it", () => {
  const courses = [{ courseId: "1", courseCode: "HP1", courseName: "Academic", credits: 3, requirementType: "mandatory", semesterNo: 1 }];
  const failed = { courseCode: "HP1", credits: 3, isPass: false, scoreStatus: "graded", letterCode: "F" };
  assert.equal(calculateAcademicDebt([failed], courses, "CQ22CT-PM").accumulatedDebtCredits, 3);
  assert.equal(calculateAcademicDebt([failed, { courseCode: "HP1", credits: 3, notScore: true }], courses, "CQ22CT-PM").accumulatedDebtCredits, 3);
  assert.equal(calculateAcademicDebt([failed, pass("HP1", 3) as typeof failed], courses, "CQ22CT-PM").accumulatedDebtCredits, 0);
  assert.equal(failed.letterCode, "F");
});

test("unmatched final failures make debt partial; extra credits in one block do not settle another", () => {
  const courses = [
    { courseId: "a", courseCode: "20CT1103", courseName: "A6 elective", credits: 9, requirementType: "elective", semesterNo: 1 },
    { courseId: "b", courseCode: "20QT0001", courseName: "A7 elective", credits: 3, requirementType: "elective", semesterNo: 1 },
  ];
  const debt = calculateAcademicDebt([pass("20CT1103", 9) as { courseCode: string; credits: number }, { courseCode: "20QT0001", credits: 3, isPass: false, scoreStatus: "special", specialCode: "VT" }], courses, "CQ22CT-PM");
  assert.equal(debt.accumulatedDebtCredits, 3);
  const unknown = calculateAcademicDebt([{ courseCode: "OTHER", credits: 3, isPass: false, scoreStatus: "graded", letterCode: "F" }], courses, "CQ22CT-PM");
  assert.equal(unknown.dataStatus, "PARTIAL");
});
