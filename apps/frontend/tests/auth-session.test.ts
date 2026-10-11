import assert from "node:assert/strict";
import test from "node:test";
import { useAuthStore } from "../stores/authStore";
import { apiFetch, hasApiData, setApiCacheScope } from "../lib/api-client";

test("server session initializes permissions without another auth request and invalidates caches when grants change", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { origin: "http://localhost:3000" } } });
  const calls: string[] = [];
  globalThis.fetch = async input => { calls.push(input.toString()); return Response.json({ items: [] }); };
  try {
    const session = { user: { id: "session-user", username: "test", fullName: "Test" }, actor: { grants: [{ role: "admin", scope: "system", permission: "*" }] } };
    useAuthStore.getState().initializeSession(session);
    assert.equal(useAuthStore.getState().status, "authenticated");
    assert.equal(useAuthStore.getState().can("academic_warning.calculate"), true);
    assert.equal(calls.length, 0);
    await apiFetch("/api/v1/students");
    assert.equal(hasApiData("/api/v1/students"), true);
    useAuthStore.getState().initializeSession({ ...session, actor: { grants: [{ role: "class_advisor", scope: "class:C1", permission: "student.read" }] } });
    assert.equal(useAuthStore.getState().can("student.read"), true);
    assert.equal(useAuthStore.getState().can("academic_warning.calculate"), false);
    assert.equal(useAuthStore.getState().hasDataScope("class:C2"), false);
    assert.equal(hasApiData("/api/v1/students"), false);
    assert.deepEqual(calls, ["/api/v1/students"]);
  } finally {
    setApiCacheScope(""); globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow); else Reflect.deleteProperty(globalThis, "window");
  }
});
