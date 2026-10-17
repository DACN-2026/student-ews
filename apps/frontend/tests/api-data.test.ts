import assert from "node:assert/strict";
import test from "node:test";
import { fetchAllApiItems, listItems } from "../lib/api-data";
import { safeNextPath } from "../lib/safe-next-path";

test("catalog loading respects a server cap and includes every page", async context => {
  const urls: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = input.toString(); urls.push(url);
    const page = Number(new URL(url, "http://localhost").searchParams.get("page"));
    return Response.json({ items: page === 1 ? [1, 2] : [3], total: 3, pageSize: 2, page });
  });
  assert.deepEqual(await fetchAllApiItems<number>("/api/v1/courses?q=test"), [1, 2, 3]);
  assert.equal(urls.length, 2); assert.ok(urls.every(url => url.includes("q=test")));
});

test("a failed later catalog page is reported instead of appearing as complete data", async context => {
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => new URL(input.toString(), "http://localhost").searchParams.get("page") === "1"
    ? Response.json({ items: [1], total: 2 }) : Response.json({ error: { message: "Thử lại sau" } }, { status: 503 }));
  await assert.rejects(fetchAllApiItems("/api/v1/courses"), /Thử lại sau/);
  assert.throws(() => listItems({ total: 1 } as never), /định dạng/);
});

test("login preserves internal deep links and rejects external destinations and loops", () => {
  assert.equal(safeNextPath("/students/123?tab=warnings"), "/students/123?tab=warnings");
  for (const candidate of ["https://evil.test", "//evil.test", "/\\evil.test", "/renew", "/login?next=/login", "/\nevil.test"]) assert.equal(safeNextPath(candidate), "/dashboard");
});
