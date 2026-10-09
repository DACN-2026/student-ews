import assert from "node:assert/strict";
import test from "node:test";
import { ApiResponseCache, API_CACHE_TTL } from "../lib/api-response-cache";

const json = (value: unknown, status = 200, headers?: HeadersInit) => Response.json(value, { status, headers });
function cache() { const value = new ApiResponseCache(); value.setScope("user-a"); return value; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("fresh reads share one request and each consumer has an independently readable response", async () => {
  const store = cache(); const gate = deferred<Response>(); let calls = 0;
  const load = async () => { calls++; return gate.promise; };
  const a = store.request("students", load); const b = store.request("students", load);
  gate.resolve(json({ items: ["a"] }));
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(await first.json(), { items: ["a"] }); assert.deepEqual(await second.json(), { items: ["a"] });
  await (await store.request("students", load)).json(); assert.equal(calls, 1);
});
test("query keys stay separate and expired data is fetched again", async () => {
  const store = cache(); let calls = 0; const load = async () => json({ call: ++calls });
  const now = Date.now; let time = now(); Date.now = () => time;
  try {
    await store.request("page=1", load); await store.request("page=2", load); assert.equal(calls, 2);
    time += API_CACHE_TTL + 1;
    assert.equal(store.peek("page=1"), null); assert.deepEqual(store.peek("page=1", true), { call: 1 });
    await store.request("page=1", load); assert.equal(calls, 3);
  } finally { Date.now = now; }
});
test("invalidation cannot be undone by a late response and refresh reads use new data", async () => {
  const store = cache(); const gate = deferred<Response>(); const request = store.request("grades", () => gate.promise);
  store.clear(); gate.resolve(json({ score: 1 })); await request; assert.equal(store.peek("grades"), null);
  await store.request("grades", async () => json({ score: 2 })); assert.deepEqual(store.peek("grades"), { score: 2 });
});
test("switching users or signing out clears cached data and session tasks", async () => {
  const store = cache(); await store.request("students", async () => json({ student: "a" }));
  await store.runTask("reconcile", async () => 1); assert.equal(store.hasTask("reconcile"), true);
  store.setScope("user-b"); assert.equal(store.peek("students"), null); assert.equal(store.hasTask("reconcile"), false);
  await store.request("students", async () => json({ student: "b" })); store.setScope(""); assert.equal(store.peek("students"), null);
});
test("failed, non-JSON, no-store and anonymous responses are never reused", async () => {
  const store = cache();
  for (const [key, response] of [["denied", json({}, 403)], ["error", json({}, 500)], ["private", json({}, 200, { "Cache-Control": "private, no-store" })], ["file", new Response("file")]] as const) {
    await store.request(key, async () => response); assert.equal(store.has(key), false);
  }
  store.setScope(""); await store.request("anonymous", async () => json({})); assert.equal(store.has("anonymous"), false);
});
test("aborting one consumer preserves siblings; the last cancellation aborts the actual fetch", async () => {
  const store = cache(); const gate = deferred<Response>(); const a = new AbortController(); const b = new AbortController(); let actual!: AbortSignal;
  const load = async (signal: AbortSignal) => { actual = signal; return gate.promise; };
  const first = store.request("shared", load, a.signal); const rejected = assert.rejects(first, { name: "AbortError" });
  const second = store.request("shared", load, b.signal); await Promise.resolve(); a.abort(); await rejected; assert.equal(actual.aborted, false);
  gate.resolve(json({ ok: true })); assert.deepEqual(await (await second).json(), { ok: true });
  const last = new AbortController(); const unfinished = deferred<Response>();
  const request = store.request("single", async (signal) => { actual = signal; return unfinished.promise; }, last.signal);
  const failure = assert.rejects(request, { name: "AbortError" }); await Promise.resolve(); last.abort(); await failure; assert.equal(actual.aborted, true); unfinished.resolve(json({}));
});
test("reconciliation is shared, waits for completion, survives read invalidation and retries failures", async () => {
  const store = cache(); let calls = 0; const gate = deferred<number>();
  const task = async () => { calls++; store.clear(); return gate.promise; };
  const first = store.runTask("reconcile", task); const second = store.runTask("reconcile", task);
  assert.equal(store.hasTask("reconcile"), false); gate.resolve(1); await Promise.all([first, second]);
  assert.equal(store.hasTask("reconcile"), true); await store.runTask("reconcile", task); assert.equal(calls, 1);
  await assert.rejects(store.runTask("retry", async () => { throw new Error("offline"); }));
  assert.equal(await store.runTask("retry", async () => "ok"), "ok");
});
