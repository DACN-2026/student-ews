import { NextRequest, NextResponse } from "next/server";
import { backendOrigin } from "@/lib/backend-origin";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/v1/")) {
    // Runtime routing keeps cookies and API URLs on the browser's own origin.
    return NextResponse.rewrite(new URL(`${pathname}${search}`, backendOrigin()));
  }

  if (pathname === "/renew") return NextResponse.next();

  // Optimistic navigation guard; backend verifies the session and permissions.
  if (!request.cookies.get("sms_access_token")?.value) {
    const renewUrl = new URL("/renew", request.url);
    renewUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(renewUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-sms-request-path", `${pathname}${search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/api/v1/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|login|renew|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
