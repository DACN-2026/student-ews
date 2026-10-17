import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken, type TokenPayload } from "@/lib/auth/jwt";

const PUBLIC_API_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/healthz",
]);

export { requiredPermission } from "@/lib/auth/api-permissions";

export function hasPermission(payload: TokenPayload, permission: string | string[]): boolean {
  if (payload.roles.includes("admin")) return true;
  if (Array.isArray(permission)) {
    return permission.some((p) => payload.permissions.includes(p));
  }
  return payload.permissions.includes(permission);
}

export function hasInvalidUuidSegment(pathname: string): boolean {
  const patterns = [
    /^\/api\/v1\/training-progress\/plans\/(?!clone(?:-preview)?(?:\/|$))([^/]+)/,
    /^\/api\/v1\/training-progress\/runs\/([^/]+)/,
    /^\/api\/v1\/training-progress\/completion\/runs\/([^/]+)/,
    /^\/api\/v1\/training-progress\/completion-runs\/(?!preview(?:\/|$))([^/]+)/,
    /^\/api\/v1\/academic-warnings\/runs\/([^/]+)/,
    /^\/api\/v1\/academic-warnings\/terms\/([^/]+)/,
    /^\/api\/v1\/academic-warnings\/actions\/([^/]+)/,
    /^\/api\/v1\/academic-warnings\/interventions\/(?!summary(?:\/|$))([^/]+)/,
    /^\/api\/v1\/graduation-evaluations\/(?!preview(?:\/|$))([^/]+)/,
    /^\/api\/v1\/rbac\/(?:users|roles|advisors|advisor-assignments)\/([^/]+)/,
  ];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return patterns.some((pattern) => {
    const match = pathname.match(pattern);
    return Boolean(match && !uuid.test(match[1]));
  });
}

function withRequestId<T extends NextResponse>(response: T, requestId: string): T {
  response.headers.set("x-request-id", requestId);
  return response;
}

function apiError(message: string, code: string, status: number, requestId: string) {
  return withRequestId(NextResponse.json({ error: { code, message, requestId } }, { status }), requestId);
}

function nextResponse(request: NextRequest, requestId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }), requestId);
}

function isUnsafeCrossOrigin(request: NextRequest): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  // Browser origin differs from backend origin after proxying.
  // Trust explicit configuration, never client-supplied forwarded hosts.
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return !allowedOrigins.includes(origin);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/v1/");
  const incomingRequestId = request.headers.get("x-request-id")?.trim() || "";
  const requestId = /^[A-Za-z0-9._-]{1,128}$/.test(incomingRequestId)
    ? incomingRequestId
    : crypto.randomUUID();

  if (isApi && isUnsafeCrossOrigin(request)) {
    return apiError("Cross-origin request rejected", "INVALID_ORIGIN", 403, requestId);
  }
  if (isApi && PUBLIC_API_PATHS.has(pathname)) return nextResponse(request, requestId);
  if (isApi && hasInvalidUuidSegment(pathname)) return apiError("Invalid identifier", "INVALID_ID", 400, requestId);

  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ")
    ? bearer.slice(7).trim()
    : request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  if (!payload) {
    if (isApi) return apiError("Unauthorized", "UNAUTHORIZED", 401, requestId);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return withRequestId(NextResponse.redirect(loginUrl), requestId);
  }

  // Authorization uses current database grants inside each route handler.
  // JWT claims can be stale after a role is granted or revoked.

  return nextResponse(request, requestId);
}

export const config = {
  matcher: ["/api/v1/:path*"],
};
