import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse, parsePagination } from "@/lib/utils/api-response";

function optionalBoolean(value: string | null, name: string) {
  if (value === null) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const { searchParams } = req.nextUrl;
    let overdue: boolean | undefined;
    try {
      overdue = optionalBoolean(searchParams.get("overdue"), "overdue");
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : "Invalid boolean filter", "INVALID_FILTER", 400);
    }
    const { page, pageSize } = parsePagination(searchParams, 100);
    return jsonResponse(await InterventionCasesService.list({
      status: searchParams.get("status") || undefined,
      businessStatus: searchParams.get("businessStatus") || undefined,
      classId: searchParams.get("classId") || undefined,
      academicTermId: searchParams.get("academicTermId") || undefined,
      overdue,
      search: searchParams.get("search") || searchParams.get("q") || undefined,
      page,
      pageSize,
    }, auth.actor));
  } catch (error) {
    return apiErrorResponse(error, "Failed to list intervention cases");
  }
}
