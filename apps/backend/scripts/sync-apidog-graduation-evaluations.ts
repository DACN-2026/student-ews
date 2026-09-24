import { PrismaClient } from "@prisma/client";
import { GraduationEvaluationsService } from "../lib/services/graduation-evaluations";

const prisma = new PrismaClient();

const DEFAULT_GRADUATION_RULES = [
  {
    ruleCode: "PROGRAM_COMPLETION",
    ruleName: "Hoàn thành cấu trúc chương trình đào tạo",
    ruleType: "CURRICULUM",
    operator: "=",
    requiredValue: "PASSED",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Quy chế đào tạo, Chương IV, Điều 27",
    status: "active",
  },
  {
    ruleCode: "CUMULATIVE_GPA",
    ruleName: "Điểm trung bình tích lũy hệ 4",
    ruleType: "GPA",
    operator: ">=",
    requiredValue: "2.00",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Quy chế đào tạo, Chương IV, Điều 27",
    status: "active",
  },
  {
    ruleCode: "WHOLE_COURSE_TRAINING",
    ruleName: "Có kết quả rèn luyện toàn khóa",
    ruleType: "DATA",
    operator: "EXISTS",
    requiredValue: "AVAILABLE",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Quy định đánh giá kết quả rèn luyện sinh viên Trường Đại học Đà Lạt",
    status: "active",
  },
  {
    ruleCode: "TOTAL_CREDITS",
    ruleName: "Tổng tín chỉ tích lũy",
    ruleType: "CREDIT",
    operator: ">=",
    requiredValue: "150",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Khung chương trình đào tạo đại học",
    status: "active",
  },
  {
    ruleCode: "COMPULSORY_CREDITS",
    ruleName: "Tín chỉ bắt buộc",
    ruleType: "CREDIT",
    operator: ">=",
    requiredValue: "104",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Khung chương trình đào tạo đại học",
    status: "active",
  },
  {
    ruleCode: "ELECTIVE_CREDITS",
    ruleName: "Tín chỉ tự chọn",
    ruleType: "CREDIT",
    operator: ">=",
    requiredValue: "46",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Khung chương trình đào tạo đại học",
    status: "active",
  },
  {
    ruleCode: "PHYSICAL_EDUCATION",
    ruleName: "Chứng chỉ Giáo dục thể chất",
    ruleType: "CERTIFICATE",
    operator: "=",
    requiredValue: "PASSED",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Quy định chuẩn đầu ra Giáo dục thể chất",
    status: "active",
  },
  {
    ruleCode: "NATIONAL_DEFENSE",
    ruleName: "Chứng chỉ Giáo dục quốc phòng và an ninh",
    ruleType: "CERTIFICATE",
    operator: "=",
    requiredValue: "PASSED",
    version: "REGULATION-BASE-v1",
    sourceDocument: "Quy định chuẩn đầu ra Giáo dục quốc phòng - an ninh",
    status: "active",
  },
];

async function ensureDefaultGraduationRules() {
  for (const rule of DEFAULT_GRADUATION_RULES) {
    const existing = await prisma.graduationRule.findFirst({
      where: {
        trainingProgramId: null,
        cohortId: null,
        ruleCode: rule.ruleCode,
      },
    });
    if (!existing) {
      await prisma.graduationRule.create({
        data: {
          trainingProgramId: null,
          cohortId: null,
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          ruleType: rule.ruleType,
          operator: rule.operator,
          requiredValue: rule.requiredValue,
          version: rule.version,
          sourceDocument: rule.sourceDocument,
          status: rule.status,
        },
      });
    }
  }
}

async function main() {
  await ensureDefaultGraduationRules();
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
      select: { id: true, evaluationCode: true },
    });
    if (existing && !force) {
      skipped++;
      console.log(`Skip ${existing.evaluationCode}: evaluation already exists for this scope.`);
      continue;
    }

    const staleEvals = await prisma.graduationEvaluation.findMany({
      where: {
        cohortId: run.cohortId,
        trainingProgramId: run.trainingProgramId,
        assessmentAcademicTermId: run.assessmentAcademicTermId,
      },
      select: { id: true },
    });
    for (const stale of staleEvals) {
      const studentIds = (
        await prisma.graduationEvaluationStudent.findMany({
          where: { evaluationId: stale.id },
          select: { id: true },
        })
      ).map((s) => s.id);
      if (studentIds.length) {
        await prisma.graduationEvaluationDetail.deleteMany({
          where: { evaluationStudentId: { in: studentIds } },
        });
        await prisma.graduationEvaluationStudent.deleteMany({
          where: { evaluationId: stale.id },
        });
      }
      await prisma.graduationEvaluation.delete({ where: { id: stale.id } });
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
