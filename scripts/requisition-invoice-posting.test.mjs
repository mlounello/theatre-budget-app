import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("invoice received is the financial posting point in every requisition status action", async () => {
  const procurementActions = await read("app/procurement/actions.ts");
  const dashboardActions = await read("app/dashboard-actions.ts");
  const postingRule = /procurementStatus === "invoice_received" \|\| procurementStatus === "paid"/;

  assert.match(procurementActions, postingRule);
  assert.match(dashboardActions, postingRule);
});

test("marking a posted requisition paid preserves the original posting date", async () => {
  const procurementActions = await read("app/procurement/actions.ts");
  const dashboardActions = await read("app/dashboard-actions.ts");

  assert.match(procurementActions, /existingPostedDate \|\| todayIsoDate\(\)/);
  assert.match(dashboardActions, /existing\.posted_date[\s\S]*?new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("existing invoice-received requisitions are reclassified without changing their amount", async () => {
  const migration = await read("supabase/migrations/20261030120000_invoice_received_posts_requisitions.sql");

  assert.match(migration, /procurement_status in \('invoice_received', 'paid'\)/);
  assert.match(migration, /status = 'posted'/);
  assert.match(migration, /encumbered_amount = 0/);
  assert.match(migration, /posted_amount = b\.posting_amount/);
  assert.match(migration, /actual_total <> expected_total/);
});

