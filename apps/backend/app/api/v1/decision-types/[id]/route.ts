import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { DecisionsService } from "@/lib/services/decisions";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

interface Params { params: Promise<{ id: string }> }

function numericId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const id = numericId((await params).id);
    if (!id) return errorResponse("Invalid decision type id", "INVALID_ID", 400);
    const body = await readJsonObject<{ name?: string; decisionName?: string; category?: string; isActive?: boolean }>(request);
    return jsonResponse(await DecisionsService.updateType(id, {
      decisionName: body.name ?? body.decisionName,
      category: body.category,
      isActive: body.isActive,
    }));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update decision type");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const id = numericId((await params).id);
    if (!id) return errorResponse("Invalid decision type id", "INVALID_ID", 400);
    await DecisionsService.removeType(id);
    await recordAudit(request, { action: "decision_type.delete", resourceType: "DecisionType", resourceId: String(id) });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete decision type");
  }
}
