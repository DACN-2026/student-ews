import { NextRequest } from "next/server";
import { DashboardService } from "@/lib/services/dashboard";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";
import { requireAuth } from "@/lib/auth/authorize";
import { studentScopeWhere, warningRunScopeWhere } from "@/lib/auth/data-scope";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { hasPermission } from "@/lib/auth/types";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) return auth.response;
    const canReadWarnings = hasPermission(auth.actor, "academic_warning.read");
    if ((req.nextUrl.searchParams.has("warningLevel") || req.nextUrl.searchParams.has("supportStatus")) && !canReadWarnings) {
      return errorResponse("academic_warning.read is required for warning dashboard filters", "FORBIDDEN", 403);
    }
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams);
    const summary = await DashboardService.getSummary({
      academicYear: req.nextUrl.searchParams.get("academicYear") || undefined,
      termCode: req.nextUrl.searchParams.get("termCode") || undefined,
      programCode: req.nextUrl.searchParams.get("programCode") || undefined,
      classId: req.nextUrl.searchParams.get("classId") || undefined,
      gpaScope: req.nextUrl.searchParams.get("gpaScope") || undefined,
      gpaAggregation: req.nextUrl.searchParams.get("gpaAggregation") || undefined,
      page,
      pageSize,
      cohortId: req.nextUrl.searchParams.get("cohortId") || undefined,
      trainingProgramId: req.nextUrl.searchParams.get("trainingProgramId") || undefined,
      academicTermId: req.nextUrl.searchParams.get("academicTermId") || undefined,
      warningLevel: req.nextUrl.searchParams.get("warningLevel") || undefined,
      supportStatus: req.nextUrl.searchParams.get("supportStatus") || undefined,
    }, await studentScopeWhere(auth.actor), await warningRunScopeWhere(auth.actor), canReadWarnings);
    return jsonResponse(summary);
  } catch (err) {
    return apiErrorResponse(err, "Failed to load dashboard summary");
  }
}
