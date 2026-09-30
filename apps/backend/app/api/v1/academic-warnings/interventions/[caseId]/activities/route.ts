import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { isUUID } from "@/lib/utils/is-uuid";

interface Params {
  params: Promise<{ caseId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_warning.action.create", req);
    if (!auth.authorized) return auth.response;
    const { caseId } = await params;
    if (!isUUID(caseId)) return errorResponse("Invalid intervention case id", "INVALID_ID", 400);
    const body = await readJsonBody<{
      interventionType?: string;
      occurredAt?: string;
      content?: string;
      result?: string | null;
      note?: string | null;
      nextFollowUpAt?: string | null;
    }>(req, 128 * 1024);
    if (typeof body.interventionType !== "string" || typeof body.occurredAt !== "string" || typeof body.content !== "string") {
      return errorResponse("interventionType, occurredAt, and content are required", "INVALID_REQUEST", 400);
    }
    const updated = await InterventionCasesService.recordIntervention(caseId, {
      interventionType: body.interventionType,
      occurredAt: body.occurredAt,
      content: body.content,
      result: body.result,
      note: body.note,
      nextFollowUpAt: body.nextFollowUpAt,
    }, auth.actor);
    return jsonResponse({ id: updated.id, status: updated.status, nextFollowUpAt: updated.nextFollowUpAt, updatedAt: updated.updatedAt }, 201);
  } catch (error) {
    return apiErrorResponse(error, "Failed to record intervention activity");
  }
}
