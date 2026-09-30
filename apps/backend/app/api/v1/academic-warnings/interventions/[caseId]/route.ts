import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { InterventionCasesService } from "@/lib/services/intervention-cases";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { isUUID } from "@/lib/utils/is-uuid";

interface Params {
  params: Promise<{ caseId: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const { caseId } = await params;
    if (!isUUID(caseId)) return errorResponse("Invalid intervention case id", "INVALID_ID", 400);
    return jsonResponse(await InterventionCasesService.getDetail(caseId, auth.actor));
  } catch (error) {
    return apiErrorResponse(error, "Failed to load intervention case");
  }
}
