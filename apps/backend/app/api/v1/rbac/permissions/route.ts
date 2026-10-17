import { requireApiPermission } from "@/lib/auth/authorize";
import { RbacService } from "@/lib/services/rbac";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";

export async function GET(request: Request) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const permissions = await RbacService.listPermissions();
    return jsonResponse({ items: permissions, total: permissions.length });
  } catch (err) {
    console.error("List permissions error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
