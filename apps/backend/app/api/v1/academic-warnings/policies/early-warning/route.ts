import { NextRequest } from "next/server";
import { requirePermission } from "@/lib/auth/authorize";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { findEarlyWarningPolicy } from "@/lib/services/early-warning-policy";
import { parseEarlyWarningSettings } from "@/lib/services/early-warning-settings";
import { apiErrorResponse, ApiError, readJsonBody } from "@/lib/utils/api-error";
import { jsonResponse } from "@/lib/utils/api-response";

export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.policy.manage", request);
    if (!auth.authorized) return auth.response;
    const { policy, definition } = await findEarlyWarningPolicy();
    return jsonResponse({ id: policy.id, name: policy.name, version: policy.version,
      marginGpa4: definition.advisory.earlyWarningMarginGpa4,
      settings: parseEarlyWarningSettings(definition.advisory.earlyWarning), regulatory: definition.thresholds });
  } catch (error) { return apiErrorResponse(error, "Không thể tải cấu hình theo dõi sớm."); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.policy.manage", request);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<{ basePolicyId?: string; name?: string; marginGpa4?: number; settings?: unknown }>(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Cấu hình không hợp lệ.", "INVALID_REQUEST", 422);
    const { policy, definition } = await findEarlyWarningPolicy();
    if (body.basePolicyId !== policy.id) throw new ApiError("Chính sách đã thay đổi. Tải lại cấu hình trước khi lưu.", "POLICY_CONFIGURATION_CHANGED", 409);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) throw new ApiError("Tên chính sách phải có từ 1 đến 200 ký tự.", "INVALID_REQUEST", 422);
    if (typeof body.marginGpa4 !== "number" || !Number.isFinite(body.marginGpa4) || body.marginGpa4 < 0 || body.marginGpa4 > 4) throw new ApiError("Khoảng GPA phải nằm trong khoảng 0–4.", "INVALID_REQUEST", 422);
    if (body.settings === undefined) throw new ApiError("Cần gửi cấu hình theo dõi sớm.", "INVALID_REQUEST", 422);
    let settings;
    try { settings = parseEarlyWarningSettings(body.settings); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "Cấu hình không hợp lệ.", "INVALID_REQUEST", 422); }
    const created = await AcademicWarningsService.createPolicy({ name: body.name.trim(), status: "draft", expectedBasePolicyId: policy.id,
      policyDefinition: { ...definition, advisory: { ...definition.advisory, earlyWarningMarginGpa4: body.marginGpa4, earlyWarning: settings } },
    }, auth.actor.userId);
    return jsonResponse(created, 201);
  } catch (error) { return apiErrorResponse(error, "Không thể lưu cấu hình theo dõi sớm."); }
}
