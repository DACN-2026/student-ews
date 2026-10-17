import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(req: NextRequest) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { searchParams } = req.nextUrl;
    const { page, pageSize } = parsePagination(searchParams);
    return jsonResponse(await TrainingProgramsService.listAcademicYears(searchParams.get("q") || "", page, pageSize));
  } catch (err) {
    console.error("List academic years error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const body = await readJsonObject<{
      yearCode?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      isCurrent?: boolean;
    }>(req);
    if (!body.yearCode) {
      return errorResponse("yearCode is required", "INVALID_REQUEST", 400);
    }
    const created = await TrainingProgramsService.createAcademicYear({
      yearCode: body.yearCode,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
      isCurrent: body.isCurrent,
    });
    return jsonResponse(created, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create academic year");
  }
}
