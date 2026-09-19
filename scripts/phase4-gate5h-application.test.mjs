import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard leads with all seven reviewed attention categories", async () => {
  const page = await read("app/page.tsx");
  for (const label of [
    "Open Requisitions",
    "Missing Receipts",
    "Statements Awaiting Reconciliation",
    "Upcoming Contract Checks",
    "Budget Shortages",
    "Incomplete Variances",
    "Revenue Behind Schedule"
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /dashboardAttentionGrid/);
  assert.match(page, /What Needs Attention/);
});

test("attention data uses existing workflow records without creating mutation paths", async () => {
  const attention = await read("lib/dashboard-attention.ts");
  assert.match(attention, /\.from\("purchases"\)[\s\S]*?\.eq\("status", "pending_cc"\)/);
  assert.match(attention, /purchase_receipts\(id, amount_received\)/);
  assert.match(attention, /\.from\("cc_statement_months"\)/);
  assert.match(attention, /\.from\("contract_installments"\)/);
  assert.match(attention, /\.from\("contract_union_contributions"\)/);
  assert.match(attention, /getRevenuePerformanceRows/);
  assert.doesNotMatch(attention, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("revenue pace uses the selected fiscal year's actual date range", async () => {
  const attention = await read("lib/dashboard-attention.ts");
  assert.match(attention, /fiscalYear\.startDate/);
  assert.match(attention, /fiscalYear\.endDate/);
  assert.match(attention, /expectedToDate = row\.targetAmount \* progress/);
  assert.match(attention, /expectedToDate - row\.receivedAmount/);
});

test("detailed dashboard tables and boards are retained but collapsed by default", async () => {
  const page = await read("app/page.tsx");
  assert.match(page, /Open requisition detail/);
  assert.match(page, /<DashboardRequisitionTable/);
  assert.match(page, /Project and organization budget boards/);
  assert.match(page, /Open Budget Board/);
  assert.match(page, /Open Organization Budget/);
  assert.doesNotMatch(page, /<details[^>]*open/);
});

test("reports hub preserves overview, department totals, project boards, and organization views", async () => {
  const reports = await read("app/reports/page.tsx");
  assert.match(reports, /Detailed Budget Views/);
  assert.match(reports, /Overview/);
  assert.match(reports, /Department Totals/);
  assert.match(reports, /Project Budget Boards/);
  assert.match(reports, /Organization Budget Views/);
  assert.match(reports, /href=\{`\/projects\/\$\{project\.projectId\}`\}/);
});

test("primary navigation keeps reports grouped and procurement tracker role dedicated", async () => {
  const nav = await read("components/top-nav.tsx");
  assert.match(nav, /label: "Reports"[\s\S]*?href: "\/reports", label: "Reports Hub"/);
  assert.match(nav, /href: "\/my-budget", label: "Department Totals"/);
  assert.match(nav, /role === "procurement_tracker"[\s\S]*?href: "\/procurement-tracker"/);
});
