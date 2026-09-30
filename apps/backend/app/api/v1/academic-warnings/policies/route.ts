import { NextRequest } from "next/server";
import { AcademicWarningsService } from "@/lib/services/academic-warnings";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonBody } from "@/lib/utils/api-error";
import { requirePermission } from "@/lib/auth/authorize";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.read", req);
    if (!auth.authorized) return auth.response;
    const policies = await AcademicWarningsService.listPolicies();
    return jsonResponse({ items: policies, total: policies.length });
  } catch (err) {
    console.error("List policies error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.policy.manage", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<{
      name?: string;
      policyName?: string;
      policyDefinition?: unknown;
      definition?: unknown;
      termGpaThreshold?: number;
      cumulativeGpaThreshold?: number;
      conductScoreThreshold?: number;
      status?: string;
    }>(req);
    const name = body.name || body.policyName;
    if (!name) {
      return errorResponse("name is required", "INVALID_REQUEST", 400);
    }
    const created = await AcademicWarningsService.createPolicy({ ...body, name }, auth.actor.userId);
    return jsonResponse(created, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create warning policy");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requirePermission("academic_warning.policy.manage", req);
    if (!auth.authorized) return auth.response;
    const body = await readJsonBody<{
      id?: string;
      name?: string;
      policyDefinition?: unknown;
      definition?: unknown;
      termGpaThreshold?: number;
      cumulativeGpaThreshold?: number;
      conductScoreThreshold?: number;
      status?: string;
    }>(req);
    if (!body.id) return errorResponse("id is required", "INVALID_REQUEST", 400);
    const updated = await AcademicWarningsService.updatePolicy(body.id, body, auth.actor.userId);
    return jsonResponse(updated);
  } catch (err) {
    return apiErrorResponse(err, "Failed to update warning policy");
  }
}
