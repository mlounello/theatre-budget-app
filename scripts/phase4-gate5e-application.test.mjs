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
