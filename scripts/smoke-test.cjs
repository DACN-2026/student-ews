const assert = require("node:assert/strict");

const frontend = process.env.SMOKE_FRONTEND_URL || "http://localhost:3000";
const backend = process.env.SMOKE_BACKEND_URL || "http://127.0.0.1:3001";
const origin = new URL(frontend).origin;

async function request(base, pathname, options = {}) {
  return fetch(new URL(pathname, base), {
    redirect: "manual", signal: AbortSignal.timeout(15_000), ...options,
  });
}

async function main() {
  assert.equal((await request(frontend, "/login")).status, 200, "login page");
  const dashboard = await request(frontend, "/dashboard");
  assert.equal(dashboard.status, 307, "anonymous dashboard redirects");
  const renewal = new URL(dashboard.headers.get("location"), frontend);
  assert.equal(renewal.pathname, "/renew");
  assert.equal(renewal.searchParams.get("next"), "/dashboard");
  assert.equal((await request(frontend, `${renewal.pathname}${renewal.search}`)).status, 200, "renewal page can recover a refresh-cookie session");
  assert.equal((await request(frontend, "/api/v1/auth/refresh", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" })).status, 400, "missing refresh token is rejected");

  for (const base of [backend, frontend]) {
    const health = await request(base, "/api/v1/healthz", {
      headers: { "x-request-id": "monorepo-smoke" },
    });
    assert.equal(health.status, 200, `database health via ${base}`);
    assert.equal((await health.json()).database, "connected");
    assert.equal(health.headers.get("x-request-id"), "monorepo-smoke");
    assert.equal((await request(base, "/api/v1/students?page=2&page_size=1")).status, 401);
  }

  const login = await request(frontend, "/api/v1/auth/login", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
  });
  assert.equal(login.status, 400, "allowed-origin request reaches login validation");
  const crossOrigin = await request(frontend, "/api/v1/auth/login", {
    method: "POST", headers: { origin: "https://untrusted.invalid", "content-type": "application/json" }, body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "INVALID_ORIGIN");

  const invalidSession = await request(frontend, "/dashboard", {
    headers: { cookie: "sms_access_token=invalid" },
  });
  if (invalidSession.status === 307) {
    assert.equal(new URL(invalidSession.headers.get("location"), frontend).pathname, "/renew");
  } else {
    // An async layout can start streaming before auth finishes. Next.js then
    // sends the redirect as a refresh meta tag with HTTP 200.
    assert.equal(invalidSession.status, 200);
    const html = await invalidSession.text();
    const target = html.match(/<meta[^>]+id="__next-page-redirect"[^>]+content="\d+;url=([^"]+)"/)?.[1];
    assert.ok(target, "forged cookie must produce a streamed redirect");
    assert.equal(new URL(target.replaceAll("&amp;", "&"), frontend).pathname, "/renew");
  }

  // No refresh cookie is sent: this checks cookie forwarding without revoking a session.
  const logout = await request(frontend, "/api/v1/auth/logout", { method: "POST", headers: { origin } });
  assert.equal(logout.status, 200);
  const cleared = logout.headers.getSetCookie();
  assert.equal(cleared.length, 2, "proxy must preserve both Set-Cookie headers");
  assert.ok(cleared.some((value) => /^sms_access_token=/.test(value) && /Path=\//i.test(value)));
  assert.ok(cleared.some((value) => /^sms_refresh_token=/.test(value) && /Path=\/api\/v1\/auth/i.test(value)));
  assert.ok(cleared.every((value) => /HttpOnly/i.test(value) && /Max-Age=0/i.test(value)));

  // Supply a test-account token to check authenticated reads without changing data.
  if (process.env.SMOKE_ACCESS_TOKEN) {
    const headers = { cookie: `sms_access_token=${process.env.SMOKE_ACCESS_TOKEN}` };
    const direct = await request(backend, "/api/v1/auth/me", { headers });
    const proxied = await request(frontend, "/api/v1/auth/me", { headers });
    assert.equal(direct.status, 200);
    assert.equal(proxied.status, 200);
    assert.deepEqual(await proxied.json(), await direct.json());
    assert.equal((await request(frontend, "/dashboard", { headers })).status, 200);
    const route = "/api/v1/students?page=2&page_size=1";
    const directStudents = await request(backend, route, { headers });
    const proxiedStudents = await request(frontend, route, { headers });
    assert.equal(directStudents.status, 200, "test account needs student.read");
    assert.equal(proxiedStudents.status, 200);
    assert.deepEqual(await proxiedStudents.json(), await directStudents.json());
    console.log("PASS authenticated session, dashboard and paginated API forwarding");

    const conductStudentId = process.env.SMOKE_STUDENT_ID;
    if (conductStudentId) {
      const conduct = await request(frontend, `/api/v1/students/${encodeURIComponent(conductStudentId)}/conduct`, { headers });
      assert.equal(conduct.status, 200, "test account needs student.read for conduct smoke test");
      const conductPayload = await conduct.json();
      assert.ok(Array.isArray(conductPayload.items), "conduct response contains items");
      console.log("PASS conduct profile endpoint");
    } else {
      console.log("SKIP conduct profile: set SMOKE_STUDENT_ID");
    }

    const completionRuns = await request(frontend, "/api/v1/training-progress/completion-runs?pageSize=1", { headers });
    assert.equal(completionRuns.status, 200, "test account needs progress.read for graduation forecast smoke test");
    console.log("PASS graduation forecast completion-run endpoint");

    if (process.env.SMOKE_EXPORTS === "1") {
      const xlsx = await request(frontend, "/api/v1/reports/export?format=xlsx&type=warnings", { headers });
      assert.equal(xlsx.status, 200, "test account needs report.export");
      assert.match(xlsx.headers.get("content-type") || "", /spreadsheetml/);
      assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString("ascii"), "PK");
      const pdf = await request(frontend, "/api/v1/reports/export?format=pdf&type=warnings", { headers });
      assert.equal(pdf.status, 200, "test account needs report.export");
      assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString("ascii"), "%PDF");
      console.log("PASS XLSX and PDF report export (audit entries created)");
    } else {
      console.log("SKIP export smoke: set SMOKE_EXPORTS=1 (creates report.export audit entries)");
    }
  } else {
    console.log("SKIP authenticated reads: set SMOKE_ACCESS_TOKEN for a test account with student.read");
  }
  console.log("PASS login page, navigation guard, database health, API proxy, origin checks and cookie forwarding");
}

main().catch((error) => {
  // Assertion values may contain a session or personal data: print only the message.
  console.error(error.message.split("\n")[0]);
  process.exitCode = 1;
});
