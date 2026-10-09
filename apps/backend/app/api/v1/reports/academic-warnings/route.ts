import { NextRequest } from "next/server";
import { ReportsService } from "@/lib/services/reports";
import { requirePermission } from "@/lib/auth/authorize";
import { studentScopeWhere } from "@/lib/auth/data-scope";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";
import { apiErrorResponse } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const { page, pageSize } = parsePagination(req.nextUrl.searchParams);
    const severity = req.nextUrl.searchParams.get("severity") || undefined;
    if (severity && !["high", "medium"].includes(severity)) {
      return errorResponse("severity must be high or medium", "INVALID_FILTER", 400);
    }
    const assessmentStatus = req.nextUrl.searchParams.get("assessmentStatus") || undefined;
    if (assessmentStatus && assessmentStatus !== "unassessed") {
      return errorResponse("assessmentStatus must be unassessed", "INVALID_FILTER", 400);
    }
    const report = await ReportsService.academicWarningStudents({
      severity,
      assessmentStatus: assessmentStatus === "unassessed" ? assessmentStatus : undefined,
      classCode: req.nextUrl.searchParams.get("classCode") || undefined,
      search: req.nextUrl.searchParams.get("search") || undefined,
      academicTermId: req.nextUrl.searchParams.get("academicTermId") || undefined,
      academicYearId: req.nextUrl.searchParams.get("academicYearId") || undefined,
      cohortId: req.nextUrl.searchParams.get("cohortId") || undefined,
      programCode: req.nextUrl.searchParams.get("programCode") || undefined,
      page,
      pageSize,
    }, await studentScopeWhere(auth.actor));
    return jsonResponse(report);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load academic warning report");
  }
}
