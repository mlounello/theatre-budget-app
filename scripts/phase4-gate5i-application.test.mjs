import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Gate 5I migration adds hiring classifications without replacing existing contracts", async () => {
  const migration = await read("supabase/migrations/20260919190000_phase4_gate5i_hiring_expense_claims.sql");
  assert.match(migration, /add column if not exists engagement_type/);
  assert.match(migration, /independent_contractor/);
  assert.match(migration, /union_freelance_artist/);
  assert.match(migration, /temporary_employee/);
  assert.match(migration, /add column if not exists compensation_basis/);
  assert.match(migration, /update app_theatre_budget\.contracts/);
});

test("Expense Claims use EC headers and EX child records", async () => {
  const migration = await read("supabase/migrations/20260919190000_phase4_gate5i_hiring_expense_claims.sql");
  assert.match(migration, /create table if not exists app_theatre_budget\.expense_claims/);
  assert.match(migration, /claim_number/);
  assert.match(migration, /expense_number/);
  assert.match(migration, /expense_claim_id/);
  assert.match(migration, /funding_request/);
  assert.match(migration, /monthly_reconciliation/);
  assert.match(migration, /reimbursement/);
  assert.match(migration, /authorized_amount/);
  assert.match(migration, /authorization_purchase_id/);
  assert.match(migration, /overage_explanation/);
});

test("Hiring UI identifies the three reviewed engagement workflows", async () => {
  const page = await read("app/contracts/page.tsx");
  const create = await read("app/contracts/create-contract-form.tsx");
  const edit = await read("app/contracts/contract-row-actions.tsx");
  assert.match(page, /Hiring &amp; Payments/);
  assert.match(page, /Independent Contractor/);
  assert.match(page, /Union Freelance Artist/);
  assert.match(page, /Temporary Employee/);
  assert.match(create, /name="engagementType"/);
  assert.match(create, /name="compensationBasis"/);
  assert.match(edit, /name="engagementType"/);
  assert.match(edit, /name="compensationBasis"/);
});

test("Hiring keeps existing union, installment, filtering, drawer, and bulk export capabilities", async () => {
  const page = await read("app/contracts/page.tsx");
  const actions = await read("app/contracts/actions.ts");
  assert.match(page, /BulkCheckRequestExport/);
  assert.match(page, /contract\.isUnion/);
  assert.match(page, /ContractRowActions/);
  assert.match(page, /hiringFilters/);
  assert.match(page, /Checks Due/);
  assert.match(page, /Needs Attention/);
  assert.match(page, /CreateHiringDrawers/);
  assert.match(actions, /else \{\s*requestedAmount = amount;/);
});

test("Expense Claim actions preserve authorization and require explanations for overages", async () => {
  const actions = await read("app/cc/expense-claim-actions.ts");
  assert.match(actions, /createExpenseClaimAction/);
  assert.match(actions, /claimNumber/);
  assert.match(actions, /expenseNumber/);
  assert.match(actions, /authorizedAmount/);
  assert.match(actions, /overageExplanation/);
  assert.match(actions, /exceeds the authorized amount/i);
  assert.match(actions, /pending_cc_amount/);
  assert.match(actions, /purchase_receipts/);
});

test("Credit Cards exposes focused funding, reconciliation, and reimbursement claim entry", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  const form = await read("app/cc/expense-claim-form.tsx");
  assert.match(client, /New Expense Claim/);
  assert.match(client, /Card Funding Request/);
  assert.match(client, /Monthly Card Reconciliation/);
  assert.match(client, /Reimbursement/);
  assert.match(client, /EC######/);
  assert.match(client, /EX######/);
  assert.match(form, /createExpenseClaimAction/);
});

test("Procurement explicitly separates PO work from Expense Claims", async () => {
  const page = await read("app/procurement/page.tsx");
  const table = await read("app/procurement/procurement-table.tsx");
  assert.match(page, /Purchase Orders do not use Expense Claim or receipt-reconciliation fields/);
  assert.match(table, /Expense Claims are managed in Credit Cards/);
});
