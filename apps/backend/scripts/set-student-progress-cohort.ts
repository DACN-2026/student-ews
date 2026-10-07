import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { studentProgressCohort } from "../lib/student-progress-cohort";
async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args[args.indexOf(name) + 1];
  const studentCode = value("--student"), cohortCode = value("--cohort"), fromYear = value("--from-year");
  assert.ok(args.includes("--student") && args.includes("--cohort") && args.includes("--from-year"),"Required: --student CODE --cohort Kxx --from-year YYYY-YYYY [--apply]");
  assert.equal(studentProgressCohort({progressCohortCode:cohortCode,progressCohortFromYear:fromYear},fromYear),cohortCode,"Invalid cohort/year");
  const student = await prisma.student.findFirstOrThrow({where:{sStudentId:studentCode,deletedAt:null}});
  await prisma.cohort.findFirstOrThrow({where:{sCohortCode:cohortCode,deletedAt:null}});
  const identity = {class:student.sClassStudentId,program:student.sStudyProgramId};
  const hashes = () => prisma.$queryRaw<Array<{offerings:string;grades:string}>>`
    SELECT (SELECT md5(string_agg(to_jsonb(o)::text, '' ORDER BY o.id)) FROM student_course_offerings o) AS offerings,
           (SELECT md5(string_agg(to_jsonb(g)::text, '' ORDER BY g.offering_id)) FROM student_course_grades g) AS grades`;
  const before = await hashes();
  if (args.includes("--apply")) await prisma.student.update({where:{id:student.id},data:{progressCohortCode:cohortCode,progressCohortFromYear:fromYear}});
  const after = await prisma.student.findUniqueOrThrow({where:{id:student.id}});
  assert.deepEqual({class:after.sClassStudentId,program:after.sStudyProgramId},identity);
  assert.deepEqual(await hashes(),before,"Source offerings/grades must stay unchanged");
  console.log(JSON.stringify({applied:args.includes("--apply"),studentCode,class:after.sClassStudentId,program:after.sStudyProgramId,progressCohortCode:after.progressCohortCode,fromYear:after.progressCohortFromYear,sourceOfferingsAndGradesUnchanged:true}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
