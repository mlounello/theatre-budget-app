import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("database clients use the generated application schema types", async () => {
  const types = await read("lib/database.types.ts");
  const browser = await read("lib/supabase-client.ts");
  const server = await read("lib/supabase-server.ts");
  assert.match(types, /export type Database/);
  assert.match(types, /app_theatre_budget/);
  assert.match(browser, /createBrowserClient<Database,/);
  assert.match(server, /createServerClient<Database,/);
});

test("financial actions validate structured input at runtime", async () => {
  const validation = await read("lib/validation/financial.ts");
  const action = await read("app/cc/expense-claim-actions.ts");
  assert.match(validation, /expenseClaimInputSchema/);
  assert.match(validation, /EC\\d\{6\}/);
  assert.match(validation, /EX\\d\{6\}/);
  assert.match(validation, /positiveMoneySchema/);
  assert.match(action, /expenseClaimInputSchema\.safeParse/);
});

test("Expense Claims are saved by one transactional database function", async () => {
  const migration = await read("supabase/migrations/20260919220000_phase4_gate5j_transactional_expense_claims.sql");
  const action = await read("app/cc/expense-claim-actions.ts");
  assert.match(migration, /create or replace function app_theatre_budget\.create_expense_claim_transaction/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /insert into app_theatre_budget\.expense_claims/);
  assert.match(migration, /insert into app_theatre_budget\.purchases/);
  assert.match(migration, /insert into app_theatre_budget\.purchase_receipts/);
  assert.match(action, /rpc\("create_expense_claim_transaction"/);
  assert.doesNotMatch(action, /from\("expense_claims"\)\.insert/);
});

test("dense operational tables expose a mobile card alternative and labeled selectors", async () => {
  const table = await read("components/ui/responsive-data-table.tsx");
  const styles = await read("app/globals.css");
  const income = await read("app/income/income-table.tsx");
  const ccAdmin = await read("app/cc/cc-admin-tables.tsx");
  assert.match(table, /ResponsiveDataTable/);
  assert.match(table, /data-label/);
  assert.match(styles, /responsiveDataTable/);
  assert.match(styles, /@media \(max-width: 860px\)/);
  assert.match(income, /aria-label=\{`Select revenue entry/);
  assert.match(ccAdmin, /aria-label="Select all credit cards"/);
  assert.match(ccAdmin, /aria-label="Select all statement months"/);
});

test("dialog primitives preserve keyboard and motion accessibility", async () => {
  const behavior = await read("components/ui/use-dialog-behavior.ts");
  const styles = await read("app/globals.css");
  assert.match(behavior, /event\.key === "Escape"/);
  assert.match(behavior, /event\.key !== "Tab"/);
  assert.match(behavior, /previouslyFocused/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("large workspaces are bounded and operational guidance is checked in", async () => {
  const ccPage = await read("app/cc/page.tsx");
  const claimPanel = await read("app/cc/expense-claims-panel.tsx");
  const settings = await read("app/settings/settings-page-client.tsx");
  const architecture = await read("docs/architecture.md");
  const operations = await read("docs/operations.md");
  const migrations = await read("docs/migrations.md");
  assert.match(ccPage, /EXPENSE_CLAIM_PAGE_SIZE/);
  assert.match(ccPage, /\.range\(/);
  assert.match(claimPanel, /ExpenseClaimsPanel/);
  assert.match(settings, /settingsWorkspaceNav/);
  assert.match(architecture, /Financial boundaries/);
  assert.match(operations, /Expense Claim recovery/);
  assert.match(migrations, /Pre\/post totals/);
});
