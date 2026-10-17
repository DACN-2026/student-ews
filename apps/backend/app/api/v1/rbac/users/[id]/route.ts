import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { jsonResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { recordAudit } from "@/lib/services/audit";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{
      fullName?: string;
      email?: string;
      isActive?: boolean;
      roleCodes?: string[];
      password?: string;
    }>(req);

    const updated = await RbacService.updateUser(id, body);
    await recordAudit(req, {
      action: "user.update",
      resourceType: "User",
      resourceId: id,
      details: {
        changedFields: Object.keys(body),
        ...(body.roleCodes ? { roleCodes: body.roleCodes } : {}),
      },
    });
    return jsonResponse(updated);
  } catch (err: unknown) {
    return apiErrorResponse(err, "Failed to update user");
  }
}

export const PATCH = PUT;
