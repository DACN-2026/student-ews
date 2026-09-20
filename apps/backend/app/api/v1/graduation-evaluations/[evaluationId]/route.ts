import { NextRequest } from "next/server";
import { GraduationEvaluationsService } from "@/lib/services/graduation-evaluations";
import { requireGraduationEvaluationPermission } from "@/lib/auth/data-scope";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    const { evaluationId } = await params;
    const auth = await requireGraduationEvaluationPermission(request, evaluationId, "graduation.read");
    if (!auth.authorized) return auth.response;
    const evaluation = await GraduationEvaluationsService.getEvaluation(evaluationId);
    if (!evaluation) return errorResponse("Graduation evaluation not found", "NOT_FOUND", 404);
    return jsonResponse(evaluation);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load graduation evaluation");
  }
}
