import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { isUUID } from "@/lib/utils/is-uuid";

interface Params {
  params: Promise<{ caseId: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_warning.action.update", req);
    if (!auth.authorized) return auth.response;
    const { caseId } = await params;
    if (!isUUID(caseId)) return errorResponse("Invalid intervention case id", "INVALID_ID", 400);
    const body = await readJsonBody<{ status?: string }>(req, 16 * 1024);
    if (typeof body.status !== "string") return errorResponse("status is required", "INVALID_REQUEST", 400);
    const updated = await InterventionCasesService.transitionStatus(caseId, body.status, auth.actor);
    return jsonResponse({ id: updated.id, status: updated.status, resolvedAt: updated.resolvedAt, updatedAt: updated.updatedAt });
  } catch (error) {
    return apiErrorResponse(error, "Failed to update intervention status");
  }
}
