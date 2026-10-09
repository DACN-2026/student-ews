import assert from "node:assert/strict";
import test from "node:test";
import { apiFetch, hasApiData, hasSessionTask, invalidateApiCache, peekApiData, runSessionTask, setApiCacheScope } from "../lib/api-client";

async function mockBrowser(run: (calls: string[]) => Promise<void>, respond: (url: string) => Response | Promise<Response>) {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:3000", pathname: "/reports", search: "", assign: () => {} } } });
  const calls: string[] = [];
  globalThis.fetch = async (input) => { const url = input.toString(); calls.push(url); return respond(url); };
  setApiCacheScope("test-user"); invalidateApiCache();
  try { await run(calls); }
  finally { setApiCacheScope(""); globalThis.fetch = originalFetch; if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window"); }
}
test("equivalent queries reuse one read; refresh and writes fetch new data", async () => {
  let serial = 0;
  await mockBrowser(async (calls) => {
    await apiFetch("/api/v1/students?pageSize=20&page=1"); await apiFetch("/api/v1/students?page=1&pageSize=20"); assert.equal(calls.length, 1);
    assert.equal(hasApiData("/api/v1/students?page=1&pageSize=20"), true);
    assert.deepEqual(peekApiData("/api/v1/students?page=1&pageSize=20"), { serial: 1 });
    await apiFetch("/api/v1/students?page=1&pageSize=20", { cache: "reload" }); assert.equal(calls.length, 2);
    await apiFetch("/api/v1/students/x", { method: "PATCH" }); assert.equal(hasApiData("/api/v1/students?page=1&pageSize=20"), false);
    await apiFetch("/api/v1/students?page=1&pageSize=20"); assert.equal(calls.length, 4);
  }, () => Response.json({ serial: ++serial }));
});
test("auth, exports, no-store bypass caching and request headers isolate cached reads", async () => {
  await mockBrowser(async (calls) => {
    for (const url of ["/api/v1/auth/me", "/api/v1/students/export?format=xlsx"]) { await apiFetch(url); await apiFetch(url); }
    await apiFetch("/api/v1/academic-warnings/interventions/x/evidence", { cache: "no-store" }); await apiFetch("/api/v1/academic-warnings/interventions/x/evidence", { cache: "no-store" }); assert.equal(calls.length, 6);
    await apiFetch("/api/v1/students", { headers: { "X-Test-Scope": "a" } }); await apiFetch("/api/v1/students", { headers: { "X-Test-Scope": "b" } }); assert.equal(calls.length, 8);
  }, () => Response.json({ ok: true }));
});
test("concurrent expired-token reads coordinate one refresh and retry both requests", async () => {
  const expired = new Set<string>();
  await mockBrowser(async (calls) => {
    const responses = await Promise.all([apiFetch("/api/v1/students/a"), apiFetch("/api/v1/students/b")]); assert.ok(responses.every((response) => response.ok));
    assert.equal(calls.filter((url) => url === "/api/v1/auth/refresh").length, 1);
    assert.equal(calls.filter((url) => url === "/api/v1/students/a").length, 2); assert.equal(calls.filter((url) => url === "/api/v1/students/b").length, 2);
  }, async (url) => {
    if (url === "/api/v1/auth/refresh") { await new Promise((resolve) => setTimeout(resolve, 5)); return Response.json({}); }
    if (!expired.has(url)) { expired.add(url); return Response.json({}, { status: 401 }); }
    return Response.json({ ok: true });
  });
});
test("changing warning source data invalidates synchronization; interventions preserve it", async () => {
  await mockBrowser(async () => {
    await runSessionTask("reconcile", async () => { await apiFetch("/api/v1/academic-warnings/reconcile", { method: "POST" }); });
    assert.equal(hasSessionTask("reconcile"), true);
    await apiFetch("/api/v1/academic-warnings/interventions/x/status", { method: "POST" }); assert.equal(hasSessionTask("reconcile"), true);
    await apiFetch("/api/v1/students/x/grades/import", { method: "POST" }); assert.equal(hasSessionTask("reconcile"), false);
  }, () => Response.json({ ok: true }));
});
