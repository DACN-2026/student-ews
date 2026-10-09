import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningEvidenceService } from "@/lib/services/academic-warning-evidence";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { isUUID } from "@/lib/utils/is-uuid";

export async function GET(req: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const { caseId } = await params;
    if (!isUUID(caseId)) return errorResponse("Invalid intervention case id", "INVALID_ID", 400);
    const resultId = req.nextUrl.searchParams.get("resultId");
    if (resultId !== null && !isUUID(resultId)) return errorResponse("Invalid warning result id", "INVALID_ID", 400);
    const response = jsonResponse(await AcademicWarningEvidenceService.getForCase(caseId, auth.actor, resultId));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error, "Failed to load warning evidence");
  }
}
