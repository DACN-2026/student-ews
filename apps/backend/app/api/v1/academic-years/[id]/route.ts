import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { TrainingProgramsService } from "@/lib/services/training-programs";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

interface Params { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(_request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const year = await TrainingProgramsService.getAcademicYearById(id);
    if (!year) return errorResponse("Academic year not found", "NOT_FOUND", 404);
    return jsonResponse(year);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load academic year");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{
      yearCode?: string;
      startDate?: string | null;
      endDate?: string | null;
      status?: string;
      isCurrent?: boolean;
    }>(request);
    if (body.yearCode !== undefined && !body.yearCode.trim()) {
      return Response.json({ error: { code: "INVALID_REQUEST", message: "yearCode cannot be empty" } }, { status: 400 });
    }
    return jsonResponse(await TrainingProgramsService.updateAcademicYear(id, body));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update academic year");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    await TrainingProgramsService.removeAcademicYear(id);
    await recordAudit(request, { action: "academic_year.delete", resourceType: "AcademicYear", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete academic year");
  }
}
