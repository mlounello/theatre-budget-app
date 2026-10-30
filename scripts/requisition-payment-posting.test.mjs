import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("paid is the only financial posting point for requisitions", async () => {
  const procurementActions = await read("app/procurement/actions.ts");
  const dashboardActions = await read("app/dashboard-actions.ts");

  assert.match(procurementActions, /if \(procurementStatus === "paid"\) return "posted"/);
  assert.match(dashboardActions, /if \(procurementStatus === "paid"\) return "posted"/);
  assert.doesNotMatch(procurementActions, /invoice_received" \|\| procurementStatus === "paid/);
  assert.doesNotMatch(dashboardActions, /invoice_received" \|\| procurementStatus === "paid/);
});

test("invoice received remains encumbered until payment", async () => {
  const migration = await read("supabase/migrations/20261030130000_restore_paid_requisition_posting.sql");

  assert.match(migration, /procurement_status = 'invoice_received'/);
  assert.match(migration, /status = 'encumbered'/);
  assert.match(migration, /encumbered_amount = b\.encumbered_amount/);
  assert.match(migration, /posted_amount = 0/);
  assert.match(migration, /actual_total <> expected_total/);
});

test("marking an encumbered requisition paid records its posting date once", async () => {
  const procurementActions = await read("app/procurement/actions.ts");
  const dashboardActions = await read("app/dashboard-actions.ts");

  assert.match(procurementActions, /existingPostedDate \|\| todayIsoDate\(\)/);
  assert.match(dashboardActions, /existing\.posted_date[\s\S]*?new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

