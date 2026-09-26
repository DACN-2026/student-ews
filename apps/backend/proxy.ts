import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken, type TokenPayload } from "@/lib/auth/jwt";

const PUBLIC_API_PATHS = new Set([
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/healthz",
]);

export function requiredPermission(pathname: string, method: string): string | string[] | null {
  if (pathname.startsWith("/api/v1/rbac/users")) return "user.manage";
  if (pathname.startsWith("/api/v1/rbac/roles") || pathname.startsWith("/api/v1/rbac/permissions")) {
    return "role.manage";
  }
  if (
    pathname.startsWith("/api/v1/rbac/advisors") ||
    pathname.startsWith("/api/v1/rbac/advisor-assignments")
  ) return "advisor_assignment.manage";

  if (pathname.startsWith("/api/v1/students")) {
    if (pathname.includes("/grades")) {
      if (pathname.includes("/export")) return "grade.export";
      return "grade.read";
    }
    if (pathname.includes("/decisions")) {
      if (pathname.includes("/export")) return "decision.export";
      if (method === "POST") return "decision.create";
      if (method === "PATCH" || method === "PUT") return "decision.update";
      if (method === "DELETE") return "decision.delete";
      return "decision.read";
    }
    if (pathname.includes("/fee-policies")) {
      if (pathname.includes("/export")) return "fee_policy.export";
      if (method === "POST") return "fee_policy.create";
      if (method === "PATCH" || method === "PUT") return "fee_policy.update";
      if (method === "DELETE") return "fee_policy.delete";
      return "fee_policy.read";
    }
    if (pathname.includes("/import")) return "student.import";
    if (pathname.includes("/export")) return "student.export";
    if (method === "POST") return "student.create";
    if (method === "PATCH" || method === "PUT") return "student.update";
    if (method === "DELETE") return "student.delete";
    return "student.read";
  }

  if (pathname.startsWith("/api/v1/grades/import")) return "grade.import";
  if (pathname.startsWith("/api/v1/decisions/import")) return "decision.import";
  if (pathname.startsWith("/api/v1/decision-types")) {
    if (method === "POST") return "decision.create";
    if (method === "PATCH" || method === "PUT") return "decision.update";
    if (method === "DELETE") return "decision.delete";
    return "decision.read";
  }
  if (pathname.startsWith("/api/v1/fee-policies/import")) return "fee_policy.import";
  if (pathname.startsWith("/api/v1/fee-policy-types")) {
    if (method === "POST") return "fee_policy.create";
    if (method === "PATCH" || method === "PUT") return "fee_policy.update";
    if (method === "DELETE") return "fee_policy.delete";
    return "fee_policy.read";
  }
  if (pathname.startsWith("/api/v1/classes") || pathname.startsWith("/api/v1/cohorts")) {
    if (method === "GET") return ["class.manage", "student.read", "progress.read"];
    return "class.manage";
  }
  if (
    pathname.startsWith("/api/v1/academic-years") ||
    pathname.startsWith("/api/v1/courses") ||
    pathname.startsWith("/api/v1/training-programs")
  ) {
    if (method === "GET") return ["academic_term.manage", "progress.read", "student.read"];
    return "academic_term.manage";
  }
  if (pathname.startsWith("/api/v1/training-progress")) {
    if (
      pathname.includes("/calculate") ||
      ((pathname.includes("/completion/runs") || pathname.includes("/completion-runs")) && method === "POST")
    ) {
      return "progress.calculate";
    }
    if (method !== "GET") return "progress.plan.manage";
    return "progress.read";
  }
  if (pathname.startsWith("/api/v1/graduation-evaluations")) {
    if (pathname.includes("/export")) return "graduation.export";
    if (pathname.endsWith("/preview")) return "graduation.read";
    if (method === "POST") return "graduation.evaluate";
    return "graduation.read";
  }
  if (pathname.startsWith("/api/v1/academic-warnings")) {
    if (pathname.includes("/policies") && method !== "GET") return "academic_warning.policy.manage";
    if (pathname.includes("/runs") && method === "POST") return "academic_warning.calculate";
    if (pathname.includes("/actions") && method === "POST") return "academic_warning.action.create";
    if (pathname.includes("/actions") && (method === "PATCH" || method === "PUT")) {
      return "academic_warning.action.update";
    }
    return "academic_warning.read";
  }
  if (pathname.startsWith("/api/v1/academic-context")) return "progress.read";
  if (pathname.startsWith("/api/v1/reports/export")) return "report.export";
  if (pathname.startsWith("/api/v1/dashboard")) return null;
  return null;
}

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
    /^\/api\/v1\/training-progress\/completion-runs\/([^/]+)/,
    /^\/api\/v1\/academic-warnings\/runs\/([^/]+)/,
    /^\/api\/v1\/academic-warnings\/actions\/([^/]+)/,
    /^\/api\/v1\/graduation-evaluations\/([^/]+)/,
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

  if (isApi) {
    const permission = requiredPermission(pathname, request.method);
    if (permission && !hasPermission(payload, permission)) {
      return apiError("Forbidden: Insufficient permissions", "FORBIDDEN", 403, requestId);
    }
  }

  return nextResponse(request, requestId);
}

export const config = {
  matcher: ["/api/v1/:path*"],
};
