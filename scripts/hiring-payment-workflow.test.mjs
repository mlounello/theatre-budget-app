import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("canceled hires preserve paid history and stop future payments", async () => {
  const [actions, page, dashboard, calendar] = await Promise.all([
    read("app/contracts/actions.ts"),
    read("app/contracts/page.tsx"),
    read("lib/dashboard-attention.ts"),
    read("lib/contract-calendar.ts")
  ]);

  assert.match(actions, /workflowStatus === "cancelled"/);
  assert.match(actions, /\.eq\("status", "planned"\)/);
  assert.match(actions, /status: "cancelled"/);
  assert.match(page, /value="cancelled">Canceled/);
  assert.match(page, /row\.status !== "cancelled"/);
  assert.match(dashboard, /\(check_paid,cancelled\)/);
  assert.match(calendar, /installment\.status === "cancelled"/);
});

test("check-request export appends an available W-9 for a new vendor", async () => {
  const route = await read("app/contracts/[contractId]/installments/[installmentId]/check-request/route.ts");

  assert.match(route, /w9_attachment_path/);
  assert.match(route, /contract-w9s/);
  assert.match(route, /copyPages\(w9Document/);
  assert.match(route, /!internal/);
});

test("hiring UI distinguishes vendor warnings and payroll checks", async () => {
  const [page, inlineActions, createForm, editForm] = await Promise.all([
    read("app/contracts/page.tsx"),
    read("app/contracts/contract-inline-actions.tsx"),
    read("app/contracts/create-contract-form.tsx"),
    read("app/contracts/contract-row-actions.tsx")
  ]);

  assert.match(page, /Vendor number not assigned/);
  assert.match(page, /`Paycheck \$\{installment\.installmentNumber\}`/);
  assert.match(page, /Biweekly payroll schedule/);
  assert.match(inlineActions, /Paycheck status/);
  assert.match(createForm, /Total Compensation/);
  assert.match(createForm, /First Payroll Date/);
  assert.match(editForm, /Total Compensation/);
  assert.match(editForm, /First Payroll Date/);
});

test("database migration expands hiring cancellation statuses", async () => {
  const migration = await read("supabase/migrations/20261109170000_hiring_cancellation_and_w9_packets.sql");

  assert.match(migration, /contracts_workflow_status_check/);
  assert.match(migration, /contract_installments_status_check/);
  assert.match(migration, /contract_union_contributions_status_check/);
  assert.match(migration, /'cancelled'/);
});
