import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { progressPlanScopeWhere, runClassScopes } from "@/lib/auth/data-scope";
import { TrainingProgressService } from "@/lib/services/training-progress";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("progress.read", request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = request.nextUrl;
    const { page, pageSize } = parsePagination(searchParams);
    const result = await TrainingProgressService.listRegistrationRuns(
      searchParams.get("cohortId") || undefined,
      searchParams.get("trainingProgramId") || undefined,
      searchParams.get("academicTermId") || searchParams.get("termId") || undefined,
      searchParams.get("planId") || undefined,
      page,
      pageSize,
      await progressPlanScopeWhere(auth.actor),
    );

    result.items = await TrainingProgressService.scopeRegistrationRunItems(
      result.items,
      await runClassScopes(auth.actor, result.items.map((item) => ({
        id: item.id,
        academicTermId: item.academicTermId,
        cohortId: item.cohortId,
        trainingProgramId: item.trainingProgramId,
      }))),
    );
    return jsonResponse(result);
  } catch (error) {
    console.error("List registration progress runs error:", error);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
