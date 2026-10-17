import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { DecisionsService } from "@/lib/services/decisions";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const body = await readJsonBody<unknown>(request, 10 * 1024 * 1024);
    if (!Array.isArray(body)) return errorResponse("Expected an array of decision types", "INVALID_JSON", 400);
    return jsonResponse(await DecisionsService.importTypes(body));
  } catch (error) {
    return apiErrorResponse(error, "Decision type import failed");
  }
}
