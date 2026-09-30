import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/utils/api-error";

export type CohortTrainingProgramPair = {
  cohortId: string;
  trainingProgramId: string;
};

export function cohortTrainingProgramKey(pair: CohortTrainingProgramPair) {
  return `${pair.cohortId}:${pair.trainingProgramId}`;
}

/**
 * TrainingProgressPlan is the authoritative relation between a student cohort
 * and the curriculum that belongs to that cohort. Codes such as K46/CQ22 are
 * deliberately not parsed or guessed at runtime.
 */
export async function assertCohortTrainingProgramPair(pair: CohortTrainingProgramPair) {
  const configuredPair = await prisma.trainingProgressPlan.findFirst({
    where: {
      cohortId: pair.cohortId,
      trainingProgramId: pair.trainingProgramId,
    },
    select: { id: true },
  });
  if (!configuredPair) {
    throw new ApiError(
      "Khóa sinh viên không thuộc chương trình đào tạo đã chọn.",
      "COHORT_TRAINING_PROGRAM_MISMATCH",
      422,
    );
  }
  return configuredPair;
}
