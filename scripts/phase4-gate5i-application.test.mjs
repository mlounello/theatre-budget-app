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

test("Hiring provides separate artist and union payment schedules without removing budget commitments", async () => {
  const page = await read("app/contracts/page.tsx");
  const actions = await read("app/contracts/actions.ts");
  const dashboard = await read("lib/dashboard-attention.ts");
  assert.match(page, /Payment Schedule/);
  assert.match(page, /Artist Contract Payments/);
  assert.match(page, /Union Pension &amp; Benefit Funds/);
  assert.match(page, /ContractInstallmentControl/);
  assert.match(page, /UnionContributionStatusControl/);
  assert.match(actions, /request_type: "contract_payment"/);
  assert.match(dashboard, /overdueHiringPayments/);
  assert.match(dashboard, /unsubmittedHiringChecks/);
  assert.match(dashboard, /Check request not submitted/);
});

test("Expense Claim actions preserve authorization and require explanations for overages", async () => {
  const actions = await read("app/cc/expense-claim-actions.ts");
  const transaction = await read("supabase/migrations/20260919220000_phase4_gate5j_transactional_expense_claims.sql");
  assert.match(actions, /createExpenseClaimAction/);
  assert.match(actions, /claimNumber/);
  assert.match(actions, /expenseNumber/);
  assert.match(actions, /authorizedAmount/);
  assert.match(actions, /overageExplanation/);
  assert.match(actions, /exceeds the authorized amount/i);
  assert.match(actions, /pending_cc_amount/);
  assert.match(actions, /create_expense_claim_transaction/);
  assert.match(transaction, /purchase_receipts/);
});

test("Credit Cards exposes focused funding, reconciliation, and reimbursement claim entry", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  const panel = await read("app/cc/expense-claims-panel.tsx");
  const form = await read("app/cc/expense-claim-form.tsx");
  assert.match(client, /New Expense Claim/);
  assert.match(panel, /Card Funding Request/);
  assert.match(panel, /Monthly Card Reconciliation/);
  assert.match(panel, /Reimbursement/);
  assert.match(client, /EC######/);
  assert.match(client, /EX######/);
  assert.match(form, /createExpenseClaimAction/);
});

test("Expense Claims are collections while every Expense owns its budget assignment", async () => {
  const form = await read("app/cc/expense-claim-form.tsx");
  const actions = await read("app/cc/expense-claim-actions.ts");
  const migration = await read("supabase/migrations/20260919233000_expense_level_budget_assignments.sql");
  assert.match(form, /Each EX###### Expense and receipt selects its own final budget destination/);
  assert.match(form, /Charge To/);
  assert.match(form, /Production Category/);
  assert.match(form, /Banner Account \/ FOAP Charge/);
  assert.match(actions, /project_id: line\.projectId/);
  assert.match(actions, /banner_account_code_id: line\.bannerAccountCodeId/);
  assert.match(migration, /alter column organization_id drop not null/);
  assert.match(migration, /nullif\(v_expense->>'production_category_id'/);
  assert.match(migration, /v_expense->>'banner_account_code_id'/);
});

test("Existing Expenses can move their final budget destination without changing claim or receipt history", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  const panel = await read("app/cc/expense-claims-panel.tsx");
  const actions = await read("app/cc/actions.ts");
  const migration = await read("supabase/migrations/20260924143000_edit_expense_budget_destinations.sql");
  assert.match(panel, /Edit Budget/);
  assert.match(client, /Expense budget destination/);
  assert.match(client, /Save Budget Destination/);
  assert.match(actions, /updateExpenseBudgetDestinationAction/);
  assert.match(actions, /update_expense_budget_destination/);
  assert.match(migration, /create or replace function app_theatre_budget\.update_expense_budget_destination/);
  assert.match(migration, /delete from app_theatre_budget\.purchase_allocations/);
  assert.match(migration, /update app_theatre_budget\.purchases/);
  assert.match(migration, /Expense budget destination updated/);
});

test("Procurement explicitly separates PO work from Expense Claims", async () => {
  const page = await read("app/procurement/page.tsx");
  const table = await read("app/procurement/procurement-table.tsx");
  assert.match(page, /Purchase Orders do not use Expense Claim or receipt-reconciliation fields/);
  assert.match(table, /Expense Claims are managed in Credit Cards/);
});
