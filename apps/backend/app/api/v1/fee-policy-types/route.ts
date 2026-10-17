import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { FeePoliciesService } from "@/lib/services/fee-policies";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const q = (request.nextUrl.searchParams.get("q") || "").trim().toLocaleLowerCase();
    const types = (await FeePoliciesService.listTypes()).filter((type) =>
      !q || type.feeObjectDicId.toLocaleLowerCase().includes(q) || type.feeObjectDicName.toLocaleLowerCase().includes(q)
    );
    return jsonResponse({ items: types, total: types.length });
  } catch (err) {
    console.error("List fee policy types error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const body = await readJsonObject<{ feeObjectDicId?: string; feeObjectDicName?: string; isActive?: boolean }>(request);
    if (!body.feeObjectDicId?.trim() || !body.feeObjectDicName?.trim()) {
      return errorResponse("feeObjectDicId and feeObjectDicName are required", "INVALID_REQUEST", 400);
    }
    return jsonResponse(await FeePoliciesService.createType({
      feeObjectDicId: body.feeObjectDicId,
      feeObjectDicName: body.feeObjectDicName,
      isActive: body.isActive,
    }), 201);
  } catch (error) {
    return apiErrorResponse(error, "Failed to create fee policy type");
  }
}
