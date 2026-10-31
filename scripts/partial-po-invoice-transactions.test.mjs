import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("partial PO migration stores signed lines against complete PO allocations", async () => {
  const migration = await read("supabase/migrations/20261030143000_partial_po_invoice_transactions.sql");
  assert.match(migration, /create table if not exists app_theatre_budget\.purchase_invoice_transactions/);
  assert.match(migration, /purchase_allocation_id uuid not null/);
  assert.match(migration, /amount numeric\(12, 2\) not null check \(amount <> 0\)/);
  assert.match(migration, /greatest\(allocation\.amount - coalesce\(posting\.posted_amount, 0\), 0\)/);
  assert.match(migration, /v_purchase_allocation_financials/);
});

test("known partially invoiced PO is seeded from the Banner debit and credit lines", async () => {
  const migration = await read("supabase/migrations/20261030143000_partial_po_invoice_transactions.sql");
  assert.match(migration, /purchase\.po_number, ''\)\) = 'EP023217'/);
  assert.match(migration, /'I0547718', date '2026-10-20', -8\.99/);
  assert.match(migration, /'I0547893', date '2026-10-26', 34\.53/);
  assert.match(migration, /invoice_tracking_enabled = true/);
});

test("procurement exposes a compact grouped transaction manager", async () => {
  const [table, actions] = await Promise.all([
    read("app/procurement/procurement-table.tsx"),
    read("app/procurement/actions.ts")
  ]);
  assert.match(table, /Manage transactions/);
  assert.match(table, /Grouped by invoice or credit number/);
  assert.match(table, /purchaseAllocationId/);
  assert.match(actions, /addPurchaseInvoiceTransactionAction/);
  assert.match(actions, /voidPurchaseInvoiceTransactionAction/);
  assert.match(actions, /invoiceTrackingEnabled/);
});

test("transaction manager supports continuous keyboard entry", async () => {
  const table = await read("app/procurement/procurement-table.tsx");
  assert.match(table, /data-invoice-field/);
  assert.match(table, /handleInvoiceEntryKeyDown/);
  assert.match(table, /invoiceAmountInputRef\.current\?\.focus/);
  assert.match(table, /setInvoiceTransactionDraft\(\(current\) => \(\{ \.\.\.current, amount: "" \}\)\)/);
  assert.match(table, /blankInvoiceTransaction\(defaultInvoiceAllocationId\)/);
  assert.match(table, /Invoice, date, type, description, and allocation stay in place/);
  assert.match(table, /Next line is ready/);
  assert.match(table, /Enter<\/kbd> save and start the next line/);
});

test("unsplit POs auto-select their allocation and CSV imports are duplicate-safe", async () => {
  const [table, importer, actions, migration] = await Promise.all([
    read("app/procurement/procurement-table.tsx"),
    read("app/procurement/invoice-csv-import.tsx"),
    read("app/procurement/actions.ts"),
    read("supabase/migrations/20261030143000_partial_po_invoice_transactions.sql")
  ]);
  assert.match(table, /editingAllocations\.length === 1/);
  assert.match(table, /invoiceAutoAllocation/);
  assert.match(table, /<InvoiceCsvImport/);
  assert.match(importer, /Import Banner CSV/);
  assert.match(importer, /DOC_CODE/);
  assert.match(importer, /Select all/);
  assert.match(importer, /Choose allocation/);
  assert.match(actions, /importPurchaseInvoiceTransactionsAction/);
  assert.match(actions, /source_line_key/);
  assert.match(actions, /error\?\.code === "23505"/);
  assert.match(migration, /uq_purchase_invoice_transactions_source_line/);
});

test("invoice entry and CSV controls use the app's rounded field styling", async () => {
  const styles = await read("app/globals.css");
  assert.match(styles, /\.invoiceTransactionForm input:not\(\[type="hidden"\]\)/);
  assert.match(styles, /\.invoiceCsvRow select/);
  assert.match(styles, /border-radius: 10px/);
  assert.match(styles, /\.invoiceCsvUpload input::file-selector-button/);
});

test("partially paid is available without collapsing the YTD and ENC buckets", async () => {
  const [table, actions, dashboardActions, migration] = await Promise.all([
    read("app/procurement/procurement-table.tsx"),
    read("app/procurement/actions.ts"),
    read("app/dashboard-actions.ts"),
    read("supabase/migrations/20261030210000_partial_paid_procurement_status.sql")
  ]);
  assert.match(table, /value: "partial_paid", label: "Partially Paid"/);
  assert.match(actions, /"partial_paid"/);
  assert.match(dashboardActions, /"partial_paid"/);
  assert.match(migration, /'partial_paid'/);
  assert.match(migration, /posted_amount > 0[\s\S]*encumbered_amount > 0/);
});

test("partial-payment and receipt workflows render as distinct pills", async () => {
  const [styles, ccPage] = await Promise.all([
    read("app/globals.css"),
    read("app/cc/cc-page-client.tsx")
  ]);
  assert.match(styles, /\.status-partial_paid/);
  assert.match(styles, /\.status-receipts_uploaded/);
  assert.match(styles, /\.status-receipts_uploaded \{[\s\S]*background: #fde7f3;[\s\S]*color: #8a1c55;/);
  assert.match(styles, /\.status-statement_paid/);
  assert.match(styles, /\.status-posted_to_account/);
  assert.match(ccPage, /statusChip status-\$\{purchase\.ccWorkflowStatus/);
  assert.match(ccPage, /ccWorkflowLabel\(purchase\.ccWorkflowStatus\)/);
});

test("rollups count simultaneous YTD and encumbrance instead of choosing one status bucket", async () => {
  const [db, institutional] = await Promise.all([
    read("lib/db.ts"),
    read("lib/institutional-budget.ts")
  ]);
  assert.match(db, /totals\.enc \+= asNumber\(purchase\.encumbered_amount/);
  assert.match(db, /totals\.ytd \+= asNumber\(purchase\.posted_amount/);
  assert.match(institutional, /asNumber\(purchase\.posted_amount\) \+/);
  assert.match(institutional, /asNumber\(purchase\.encumbered_amount\)/);
});
