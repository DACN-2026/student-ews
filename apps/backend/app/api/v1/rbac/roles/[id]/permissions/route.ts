import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { errorResponse, jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(_request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const permissions = await RbacService.listRolePermissions(id);
    return jsonResponse({ items: permissions, total: permissions.length });
  } catch (error) {
    return apiErrorResponse(error, "Failed to list role permissions");
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{ permissionCodes?: unknown }>(request);
    if (!Array.isArray(body.permissionCodes) || !body.permissionCodes.every((code) => typeof code === "string")) {
      return errorResponse("permissionCodes must be an array of strings", "INVALID_REQUEST", 400);
    }
    const permissions = await RbacService.replaceRolePermissions(id, body.permissionCodes);
    await recordAudit(request, {
      action: "role.permissions.replace",
      resourceType: "Role",
      resourceId: id,
      details: { permissionCodes: body.permissionCodes },
    });
    return jsonResponse({ items: permissions, total: permissions.length });
  } catch (error) {
    return apiErrorResponse(error, "Failed to update role permissions");
  }
}
