import { NextRequest } from "next/server";
import { ClassesService } from "@/lib/services/classes";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { requirePermission } from "@/lib/auth/authorize";
import { classScopeWhere } from "@/lib/auth/data-scope";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission(["class.manage", "student.read", "progress.read"], req);
    if (!auth.authorized) return auth.response;

    const { searchParams } = req.nextUrl;
    const { page, pageSize } = parsePagination(searchParams);
    const scopeWhere = await classScopeWhere(auth.actor);
    return jsonResponse(await ClassesService.list(searchParams.get("q") || "", page, pageSize, scopeWhere));
  } catch (err) {
    console.error("List classes error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("class.manage", req);
    if (!auth.authorized) return auth.response;

    const body = await readJsonBody<{ classId?: string; className?: string; cohortId?: string }>(req);
    if (typeof body.classId !== "string" || !body.classId.trim() || typeof body.className !== "string" || !body.className.trim()) {
      return errorResponse("classId and className are required", "INVALID_REQUEST", 400);
    }
    const created = await ClassesService.create({ classId: body.classId, className: body.className, cohortId: body.cohortId });
    return jsonResponse(created, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create class");
  }
}
