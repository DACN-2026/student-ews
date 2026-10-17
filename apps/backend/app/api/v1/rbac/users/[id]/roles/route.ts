import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(_request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    return jsonResponse(await RbacService.listUserRoles(id));
  } catch (error) {
    return apiErrorResponse(error, "Failed to list user roles");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{ roleCode?: unknown }>(request);
    if (typeof body.roleCode !== "string" || !body.roleCode.trim()) {
      return errorResponse("roleCode is required", "INVALID_REQUEST", 400);
    }
    const result = await RbacService.assignUserRole(id, body.roleCode.trim());
    await recordAudit(request, {
      action: "user.role.assign",
      resourceType: "User",
      resourceId: id,
      details: { roleCode: body.roleCode.trim() },
    });
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to assign user role");
  }
}
