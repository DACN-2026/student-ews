import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { apiErrorResponse } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; roleCode: string }> },
) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id, roleCode } = await params;
    const decodedRoleCode = decodeURIComponent(roleCode);
    const result = await RbacService.removeUserRole(id, decodedRoleCode);
    await recordAudit(request, {
      action: "user.role.remove",
      resourceType: "User",
      resourceId: id,
      details: { roleCode: decodedRoleCode },
    });
    return jsonResponse(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to remove user role");
  }
}
