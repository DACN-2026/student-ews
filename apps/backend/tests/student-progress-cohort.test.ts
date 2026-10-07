import assert from "node:assert/strict";
import test from "node:test";
import { inferStudentProgressCohort } from "../lib/student-progress-cohort";
const course=(code:string,semesterNo:number,requirementType="mandatory")=>({courseCode:code,courseName:code,semesterNo,credits:3,requirementType});
const curriculum=[...Array.from({length:3},(_,n)=>course(`PREV${n}`,4)),...Array.from({length:3},(_,n)=>course(`NOW${n}`,5)),...Array.from({length:3},(_,n)=>course(`FINAL${n}`,9))];
const registration=(courseCode:string,academicYear:string,termCode="HK01")=>({courseCode,academicYear,termCode,credits:3});
const previous=curriculum.filter(c=>c.semesterNo===4).map(c=>registration(c.courseCode,"2025-2026","HK02"));
const current=curriculum.filter(c=>c.semesterNo===5).map(c=>registration(c.courseCode,"2026-2027"));
const input={administrativeCohortCode:"K47",programCode:"TEST",currentAcademicYear:"2026-2027",currentTermCode:"HK01",curriculum,registrations:[...previous,...current]};

test("a complete first-time semester and consecutive registration sequence infer a delayed study schedule",()=>{
 assert.deepEqual(inferStudentProgressCohort(input),{cohortCode:"K48",anchorAcademicYear:"2026-2027",anchorTermCode:"HK01",anchorSemesterNo:5,delayedYears:1,evidence:"CONTINUING_SEQUENCE"});
 assert.equal(inferStudentProgressCohort({...input,curriculum:curriculum.map(c=>({...c,requirementType:"Bắt buộc"}))})?.cohortCode,"K48");
});
test("a break in two main terms supports inference; summer retakes do not erase the break",()=>{
 const older=previous.map(r=>({...r,academicYear:"2024-2025"}));
 const result=inferStudentProgressCohort({...input,registrations:[...older,registration("PREV0","2025-2026","HK03"),...current]});
 assert.equal(result?.cohortCode,"K48");assert.equal(result?.evidence,"MAIN_TERM_BREAK");
});
test("an isolated late course or incomplete mandatory semester does not establish a shifted schedule",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...previous,current[0]]}),null);
 assert.equal(inferStudentProgressCohort({...input,registrations:[...previous,...current.slice(0,2)]}),null);
});
test("retaking an entire old semester never creates an inferred schedule",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...current.map(r=>({...r,academicYear:"2025-2026"})),...previous,...current]}),null);
});
test("mixed old/new semester courses cannot create a schedule from the newest row alone",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...input.registrations,registration("FINAL0","2026-2027")]}),null);
});
test("unmapped courses and missing year/term context block an unsupported inference",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...input.registrations,registration("UNKNOWN","2026-2027")]}),null);
 assert.equal(inferStudentProgressCohort({...input,registrations:current.map(r=>({...r,academicYear:""}))}),null);
});
test("conditional activities do not affect the inferred schedule",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...input.registrations,{...registration("SHCD-CK2","2026-2027"),credits:0},{...registration("QP2101D","2026-2027"),credits:3}]})?.cohortCode,"K48");
});
test("finalized registration evidence survives the next unregistered term and later retakes",()=>{
 assert.equal(inferStudentProgressCohort({...input,currentTermCode:"HK02"})?.cohortCode,"K48");
 assert.equal(inferStudentProgressCohort({...input,currentTermCode:"HK02",registrations:[...input.registrations,registration("NOW0","2026-2027","HK02")]})?.cohortCode,"K48");
});
test("later first-time study aligned with the administrative cohort supersedes an old inferred schedule",()=>{
 assert.equal(inferStudentProgressCohort({...input,currentAcademicYear:"2027-2028",registrations:[...input.registrations,...curriculum.filter(c=>c.semesterNo===9).map(c=>registration(c.courseCode,"2027-2028"))]}),null);
});
test("future offerings and unsupported half-year gaps are not used to shift a cohort",()=>{
 assert.equal(inferStudentProgressCohort({...input,registrations:[...input.registrations,registration("FINAL0","2027-2028")]})?.cohortCode,"K48");
 assert.equal(inferStudentProgressCohort({...input,curriculum:curriculum.map(c=>({...c,semesterNo:c.semesterNo===5?6:c.semesterNo}))}),null);
});
