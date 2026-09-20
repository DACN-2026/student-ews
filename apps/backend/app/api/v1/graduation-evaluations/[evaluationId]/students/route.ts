import { NextRequest } from "next/server";
import { GraduationEvaluationsService, GRADUATION_STATUSES } from "@/lib/services/graduation-evaluations";
import { graduationEvaluationClassScope, requireGraduationEvaluationPermission } from "@/lib/auth/data-scope";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ evaluationId: string }> }) {
  try {
    const { evaluationId } = await params;
    const auth = await requireGraduationEvaluationPermission(request, evaluationId, "graduation.read");
    if (!auth.authorized) return auth.response;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    if (status && !GRADUATION_STATUSES.includes(status as (typeof GRADUATION_STATUSES)[number])) {
      return errorResponse("Invalid graduation status", "INVALID_FILTER", 400);
    }
    const { page, pageSize } = parsePagination(searchParams);
    return jsonResponse(await GraduationEvaluationsService.listStudents(evaluationId, {
      status,
      keyword: searchParams.get("keyword")?.trim() || undefined,
      classId: searchParams.get("classId") || undefined,
    }, page, pageSize, await graduationEvaluationClassScope(auth.actor, evaluationId)));
  } catch (error) {
    return apiErrorResponse(error, "Failed to list graduation evaluation students");
  }
}
