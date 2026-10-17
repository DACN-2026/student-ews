import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { ClassesService } from "@/lib/services/classes";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const body = await readJsonBody<unknown>(request, 10 * 1024 * 1024);
    if (!Array.isArray(body)) return errorResponse("Expected an array of classes", "INVALID_JSON", 400);
    return jsonResponse(await ClassesService.import(body));
  } catch (error) {
    return apiErrorResponse(error, "Class import failed");
  }
}
