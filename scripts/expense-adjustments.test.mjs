import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261128120000_expense_claim_expense_adjustments.sql");
const actions = read("app/cc/actions/expenses.ts");
const panel = read("app/cc/expense-claims-panel.tsx");
const receipts = read("app/cc/actions/receipts.ts");
const client = read("app/cc/cc-page-client.tsx");

test("expense adjustment functions are invoker, guarded, audited and additive", () => {
  for (const name of ["adjust_expense_details", "move_expense_to_claim", "delete_expense_restage_receipts"]) {
    assert.match(migration, new RegExp(`create or replace function app_theatre_budget\\.${name}\\(`));
    assert.match(migration, new RegExp(`grant execute on function app_theatre_budget\\.${name}\\(`));
  }
  assert.doesNotMatch(migration, /security definer/);
  assert.doesNotMatch(migration, /\bdrop\s+(table|column|function|view)\b/i);
  assert.match(migration, /assert_expense_actor\(p_user_id\)/);
  assert.match(migration, /assert_expense_unlocked\(v_purchase\)/);
  assert.match(migration, /posted_at is not null or v_statement\.posted_to_banner_at is not null/);
  assert.match(migration, /insert into app_theatre_budget\.expense_adjustments/);
  assert.match(migration, /get diagnostics v_rows = row_count/);
});

test("deleting an Expense returns receipts to the staged pool before the cascade can remove them", () => {
  const fn = migration.slice(migration.indexOf("function app_theatre_budget.delete_expense_restage_receipts"));
  const restage = fn.indexOf("set purchase_id = v_purchase.authorization_purchase_id, cc_statement_month_id = null");
  const remove = fn.indexOf("delete from app_theatre_budget.purchases");
  assert.ok(restage > 0 && remove > restage, "receipts are re-staged before the purchase is deleted");
  assert.match(fn, /array_remove\(matched_purchase_ids, v_purchase\.id\)/);
  assert.match(fn, /refresh_expense_claim_settled\(v_claim\.id\)/);
  assert.match(fn, /refresh_card_authorization\(v_purchase\.authorization_purchase_id\)/);
  assert.match(fn, /monthly_reconciliation/);
});

test("moving an Expense keeps card and month, refreshes both claim totals, and only targets compatible claims", () => {
  const fn = migration.slice(migration.indexOf("function app_theatre_budget.move_expense_to_claim"), migration.indexOf("function app_theatre_budget.delete_expense_restage_receipts"));
  assert.match(fn, /credit_card_id is distinct from v_source\.credit_card_id/);
  assert.match(fn, /claim_month is distinct from v_source\.claim_month/);
  assert.match(fn, /refresh_expense_claim_settled\(v_source\.id\)/);
  assert.match(fn, /refresh_expense_claim_settled\(v_target\.id\)/);
  assert.match(fn, /v_number !~ '\^EC\[0-9\]\{6\}\$'/);
});

test("server actions call the new functions with the signed-in user and require confirmation to delete", () => {
  for (const rpc of ["adjust_expense_details", "move_expense_to_claim", "delete_expense_restage_receipts"]) {
    assert.match(actions, new RegExp(`rpc\\("${rpc}"`));
  }
  assert.equal((actions.match(/requireCcManagerRole\(\)/g) ?? []).length, 3);
  assert.match(actions, /confirmDelete/);
  assert.match(actions, /createInstitutionalCommitmentForPurchase/);
});

test("claims panel exposes Adjust with edit, move and delete, limited to reconciled Expenses for move and delete", () => {
  assert.match(panel, />Adjust</);
  assert.match(panel, /adjustExpenseDetailsAction/);
  assert.match(panel, /moveExpenseToClaimAction/);
  assert.match(panel, /deleteExpenseAction/);
  assert.match(panel, /claimType === "monthly_reconciliation" && target\.expense\.stage === "actual"/);
  assert.match(panel, /name="confirmDelete"/);
});

test("finalize inherits the existing monthly EC for the card and month when no number is typed", () => {
  assert.match(receipts, /Inherit the EC already collecting this card's receipts/);
  assert.match(receipts, /\.eq\("claim_type", "monthly_reconciliation"\)/);
  assert.match(receipts, /More than one Expense Claim exists for this card and month/);
  assert.doesNotMatch(client, /name="claimNumber" pattern="EC\[0-9\]\{6\}" placeholder="EC######" required/);
  assert.match(client, /inheritedClaimNumber/);
});
