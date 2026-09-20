import { NextRequest } from "next/server";
import { GraduationEvaluationsService } from "@/lib/services/graduation-evaluations";
import { requireGraduationEvaluationPermission, requireStudentPermission } from "@/lib/auth/data-scope";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evaluationId: string; studentId: string }> },
) {
  try {
    const { evaluationId, studentId } = await params;
    const evaluationAuth = await requireGraduationEvaluationPermission(request, evaluationId, "graduation.read");
    if (!evaluationAuth.authorized) return evaluationAuth.response;
    const studentAuth = await requireStudentPermission(request, studentId, "graduation.read");
    if (!studentAuth.authorized) return studentAuth.response;
    const result = await GraduationEvaluationsService.getStudent(evaluationId, studentId);
    if (!result) return errorResponse("Student evaluation not found", "NOT_FOUND", 404);
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load graduation student evaluation");
  }
}
