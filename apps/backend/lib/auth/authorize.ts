import { getActorFromHeaders } from "./get-actor";
import { hasPermission, hasScope, type Actor } from "./types";
import { errorResponse } from "@/lib/utils/api-response";

export type AuthResult = {
  authorized: true;
  actor: Actor;
} | {
  authorized: false;
  response: Response;
};

export async function requireAuth(request?: Request): Promise<AuthResult> {
  const actor = await getActorFromHeaders(request);
  if (!actor) {
    return {
      authorized: false,
      response: errorResponse("Unauthorized", "UNAUTHORIZED", 401),
    };
  }
  return { authorized: true, actor };
}

export async function requirePermission(permission: string | string[], request?: Request): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (!hasPermission(auth.actor, permission)) {
    return {
      authorized: false,
      response: errorResponse("Forbidden: Insufficient permissions", "FORBIDDEN", 403),
    };
  }
  return auth;
}

export async function requireScope(scope: string, request?: Request): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth;

  if (!hasScope(auth.actor, scope)) {
    return {
      authorized: false,
      response: errorResponse("Forbidden: Out of scope", "FORBIDDEN", 403),
    };
  }
  return auth;
}
