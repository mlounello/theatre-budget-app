import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("credit cards keeps its focused workspaces and adds Expense Claims", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  assert.match(client, /Current Statement/);
  assert.match(client, /Expense Claims/);
  assert.match(client, /Exceptions/);
  assert.match(client, /Statement History/);
  assert.match(client, /Cards & Setup/);
  assert.match(client, /ccWorkspaceNav/);
  assert.match(client, /selectedView === "current"/);
  assert.match(client, /selectedView === "exceptions"/);
  assert.match(client, /selectedView === "history"/);
  assert.match(client, /selectedView === "setup"/);
});

test("only one selected or current statement renders its transaction workflow", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  assert.match(client, /statementMonths\.find\(\(month\) => month\.id === requestedStatementId\)/);
  assert.match(client, /statementMonths\.find\(\(month\) => !month\.postedAt\)/);
  assert.match(client, /selectedStatementLines/);
  assert.match(client, /currentStatementRows/);
  assert.doesNotMatch(client, /filteredStatementMonths\.map\(\(month\) => \{/);
});

test("statement lifecycle actions remain in the current-statement workspace", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  assert.match(client, /assignReceiptsToStatementAction/);
  assert.match(client, /unassignReceiptFromStatementAction/);
  assert.match(client, /submitStatementMonthAction/);
  assert.match(client, /postStatementMonthToBannerAction/);
  assert.match(client, /reopenStatementMonthAction/);
  assert.match(client, /unpostStatementMonthFromBannerAction/);
});

test("exceptions identify missing receipts, unassigned cards, and excluded records", async () => {
  const client = await read("app/cc/cc-page-client.tsx");
  assert.match(client, /Missing Receipts/);
  assert.match(client, /Unassigned Card/);
  assert.match(client, /Other Exceptions/);
  assert.match(client, /Transactions Needing Attention/);
  assert.match(client, /exceptionRows\.map/);
});

test("projectless organization reimbursements remain supported", async () => {
  const page = await read("app/cc/page.tsx");
  const form = await read("app/cc/expense-claim-form.tsx");
  const actions = await read("app/cc/expense-claim-actions.ts");
  assert.match(page, /organizationOptions\.filter\(\(organization\) => !organization\.projectTrackingRequired\)/);
  assert.match(form, /Organization Budget/);
  assert.match(form, /name="organizationId"/);
  assert.match(form, /name="fiscalYearId" value=\{fiscalYearId\}/);
  assert.match(actions, /organizationId/);
});

test("cards and statement administration can render independently", async () => {
  const admin = await read("app/cc/cc-admin-tables.tsx");
  const client = await read("app/cc/cc-page-client.tsx");
  assert.match(admin, /section\?: "cards" \| "months" \| "all"/);
  assert.match(admin, /section !== "months"/);
  assert.match(admin, /section !== "cards"/);
  assert.match(client, /section="months"/);
  assert.match(client, /section="cards"/);
});
