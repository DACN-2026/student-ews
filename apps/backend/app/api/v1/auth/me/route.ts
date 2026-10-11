import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/authorize";
import { AuthService } from "@/lib/services/auth";
import { jsonResponse, errorResponse } from "@/lib/utils/api-response";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.authorized) {
      return auth.response;
    }

    const data = await AuthService.getMe(auth.actor.userId, auth.actor);
    if (!data) {
      return errorResponse("User not found", "NOT_FOUND", 404);
    }

    return jsonResponse(data);
  } catch (err) {
    console.error("GetMe error:", err);
    return errorResponse("Internal server error", "INTERNAL_ERROR", 500);
  }
}
