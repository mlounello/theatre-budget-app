// Unauthenticated smoke test against a locally started production build.
// Requires a prior `npm run build`. Sends no credentials and touches no data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test, { after, before } from "node:test";

const PORT = Number(process.env.SMOKE_PORT ?? 3999);
const BASE = `http://127.0.0.1:${PORT}`;
let server;

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(`${BASE}/login`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Server did not start within 30s");
}

before(async () => {
  server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, CRON_SECRET: "smoke-test-secret", BUDGET_ACCESS_INTEGRATION_SECRET: "smoke-integration-secret" },
    stdio: "ignore"
  });
  await waitForServer();
});

after(() => {
  server?.kill("SIGTERM");
});

const get = (path, init = {}) => fetch(`${BASE}${path}`, { redirect: "manual", ...init });

test("protected pages redirect anonymous visitors to /login and remember the destination", async () => {
  for (const path of ["/", "/procurement", "/contracts", "/settings", "/income"]) {
    const res = await get(path);
    assert.equal(res.status, 307, path);
    const location = new URL(res.headers.get("location"), BASE);
    assert.equal(location.pathname, "/login", path);
    assert.equal(location.searchParams.get("next"), path, path);
  }
});

test("login page renders without authentication", async () => {
  const res = await get("/login");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<html lang="en"/);
});

test("responses carry security headers and a skip-to-content link", async () => {
  const res = await get("/login");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(res.headers.get("strict-transport-security") ?? "", /max-age=\d+/);
  const html = await res.text();
  assert.match(html, /href="#main-content"/);
  assert.match(html, /<main id="main-content"/);
});

test("secret-protected endpoints reject missing and wrong credentials", async () => {
  assert.equal((await get("/api/cron/check-requests")).status, 401);
  assert.equal((await get("/api/cron/check-requests", { headers: { authorization: "Bearer wrong" } })).status, 401);
  const post = (headers) => get("/api/integrations/production-management/budget-access-link", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ email: "x@example.test" })
  });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ authorization: "Bearer wrong" })).status, 401);
});

test("view-as impersonation exit and admin routes do not expose data to anonymous visitors", async () => {
  const res = await get("/api/admin/impersonation/start", { method: "POST" });
  assert.ok([307, 401, 403, 405].includes(res.status), `unexpected ${res.status}`);
});

test("auth callback never redirects to another origin", async () => {
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
    const res = await get(`/auth/callback?next=${encodeURIComponent(next)}`);
    const location = res.headers.get("location");
    if (location) {
      const target = new URL(location, BASE);
      assert.ok(["127.0.0.1", "localhost"].includes(target.hostname) && target.port === String(PORT), `${next} -> ${location}`);
    }
  }
});
