"use client";

import { apiResponseCache } from "./api-response-cache";
import { trackNetworkRequest } from "./network-activity";

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
  apiResponseCache.setScope("");
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

/**
 * Same-origin API fetch with one coordinated access-token refresh and retry.
 * Concurrent 401 responses share one refresh request so refresh-token rotation
 * cannot invalidate sibling requests.
 */
async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await fetch(input, init);
  const pathname = requestPath(input);

  if (response.status !== 401 || !canRefresh(pathname)) return response;

  invalidateApiCache();

  if (await refreshSession()) {
    return fetch(retryInput, init);
  }

  redirectToLogin();
  return response;
}

function cacheKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (typeof window === "undefined" || input instanceof Request || (init?.method || "GET").toUpperCase() !== "GET") return null;
  const url = new URL(input.toString(), window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/v1/") || url.pathname.startsWith("/api/v1/auth/") || /\/export(?:\/|$)/.test(url.pathname) || url.searchParams.has("format")) return null;
  url.searchParams.sort();
  return `${url.pathname}${url.search}|${JSON.stringify([...new Headers(init?.headers).entries()])}|${init?.credentials || "same-origin"}`;
}
export const invalidateApiCache = () => apiResponseCache.clear();
export const setApiCacheScope = (scope: string) => apiResponseCache.setScope(scope);
export const hasSessionTask = (key: string) => apiResponseCache.hasTask(key);
export const runSessionTask = <T>(key: string, task: () => Promise<T>) => apiResponseCache.runTask(key, task);
export function peekApiData<T>(input: string, allowStale = false): T | null { const key = cacheKey(input); return key ? apiResponseCache.peek<T>(key, allowStale) : null; }
export function hasApiData(input: string): boolean { const key = cacheKey(input); return Boolean(key && apiResponseCache.has(key)); }

/** Reuse successful JSON reads for 60 seconds; writes and explicit refreshes invalidate them. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const writes = !["GET", "HEAD", "OPTIONS"].includes(method);
  const changesWarningSources = writes && /^\/api\/v1\/(students|academic-years|training-programs|courses|cohorts|classes|training-progress|academic-warnings\/policies)(\/|$)/.test(requestPath(input));
  const bypass = init?.cache === "no-store" || init?.cache === "reload" || init?.cache === "no-cache";
  if (writes || init?.cache === "reload" || init?.cache === "no-cache") invalidateApiCache();
  const key = bypass ? null : cacheKey(input, init);
  try {
    if (key) return await apiResponseCache.request(key, (signal) => trackNetworkRequest(() => authenticatedFetch(input, { ...init, signal })), init?.signal);
    return await trackNetworkRequest(() => authenticatedFetch(input, init));
  } finally {
    if (writes) invalidateApiCache();
    if (changesWarningSources) apiResponseCache.clearTasks();
  }
}
