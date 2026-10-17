import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { ClassesService } from "@/lib/services/classes";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{ cohortId?: unknown }>(request);
    if (typeof body.cohortId !== "string" || !body.cohortId) {
      return errorResponse("cohortId is required", "VALIDATION_ERROR", 422);
    }
    return jsonResponse(await ClassesService.update(id, { cohortId: body.cohortId }));
  } catch (error) {
    return apiErrorResponse(error, "Failed to assign class cohort");
  }
}
