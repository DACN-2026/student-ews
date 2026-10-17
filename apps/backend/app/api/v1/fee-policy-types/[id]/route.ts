import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { FeePoliciesService } from "@/lib/services/fee-policies";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";
import { recordAudit } from "@/lib/services/audit";

interface Params { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    const body = await readJsonObject<{ feeObjectDicName?: string; isActive?: boolean }>(request);
    return jsonResponse(await FeePoliciesService.updateType(id, body));
  } catch (error) {
    return apiErrorResponse(error, "Failed to update fee policy type");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const { id } = await params;
    await FeePoliciesService.removeType(id);
    await recordAudit(request, { action: "fee_policy_type.delete", resourceType: "FeePolicyType", resourceId: id });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error, "Failed to delete fee policy type");
  }
}
