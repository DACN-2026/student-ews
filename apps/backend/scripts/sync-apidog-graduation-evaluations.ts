import { PrismaClient } from "@prisma/client";
import { GraduationEvaluationsService } from "../lib/services/graduation-evaluations";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  const completionRuns = await prisma.trainingProgressCompletionRun.findMany({
    where: {
      status: "completed",
      evaluationMode: "standard",
      publicationStatus: "active",
    },
    orderBy: { completedAt: "desc" },
  });
  const uniqueScopes = new Map<string, (typeof completionRuns)[number]>();
  for (const run of completionRuns) {
    const key = `${run.cohortId}:${run.trainingProgramId}:${run.assessmentAcademicTermId}`;
    if (!uniqueScopes.has(key)) uniqueScopes.set(key, run);
  }

  let created = 0;
  let skipped = 0;
  for (const run of uniqueScopes.values()) {
    const existing = await prisma.graduationEvaluation.findFirst({
      where: {
        cohortId: run.cohortId,
        trainingProgramId: run.trainingProgramId,
        assessmentAcademicTermId: run.assessmentAcademicTermId,
        status: "completed",
      },
      select: { evaluationCode: true },
    });
    if (existing && !force) {
      skipped++;
      console.log(`Skip ${existing.evaluationCode}: evaluation already exists for this scope.`);
      continue;
    }
    const evaluation = await GraduationEvaluationsService.createEvaluation({
      cohortId: run.cohortId,
      trainingProgramId: run.trainingProgramId,
      assessmentAcademicTermId: run.assessmentAcademicTermId,
      targetType: "all_students",
      evaluatedBy: null,
    });
    created++;
    console.log(`${evaluation.evaluationCode}: ${evaluation.totalStudents} students, ${evaluation.manualReviewStudents} require review.`);
  }
  console.log(`Graduation evaluation sync completed: ${created} created, ${skipped} skipped.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
