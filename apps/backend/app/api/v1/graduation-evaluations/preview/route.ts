import { NextRequest } from "next/server";
import { GraduationEvaluationsService } from "@/lib/services/graduation-evaluations";
import { requireProgressScopePermission } from "@/lib/auth/data-scope";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<{
      cohortId?: unknown;
      trainingProgramId?: unknown;
      assessmentAcademicTermId?: unknown;
      specialization?: unknown;
      targetType?: unknown;
    }>(request, 256 * 1024);
    if (
      typeof body.cohortId !== "string" ||
      typeof body.trainingProgramId !== "string" ||
      typeof body.assessmentAcademicTermId !== "string"
    ) {
      return errorResponse("Evaluation scope is required", "INVALID_REQUEST", 400);
    }
    const auth = await requireProgressScopePermission(request, {
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      academicTermId: body.assessmentAcademicTermId,
    }, "graduation.read");
    if (!auth.authorized) return auth.response;
    return jsonResponse(await GraduationEvaluationsService.preview({
      cohortId: body.cohortId,
      trainingProgramId: body.trainingProgramId,
      assessmentAcademicTermId: body.assessmentAcademicTermId,
      specialization: typeof body.specialization === "string" ? body.specialization : null,
      targetType: typeof body.targetType === "string" ? body.targetType : undefined,
    }));
  } catch (error) {
    return apiErrorResponse(error, "Graduation evaluation preview failed");
  }
}
