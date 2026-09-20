"use client";

let refreshPromise: Promise<boolean> | null = null;

function requestPath(input: RequestInfo | URL): string {
  try {
    const value = input instanceof Request ? input.url : input.toString();
    return new URL(value, window.location.origin).pathname;
  } catch {
    return "";
  }
}

function canRefresh(pathname: string): boolean {
  return pathname.startsWith("/api/v1/") &&
    pathname !== "/api/v1/auth/login" &&
    pathname !== "/api/v1/auth/logout" &&
    pathname !== "/api/v1/auth/refresh";
}

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-SMS-Session-Refresh": "1" },
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Same-origin API fetch with one coordinated access-token refresh and retry.
 * Concurrent 401 responses share one refresh request so refresh-token rotation
 * cannot invalidate sibling requests.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await fetch(input, init);
  const pathname = requestPath(input);

  if (response.status !== 401 || !canRefresh(pathname)) return response;

  if (await refreshSession()) {
    return fetch(retryInput, init);
  }

  redirectToLogin();
  return response;
}
