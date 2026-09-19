import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("procurement exposes the four reviewed work queues", async () => {
  const page = await read("app/procurement/page.tsx");
  const db = await read("lib/db.ts");
  assert.match(page, /Needs Attention/);
  assert.match(page, /label: "Open"/);
  assert.match(page, /label: "Paid"/);
  assert.match(page, /label: "All"/);
  assert.match(db, /queue\?: "needs_attention" \| "open" \| "paid" \| "all"/);
  assert.match(db, /needsAttentionFilter/);
  assert.match(db, /\["paid", "posted_to_account"\]/);
});

test("procurement filtering and pagination happen on the server", async () => {
  const page = await read("app/procurement/page.tsx");
  const db = await read("lib/db.ts");
  assert.match(db, /purchasesQuery = purchasesQuery\.range\(rangeFrom, rangeTo\)/);
  assert.match(db, /purchasesQuery = purchasesQuery\.eq\("project_id", params\.projectId\)/);
  assert.match(db, /purchasesQuery = purchasesQuery\.eq\("procurement_status", params\.procurementStatus\)/);
  assert.match(db, /purchasesQuery = purchasesQuery\.eq\("request_type", params\.requestType\)/);
  assert.match(db, /title\.ilike/);
  assert.match(page, /<PaginationControls/);
  assert.match(page, /params\.set\("pr_page", String\(nextPage\)\)/);
});

test("contract and union payments stay out of procurement queues", async () => {
  const page = await read("app/procurement/page.tsx");
  const create = await read("app/procurement/create-order-form.tsx");
  const batch = await read("app/procurement/quick-batch-add-form.tsx");
  const db = await read("lib/db.ts");
  const procurementData = db.slice(db.indexOf("export async function getProcurementData"), db.indexOf("export async function getContractsData"));
  const trackerData = db.slice(db.indexOf("export async function getProcurementTrackerData"), db.indexOf("export async function getContractsData"));
  assert.match(procurementData, /\.neq\("request_type", "contract_payment"\)/);
  assert.match(trackerData, /\.neq\("request_type", "contract_payment"\)/);
  assert.doesNotMatch(page, /<option value="contract_payment">/);
  assert.doesNotMatch(create, /<option value="contract_payment">/);
  assert.doesNotMatch(batch, /<option value="contract_payment">/);
  assert.match(page, /tracked in Hiring &amp; Payments/);
});

test("card expenses show and edit EX identifiers instead of empty requisition and PO labels", async () => {
  const table = await read("app/procurement/procurement-table.tsx");
  const db = await read("lib/db.ts");
  const actions = await read("app/procurement/actions.ts");
  assert.match(db, /reference_number, expense_number, expense_stage, requisition_number/);
  assert.match(db, /expenseNumber: \(row\.expense_number/);
  assert.match(table, /Order \/ Expense #/);
  assert.match(table, /<b>Expense<\/b>/);
  assert.match(table, /name="expenseNumber"/);
  assert.match(table, /placeholder="EX######"/);
  assert.match(actions, /Expense number must use the EX###### format/);
  assert.match(actions, /expense_number: isExpensePurchase/);
});

test("procurement drawer shows only fields relevant to the row workflow", async () => {
  const table = await read("app/procurement/procurement-table.tsx");
  const actions = await read("app/procurement/actions.ts");
  assert.match(table, /editingPurchase\.requestType === "expense"[\s\S]*?Expense Workflow/);
  assert.match(table, /Card Funding Request/);
  assert.match(table, /Monthly Reconciliation Expense/);
  assert.match(table, /editingPurchase\.requestType === "requisition"[\s\S]*?Requisition #/);
  assert.match(table, /editingPurchase\.requestType === "requisition" \? <article className="panel">[\s\S]*?Receiving Docs/);
  assert.match(table, /editingPurchase\.requestType === "expense" \? <article className="panel">[\s\S]*?Receipts/);
  assert.match(table, /expenseStageLabel/);
  assert.match(actions, /Choose whether this is a card funding request, reconciliation expense, or reimbursement/);
});

test("supporting records are restricted to purchases on the current page", async () => {
  const db = await read("lib/db.ts");
  assert.match(db, /currentPagePurchaseIds/);
  assert.match(db, /\.from\("purchase_receipts"\)[\s\S]*?\.in\("purchase_id", currentPagePurchaseIds\)/);
  assert.match(db, /\.from\("purchase_receiving_docs"\)[\s\S]*?\.in\("purchase_id", currentPagePurchaseIds\)/);
});

test("single and batch creation use shared accessible drawers", async () => {
  const drawers = await read("app/procurement/procurement-create-drawers.tsx");
  assert.match(drawers, /title="Add Order"/);
  assert.match(drawers, /title="Quick Batch Add"/);
  assert.match(drawers, /<SideDrawer/);
  assert.match(drawers, /<CreateOrderForm/);
  assert.match(drawers, /<QuickBatchAddForm/);
});

test("record and bulk editing use drawers while bulk selection remains available", async () => {
  const table = await read("app/procurement/procurement-table.tsx");
  assert.match(table, /<BulkSelectionToolbar/);
  assert.match(table, /toggleSelectAllVisible/);
  assert.match(table, /toggleRowSelection\(purchase\.id\)/);
  assert.match(table, /title=\{editingPurchase\.title\}/);
  assert.match(table, /title="Bulk Edit Procurement Rows"/);
  assert.doesNotMatch(table, /className="modalOverlay"/);
});

test("the default table is concise with optional columns and friendly labels", async () => {
  const table = await read("app/procurement/procurement-table.tsx");
  assert.match(table, /const OPTIONAL_COLUMNS/);
  assert.match(table, /<summary>Columns<\/summary>/);
  assert.match(table, /useState<OptionalColumn\[]>\(\["department", "account"\]\)/);
  assert.match(table, /function procurementLabel/);
  assert.match(table, /function budgetStatusLabel/);
  assert.match(table, /Partially Received/);
  assert.match(table, /Pending Card/);
});
