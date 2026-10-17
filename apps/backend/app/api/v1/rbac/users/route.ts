import { requireApiPermission } from "@/lib/auth/authorize";
import { NextRequest } from "next/server";
import { RbacService } from "@/lib/services/rbac";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";
import { apiErrorResponse, readJsonObject } from "@/lib/utils/api-error";

export async function GET(request: Request) {
  try {
    const access = await requireApiPermission(request);
    if (!access.authorized) return access.response;
    const users = await RbacService.listUsers();
    return jsonResponse({ items: users, total: users.length });
  } catch (err) {
    console.error("List users error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireApiPermission(req);
    if (!access.authorized) return access.response;
    const body = await readJsonObject<{
      username?: string;
      fullName?: string;
      password?: string;
      email?: string;
      roleCodes?: string[];
    }>(req);
    if (!body.username || !body.fullName) {
      return errorResponse("username and fullName are required", "INVALID_REQUEST", 400);
    }
    const created = await RbacService.createUser({
      username: body.username,
      fullName: body.fullName,
      password: body.password,
      email: body.email,
      roleCodes: body.roleCodes,
    });
    return jsonResponse(created, 201);
  } catch (err) {
    return apiErrorResponse(err, "Failed to create user");
  }
}
