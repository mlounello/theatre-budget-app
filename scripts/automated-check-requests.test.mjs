import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("automatic check requests are review-gated and scheduled", async () => {
  const [action, cron, migration, vercel] = await Promise.all([
    read("app/contracts/actions.ts"),
    read("app/api/cron/check-requests/route.ts"),
    read("supabase/migrations/20261031120000_automated_check_requests_payroll.sql"),
    read("vercel.json")
  ]);
  assert.match(action, /workflow_status !== "siena_signed"/);
  assert.match(action, /union_signature_status !== "complete"/);
  assert.match(action, /Upload the artist's W-9/);
  assert.match(cron, /accountspayable@siena\.edu/);
  assert.match(cron, /automation_status", "ready"/);
  assert.match(cron, /status: "check_request_submitted"/);
  assert.match(migration, /w9_attachment_path/);
  assert.match(vercel, /api\/cron\/check-requests/);
});

test("temporary employee schedules use equal biweekly payroll rows", async () => {
  const action = await read("app/contracts/actions.ts");
  assert.match(action, /cursor\.setUTCDate\(cursor\.getUTCDate\(\) \+ 14\)/);
  assert.match(action, /splitAmounts\(contractValue, installmentCount\)/);
  assert.match(action, /payment_channel: engagementType === "temporary_employee" \? "payroll"/);
});
