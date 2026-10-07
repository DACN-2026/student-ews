import assert from "node:assert/strict";
import test from "node:test";
import { k44ElectiveAlternatives, k44ElectiveMembership } from "../lib/k44-elective-blocks";
import { calculateAcademicDebt, type DebtAttempt } from "../lib/services/academic-debt";
import { calculateAssessmentTermFailedCredits } from "../lib/services/academic-warning-capabilities";
import type { ForecastCourse } from "../lib/services/graduation-forecast";

const course = (code: string, credits = 3, requirementType = "elective", semesterNo = 2): ForecastCourse => ({ courseId: code, courseCode: code, courseName: code, credits, requirementType, semesterNo });
const passed = (code: string, credits = 3): DebtAttempt => ({ courseCode: code, credits, scoreStatus: "graded", letterCode: "D", score4: 1, isPass: true });
const failed = (code: string, credits = 3): DebtAttempt => ({ courseCode: code, credits, scoreStatus: "graded", letterCode: "F", score4: 0, isPass: false });
const hk4 = () => [course("LC2102D",2,"mandatory",4),course("20CT2201",4,"mandatory",4),course("20CT2203",4,"mandatory",4),course("20CT2204",3,"mandatory",4),
  ...["20NV0002","20QT0006","20SP0001"].map(code=>course(code,3,"elective",4))];
const mandatoryPasses = (courses: ForecastCourse[]) => courses.filter(item=>item.requirementType === "mandatory").map(item=>passed(item.courseCode,item.credits));

test("SHCD with no scores never blocks the academic failed-credit ratio", () => {
  const result = calculateAssessmentTermFailedCredits("t", [
    { offeringId: "f", academicTermId: "t", courseCode: "20CT4102D", credits: 3, scoreStatus: "graded", hasFinalGrade: true, isPass: false },
    { offeringId: "p", academicTermId: "t", courseCode: "20CT3103D", credits: 4, scoreStatus: "graded", hasFinalGrade: true, isPass: true },
    ...[1,2,3].map(part => ({ offeringId: `s${part}`, academicTermId: "t", courseCode: `SHCD-CD${part}`, credits: 0, scoreStatus: "pending", hasFinalGrade: false, isPass: null })),
  ]);
  assert.equal(result.dataStatus, "COMPLETE");
  assert.equal(result.registeredCredits, 7);
  assert.equal(result.failedCreditRatio, 3/7);
  assert.equal(result.distinctOfferingCount, 2);
});

test("K44 elective membership follows specialization lists, not a generic code prefix", () => {
  assert.equal(k44ElectiveMembership("20CT3103D", "CQ22CT-PM"), null);
  assert.equal(k44ElectiveMembership("20CT3103D", "CQ22CT-MMT")?.block, "B2");
  assert.equal(k44ElectiveMembership("20CT3113D", "CQ24CT-KHDL"), null);
  assert.equal(k44ElectiveMembership("20CT3113D", "CQ22CT-PM")?.block, "B2");
  assert.equal(k44ElectiveMembership("20CT3999D", "CQ22CT-PM"), null);
  assert.equal(k44ElectiveMembership("20CT3216", "CQ24CT-KHDL")?.requiredCredits, 26);
  assert.equal(k44ElectiveMembership("20CT3106D", "CQ22CT-PM")?.block, "B3");
});

test("replacement lists exclude the failed code and preserve specialization-specific choices", () => {
  const a7=k44ElectiveAlternatives("20NV0002","CQ22CT-PM")!;
  assert.equal(a7.block,"A7");
  assert.equal(a7.courses.length,4);
  assert.equal(a7.courses.some(course=>course.courseCode==="20NV0002"),false);
  assert.deepEqual(a7.courses.find(course=>course.courseCode==="20QT0001"),{courseCode:"20QT0001",courseName:"Kinh tế học đại cương",credits:3});
  const software=k44ElectiveAlternatives("20CT4104D","CQ22CT-PM")!;
  assert.equal(software.courses.length,11);
  assert.equal(software.courses.some(course=>course.courseCode==="20CT4104" || course.courseCode==="20CT3103" || course.courseCode==="20CT3124"),false);
  assert.equal(software.courses.find(course=>course.courseCode==="20CT3113")?.credits,4);
  assert.equal(k44ElectiveAlternatives("20CT3113D","CQ24CT-KHDL"),null);
  assert.equal(k44ElectiveAlternatives("UNKNOWN","CQ22CT-PM"),null);
});

test("every listed alternative has PDF metadata and belongs to the same verified block", () => {
  for (const program of ["CQ22CT-PM","CQ23CT-MMT","CQ24CT-KHDL"]) {
    for (const code of ["20CT1103","20NV0002","20CT3106",program.endsWith("-PM") ? "20CT4104D" : "20CT3103D"]) {
      const group=k44ElectiveAlternatives(code,program)!;
      for (const candidate of group.courses) {
        assert.ok(candidate.courseName.length>0,candidate.courseCode);
        assert.ok(candidate.credits>0,candidate.courseCode);
        assert.equal(k44ElectiveMembership(candidate.courseCode,program)?.block,group.block);
      }
    }
  }
});

test("replacement recommendations exclude all prior offerings regardless of results", () => {
  // These source offerings cover passed, F, VT, and pending/no-grade attempts.
  // Eligibility depends on having studied the course, not on its outcome.
  const studied = ["20NV0002", "20SP0001", "20QT0006"];
  const before = JSON.stringify(studied);
  const group = k44ElectiveAlternatives("20QT0001", "CQ22CT-PM", studied)!;
  assert.deepEqual(group.courses.map(course => course.courseCode), ["20QT0004"]);
  assert.equal(JSON.stringify(studied), before);
  assert.deepEqual(k44ElectiveAlternatives("20QT0001", "CQ22CT-PM", [...studied, "20QT0004"])?.courses, []);
});

test("studied source aliases exclude their PDF course from recommendations", () => {
  const a6 = k44ElectiveAlternatives("20CT1103", "CQ22CT-PM", ["TN1001D", "20TN2102", "20CT1203"])!;
  assert.deepEqual(a6.courses, []);
  const b3 = k44ElectiveAlternatives("20CT3106D", "CQ22CT-PM", ["20CT3107D"])!;
  assert.deepEqual(b3.courses.map(course => course.courseCode), ["20CT3108"]);
  // Unknown codes and courses from another block do not remove valid choices.
  const a7 = k44ElectiveAlternatives("20QT0001", "CQ22CT-PM", ["UNKNOWN", "20CT3107D"])!;
  assert.equal(a7.courses.length, 4);
});

test("meeting the semester's own choice quota leaves no local elective debt while preserving F", () => {
  const courses = hk4();
  const attempts = [...mandatoryPasses(courses),failed("20NV0002"),passed("20QT0006")];
  const before = JSON.stringify(attempts);
  const result = calculateAcademicDebt(attempts, courses, "CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits, 0);
  assert.deepEqual(result.semesterSurpluses?.[0], { semesterNo:4,plannedCredits:16,passedCredits:16,surplusCredits:0 });
  assert.deepEqual(result.replacements, []);
  assert.equal(JSON.stringify(attempts), before);
});

test("ordinary credits meeting HK4 cannot repay a different semester's A7 debt", () => {
  const courses=[...hk4(),course("20QT0001",3,"elective",3)];
  const attempts=[...mandatoryPasses(courses),passed("20QT0006"),failed("20QT0001")];
  const result=calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,3);
  assert.deepEqual(result.replacements,[]);
});

test("HK8 elective debt is the 2-credit local shortfall, not all 6 failed credits", () => {
  const courses=[course("20CT4101D",3,"mandatory",8),course("20CT4102D",3,"mandatory",8),course("20CT3113D",4,"elective",8),
    ...["20CT4104D","20CT4105D","20CT4106D","20CT4107D"].map(code=>course(code,3,"elective",8))];
  const result=calculateAcademicDebt([...mandatoryPasses(courses),passed("20CT3113D",4),passed("20CT4105D"),passed("20CT4106D"),failed("20CT4104D"),failed("20CT4107D")],courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,2);
  assert.deepEqual(result.electiveSelections?.[0],{semesterNo:8,requiredCredits:12,passedCredits:10,failedCredits:6,initialDebtCredits:2,remainingDebtCredits:2,failedCourseCodes:["20CT4104D","20CT4107D"]});
  assert.deepEqual(result.replacements,[]);
});

test("the mixed HK3 pool accepts same-block surplus without allocating its quota twice", () => {
  const courses=[...hk4(),course("LC1102D",2,"mandatory",2),course("20CT1202",4,"mandatory",2),course("20TN1202",4,"mandatory",2),
    course("20CT1103",3,"elective",2),course("20CT1203",3,"elective",2),course("20TN1001",3,"elective",2),
    ...["20TN2102","20QT0001","20QT0004"].map(code=>course(code,3,"elective",3))];
  const attempts=[...mandatoryPasses(courses),passed("20CT1103"),passed("20CT1203"),passed("20TN1201"),passed("20QT0006"),passed("20SP0001"),
    failed("20TN2102"),failed("20QT0001"),failed("20QT0004")];
  const before=JSON.stringify(attempts);
  const result=calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.dataStatus,"COMPLETE");
  assert.equal(result.accumulatedDebtCredits,0);
  assert.equal(result.electiveSelections?.[0].initialDebtCredits,6);
  assert.equal(result.electiveSelections?.[0].failedCredits,9);
  assert.equal(result.replacements?.reduce((sum,row)=>sum+row.settledDebtCredits,0),6);
  assert.equal(result.replacements?.find(row=>row.block==="A6")?.settledCourses[0].courseCode,"20TN2102");
  assert.equal(JSON.stringify(attempts),before);
});

test("only the 3 surplus HK4 credits can settle A7 debt; failed history stays intact", () => {
  const courses = [...hk4(),course("20QT0001",3,"elective",3),course("20QT0004",3,"elective",3)];
  const attempts = [...mandatoryPasses(courses),failed("20NV0002"),failed("20QT0001"),failed("20QT0004"),passed("20QT0006"),passed("20SP0001")];
  const before = JSON.stringify(attempts);
  const result = calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,3);
  assert.equal(result.electiveBlocks?.[0].failedCredits,9);
  assert.equal(result.replacements?.reduce((sum,row)=>sum+row.settledDebtCredits,0),3);
  assert.equal(result.replacements?.[0].semesterNo,4);
  assert.deepEqual(result.replacements?.[0].settledCourses,[{courseCode:"20QT0001",credits:3}]);
  assert.equal(JSON.stringify(attempts),before);
});

test("extra choices cannot donate credits when a compulsory failure leaves the semester below plan", () => {
  const courses = [...hk4(),course("20QT0001",3,"elective",3)];
  const attempts = [...mandatoryPasses(courses).filter(row=>row.courseCode!=="20CT2201"),failed("20CT2201",4),failed("20NV0002"),failed("20QT0001"),passed("20QT0006"),passed("20SP0001")];
  const result = calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.semesterSurpluses?.find(row=>row.semesterNo===4)?.passedCredits,15);
  assert.equal(result.accumulatedDebtCredits,7);
  assert.deepEqual(result.replacements,[]);
});

test("repeated passes and code variants do not duplicate the semester surplus or replacement", () => {
  const courses = [...hk4(),course("20QT0001",3,"elective",3),course("20QT0004",3,"elective",3)];
  const attempts = [...mandatoryPasses(courses),failed("20QT0001"),failed("20QT0004"),failed("20NV0002"),passed("20QT0006"),passed("20QT0006"),passed("20SP0001"),passed("20SP0001")];
  const result = calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,3);
  assert.equal(result.semesterSurpluses?.find(row=>row.semesterNo===4)?.surplusCredits,3);
  assert.equal(result.replacements?.length,1);
});

test("a 4-credit course inside a 3-credit quota is not a whole surplus course", () => {
  const courses = [course("20TN3111",3,"mandatory",6),course("20CT3112",3,"mandatory",6),course("20CT3113D",4,"mandatory",6),
    course("20CT3106D",3,"elective",6),course("20CT3103D",4,"elective",6),course("20CT3214",3,"elective",7)];
  const attempts = [...mandatoryPasses(courses),passed("20CT3106D"),passed("20CT3103D",4),failed("20CT3214")];
  const result = calculateAcademicDebt(attempts,courses,"CQ24CT-KHDL");
  assert.equal(result.semesterSurpluses?.[0].surplusCredits,1);
  assert.equal(result.accumulatedDebtCredits,3);
  assert.deepEqual(result.replacements,[]);
});

test("B2 extra credits cannot settle B3 or a compulsory failure", () => {
  const courses = [course("20CT4101D",3,"mandatory",8),course("20CT4102D",3,"mandatory",8),
    ...["20CT4104D","20CT4105D","20CT4106D","20CT4107D"].map(code=>course(code,3,"elective",8)),course("20CT3113D",4,"elective",8),
    course("20CT3106D",3,"elective",6),course("20CT3201",3,"mandatory",7)];
  const attempts = [...mandatoryPasses(courses).filter(row=>row.courseCode!=="20CT3201"),
    ...courses.filter(row=>row.semesterNo===8 && row.requirementType==="elective").map(row=>passed(row.courseCode,row.credits)),failed("20CT3106D"),failed("20CT3201")];
  const result = calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits, 6);
  assert.equal(result.semesterSurpluses?.find(row=>row.semesterNo===8)?.surplusCredits,4);
  assert.deepEqual(result.replacements,[]);
});

test("a whole 4-credit surplus donor can settle only 4 credits across outstanding B2 failures", () => {
  const courses = [course("20CT4101D",3,"mandatory",8),course("20CT4102D",3,"mandatory",8),
    ...["20CT4104D","20CT4105D","20CT4106D","20CT4107D"].map(code=>course(code,3,"elective",8)),course("20CT3113D",4,"elective",8),
    course("20CT3206",3,"elective",7),course("20CT3207",3,"elective",7)];
  const attempts = [...mandatoryPasses(courses),...courses.filter(row=>row.semesterNo===8 && row.requirementType==="elective").map(row=>passed(row.courseCode,row.credits)),failed("20CT3206"),failed("20CT3207")];
  const result = calculateAcademicDebt(attempts,courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,2);
  assert.equal(result.replacements?.length,1);
  assert.equal(result.replacements?.[0].donorCourseCode,"20CT3113D");
  assert.equal(result.replacements?.[0].settledDebtCredits,4);
  assert.equal(result.replacements?.[0].settledCourses.reduce((sum,row)=>sum+row.credits,0),4);
});

test("summer pass of the corresponding elective settles its own F even without semester surplus", () => {
  const courses=hk4();
  const original=failed("20NV0002");
  const before=[...mandatoryPasses(courses),original];
  assert.equal(calculateAcademicDebt(before,courses,"CQ22CT-PM").accumulatedDebtCredits,3);
  const after=calculateAcademicDebt([...before,passed("20NV0002")],courses,"CQ22CT-PM");
  assert.equal(after.accumulatedDebtCredits,0);
  assert.equal(after.semesterSurpluses?.[0].surplusCredits,0);
  assert.deepEqual(after.replacements,[]);
  assert.equal(original.letterCode,"F");
});

test("pending and VT alternatives cannot generate surplus credits", () => {
  const courses=[...hk4(),course("20QT0001",3,"elective",3)];
  const result=calculateAcademicDebt([...mandatoryPasses(courses),failed("20QT0001"),failed("20NV0002"),passed("20QT0006"),
    {...passed("20SP0001"),specialCode:"VT",scoreStatus:"pending",notScore:true}],courses,"CQ22CT-PM");
  assert.equal(result.accumulatedDebtCredits,3);
  assert.equal(result.semesterSurpluses?.find(row=>row.semesterNo===4)?.surplusCredits,0);
  assert.deepEqual(result.replacements,[]);
});

test("a missing teaching semester plan cannot silently prove replacement eligibility", () => {
  const courses=[course("20CT3214",3,"elective",7),course("20CT3215",3,"elective",7)];
  const result=calculateAcademicDebt([failed("20CT3214"),passed("20CT3215")],courses,"CQ24CT-KHDL");
  assert.equal(result.accumulatedDebtCredits,3);
  assert.equal(result.dataStatus,"PARTIAL");
  assert.equal(result.reasonCode,"ELECTIVE_REPLACEMENT_PLAN_MISSING");
});

test("conflicting aliases of one curriculum elective cannot silently create replacement credits", () => {
  const result=calculateAcademicDebt([failed("20CT3106D"),passed("20CT3107D")],
    [course("20CT3106D",3,"elective",6),course("20CT3107D",3,"elective",5),course("20CT3107",4,"elective",5)],"CQ22CT-PM");
  assert.equal(result.dataStatus,"PARTIAL");
  assert.equal(result.accumulatedDebtCredits,3);
});

test("an unknown code or same-name course cannot silently replace a K44 elective", () => {
  const result = calculateAcademicDebt([{...failed("UNKNOWN"),courseName:"Same name"}],[{...course("20QT0006"),courseName:"Same name"}],"CQ22CT-PM");
  assert.equal(result.dataStatus,"PARTIAL");
  const invalid = calculateAcademicDebt([failed("20CT3999D")],[course("20CT3999D")],"CQ22CT-PM");
  assert.equal(invalid.dataStatus,"PARTIAL");
});

test("a pending retake retains debt; a summer D resolves it without mutating history", () => {
  const courses=[course("20CT4102D",3,"mandatory")];
  const before=failed("20CT4102D");
  assert.equal(calculateAcademicDebt([before,{courseCode:before.courseCode,credits:3,notScore:true}],courses,"CQ22CT-PM").accumulatedDebtCredits,3);
  assert.equal(calculateAcademicDebt([before,passed(before.courseCode)],courses,"CQ22CT-PM").accumulatedDebtCredits,0);
  assert.equal(before.letterCode,"F");
});
