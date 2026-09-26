import { NextRequest } from "next/server";
import { ClassesService } from "@/lib/services/classes";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/auth/authorize";
import { classScopeWhere } from "@/lib/auth/data-scope";

interface Params { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission(["class.manage", "student.read", "progress.read"], request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const scopeWhere = await classScopeWhere(auth.actor);
    const result = await ClassesService.getById(id, scopeWhere);
    if (!result) return errorResponse("Class not found or outside data scope", "NOT_FOUND", 404);
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to load class");
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("class.manage", request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await readJsonBody<{ classId?: string; className?: string; cohortId?: string | null; isActive?: boolean }>(request);
    return jsonResponse(await ClassesService.update(id, body));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update class");
  }
}

export const PATCH = PUT;

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await requirePermission("class.manage", request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    await ClassesService.remove(id);
    await recordAudit(request, { action: "class.delete", resourceType: "Class", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete class");
  }
}
