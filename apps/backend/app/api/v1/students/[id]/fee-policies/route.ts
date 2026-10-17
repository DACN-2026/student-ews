import { NextRequest } from "next/server";
import { FeePoliciesService } from "@/lib/services/fee-policies";
import { jsonResponse, errorResponse, parsePagination } from "@/lib/utils/api-response";
import { requireStudentPermission } from "@/lib/auth/data-scope";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "fee_policy.read");
    if (!auth.authorized) return auth.response;
    const searchParams = req.nextUrl.searchParams;
    const { page, pageSize } = parsePagination(searchParams);
    const q = (searchParams.get("q") || "").trim().toLocaleLowerCase();
    const academicYear = searchParams.get("academicYear") || "";
    const termCode = (searchParams.get("termCode") || "").toUpperCase();
    const typeId = searchParams.get("feeObjectDicId") || "";
    const allItems = (await FeePoliciesService.list(id)).filter((item) =>
      (!academicYear || item.yearStudy === academicYear) &&
      (!termCode || item.termId?.toUpperCase() === termCode) &&
      (!typeId || item.feeObjectDicId === typeId) &&
      (!q || [item.feeObjectDicId, item.policyName, item.decisionNumber]
        .some((value) => value?.toLocaleLowerCase().includes(q)))
    );
    const offset = (page - 1) * pageSize;
    return jsonResponse({ items: allItems.slice(offset, offset + pageSize), total: allItems.length, page, pageSize });
  } catch (err) {
    console.error("List fee policies error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await requireStudentPermission(req, id, "fee_policy.create");
    if (!auth.authorized) return auth.response;
    const body = await readJsonObject<Record<string, unknown>>(req);
    if (!body.policyTypeId && !body.feePolicyTypeId && !body.feeObjectDicId) {
      return errorResponse("feeObjectDicId is required", "INVALID_REQUEST", 400);
    }
    const created = await FeePoliciesService.create(id, body);
    return jsonResponse(created, 201);
  } catch (err) {
    return apiErrorResponse(err, "Không thể lưu chính sách học phí.");
  }
}
