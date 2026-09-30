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
    const body = await readJsonBody<{ nextFollowUpAt?: string | null }>(req, 16 * 1024);
    if (body.nextFollowUpAt !== null && typeof body.nextFollowUpAt !== "string") {
      return errorResponse("nextFollowUpAt must be an ISO date-time or null", "INVALID_REQUEST", 400);
    }
    const updated = await InterventionCasesService.setFollowUp(caseId, body.nextFollowUpAt, auth.actor);
    return jsonResponse({ id: updated.id, nextFollowUpAt: updated.nextFollowUpAt, updatedAt: updated.updatedAt });
  } catch (error) {
    return apiErrorResponse(error, "Failed to update intervention follow-up");
  }
}
