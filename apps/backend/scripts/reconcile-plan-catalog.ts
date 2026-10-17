import assert from "node:assert/strict";
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { prisma } from "../lib/prisma";
import { loadProgramCurriculum } from "../lib/services/program-curriculum";
import { reconcilePlanCourseSnapshots } from "../lib/services/plan-course-snapshot";

const apply = process.argv.includes("--apply");
const reportPath = `../../docs/reports/plan-configuration-reconciliation-${apply ? "applied" : "plan"}-2026-10-17.json`;

async function fingerprints() {
  return prisma.$queryRawUnsafe<Array<{ source: string; count: number; hash: string }>>(`
    SELECT 'grades' source,count(*)::int count,md5(string_agg(row_to_json(t)::text,'|' ORDER BY offering_id)) hash FROM student_course_grades t
    UNION ALL SELECT 'offerings',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM student_course_offerings t
    UNION ALL SELECT 'summaries',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM student_term_summaries t
    UNION ALL SELECT 'unscoped',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM unscoped_grade_records t
    UNION ALL SELECT 'decisions',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM student_decisions t
    UNION ALL SELECT 'students',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM students t
    UNION ALL SELECT 'catalog',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM courses t
    UNION ALL SELECT 'programs',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM training_programs t
    UNION ALL SELECT 'curriculum',count(*)::int,md5(string_agg(row_to_json(t)::text,'|' ORDER BY id)) FROM training_program_courses t ORDER BY source`);
}

async function main() {
  const [plans, catalog, programs, cohorts] = await Promise.all([
    prisma.trainingProgressPlan.findMany({ where: { status: { not: "archived" } }, orderBy: { id: "asc" } }),
    prisma.course.findMany({ where: { deletedAt: null } }), prisma.trainingProgram.findMany(), prisma.cohort.findMany(),
  ]);
  const rows = await prisma.trainingProgressPlanCourse.findMany({ where: { planId: { in: plans.map(p => p.id) } }, orderBy: { id: "asc" } });
  const prepared = [];
  for (const plan of plans) {
    const program = programs.find(p => p.id === plan.trainingProgramId)!;
    const curriculum = await loadProgramCurriculum(program.id);
    const original = rows.filter(r => r.planId === plan.id);
    const proposal = reconcilePlanCourseSnapshots(original, catalog, curriculum, plan.curriculumSemesterNo);
    prepared.push({ plan, original, proposal, programCode: program.sProgramCode, cohortCode: cohorts.find(c => c.id === plan.cohortId)?.sCohortCode });
  }
  const sourceBefore = await fingerprints();
  const changes = prepared.filter(item => item.proposal.changes.length);
  const blockers = prepared.flatMap(item => item.proposal.issues.map(message => ({ planId: item.plan.id, programCode: item.programCode, message })));
  const summary = { inspectedPlans: plans.length, changedPlans: changes.length, changedCourseSnapshots: changes.reduce((sum,item) => sum + item.proposal.changes.length,0), blockers };
  const details = changes.map(item => ({ previousPlanId: item.plan.id, cohort: item.cohortCode, program: item.programCode,
    semesterNo: item.plan.curriculumSemesterNo, originalStatus: item.plan.status, originalVersion: item.plan.version, changes: item.proposal.changes }));
  if (!apply) {
    writeFileSync(reportPath, JSON.stringify({ checkedAt: new Date().toISOString(), applied: false, ...summary, sourceFingerprint: sourceBefore, plans: details }, null, 2) + "\n");
    console.log(JSON.stringify(summary, null, 2)); return;
  }
  assert.equal(blockers.length,0,"Some snapshots lack exact same-ID curriculum evidence; no plans were changed");
  if (!changes.length) { console.log("All active/draft plan snapshots already match their catalog IDs. No changes."); return; }
  const batchId = crypto.randomUUID();
  const created = await prisma.$transaction(async tx => {
    const output = [];
    for (const item of changes) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${item.plan.cohortId}:${item.plan.trainingProgramId}:${item.plan.academicTermId}`}))`;
      const current = await tx.trainingProgressPlan.findUniqueOrThrow({ where: { id: item.plan.id } });
      const currentRows = await tx.trainingProgressPlanCourse.findMany({ where: { planId: current.id }, orderBy: { id: "asc" } });
      assert.deepEqual(current,item.plan,"Plan changed since inspection");
      assert.deepEqual(currentRows,item.original,"Plan courses changed since inspection");
      const currentCatalog = await tx.course.findMany({ where: { id: { in: item.original.map(r => r.courseId) }, deletedAt: null } });
      for (const row of item.proposal.changes) {
        const source = currentCatalog.find(c => c.id === row.courseId);
        assert.equal(source?.sCourseCode,row.afterCode); assert.equal(source?.sCourseName,row.afterName);
      }
      const lastVersion = await tx.trainingProgressPlan.findFirst({ where: { cohortId: current.cohortId, trainingProgramId: current.trainingProgramId, academicTermId: current.academicTermId }, orderBy: { version: "desc" } });
      // Release the unique current-plan slot inside the same transaction. If
      // creating its replacement fails, the archive operation rolls back too.
      await tx.trainingProgressPlan.update({ where: { id: current.id }, data: { status: "archived", isCurrent: false } });
      const replacement = await tx.trainingProgressPlan.create({ data: {
        cohortId: current.cohortId, trainingProgramId: current.trainingProgramId, academicYearId: current.academicYearId,
        academicTermId: current.academicTermId, curriculumSemesterNo: current.curriculumSemesterNo,
        version: (lastVersion?.version ?? 0) + 1, status: current.status, isCurrent: current.isCurrent,
        requiredElectiveCredits: current.requiredElectiveCredits, is_program_final: current.is_program_final,
        cloneBatchId: batchId, clonedFromPlanId: current.id, clonedFromProgramId: current.trainingProgramId,
      } });
      await tx.trainingProgressPlanCourse.createMany({ data: item.proposal.courses.map(row => ({
        planId: replacement.id, courseId: row.courseId, sCourseCode: row.sCourseCode, sCourseName: row.sCourseName,
        sCredits: row.sCredits, requirementType: row.requirementType, choiceGroupCode: row.choiceGroupCode, isRegistrationRequired: row.isRegistrationRequired,
      })) });
      output.push({ previousPlanId: current.id, planId: replacement.id, previousVersion: current.version, version: replacement.version,
        cohortId: current.cohortId, trainingProgramId: current.trainingProgramId, academicTermId: current.academicTermId,
        status: replacement.status, isCurrent: replacement.isCurrent, changedSnapshots: item.proposal.changes.length });
    }
    await tx.auditLog.create({ data: { action: "training_plan.catalog_snapshot.reconcile", resourceType: "TrainingProgressPlan",
      details: { batchId, sameCourseIds: true, sourceRecordsModified: false, plans: output, correctedSnapshots: details } } });
    return output;
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 60000 });
  const sourceAfter = await fingerprints();
  assert.deepEqual(sourceAfter,sourceBefore,"Source data changed during reconciliation");
  writeFileSync(reportPath, JSON.stringify({ checkedAt: new Date().toISOString(), applied: true, batchId, ...summary,
    sameCourseIds: true, creditRequirementsUnchanged: true, sourceUnchanged: true, sourceBefore, sourceAfter, plans: details, created }, null, 2) + "\n");
  console.log(JSON.stringify({ ...summary, sourceUnchanged: true, createdVersions: created.length }, null, 2));
}
main().finally(() => prisma.$disconnect());
