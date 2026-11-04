import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("month-end reconciliation stores dated account snapshots without changing financial lines", async () => {
  const migration = await read("supabase/migrations/20261104120000_banner_month_end_reconciliation.sql");
  assert.match(migration, /create table if not exists app_theatre_budget\.banner_reconciliation_periods/);
  assert.match(migration, /unique \(fiscal_year_id, organization_id, account_code_id, as_of_date\)/);
  assert.match(migration, /ytd_control_total numeric\(12, 2\) not null/);
  assert.match(migration, /enc_control_total numeric\(12, 2\) not null/);
  assert.match(migration, /enc_detail_total numeric\(12, 2\) not null/);
  assert.doesNotMatch(migration, /(?:insert|update|delete)\s+(?:into\s+)?app_theatre_budget\.purchase_invoice_transactions/i);
});
test("reconciliation accepts Banner Finance XLS and Argos ENC controls", async () => {
  const parser = await read("lib/banner-reconciliation-files.ts");
  assert.match(parser, /parseBannerFinanceEncWorkbook/);
  assert.match(parser, /parseArgosEncControlCsv/);
  assert.match(parser, /transaction date/);
  assert.match(parser, /report total/i);
  assert.match(parser, /sheet_to_json/);
});

test("the account drawer groups YTD lines by document and validates YTD and ENC totals", async () => {
  const reconciliation = await read("app/procurement/banner-account-reconciliation.tsx");
  assert.match(reconciliation, /Assign entire document/);
  assert.match(reconciliation, /Argos ENC control/);
  assert.match(reconciliation, /Banner Finance ENC detail/);
  assert.match(reconciliation, /Save reconciled period/);
  assert.match(reconciliation, /Unresolved ENC documents/);
});

test("server finalization independently compares current app totals before closing", async () => {
  const actions = await read("app/procurement/actions.ts");
  assert.match(actions, /finalizeBannerReconciliationAction/);
  assert.match(actions, /v_actuals_by_banner_code/);
  assert.match(actions, /banner_reconciliation_periods/);
  assert.match(actions, /The account cannot be marked reconciled/);
});
