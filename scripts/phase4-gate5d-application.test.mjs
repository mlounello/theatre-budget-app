import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("institutional budget keeps the monthly matrix with compact and detail modes", async () => {
  const page = await read("app/institutional-budget/page.tsx");
  assert.match(page, /viewMode = resolvedSearchParams\?\.view === "detail" \? "detail" : "compact"/);
  assert.match(page, /Monthly Availability Matrix/);
  assert.match(page, /institutionalGrid-\$\{viewMode\}/);
  assert.match(page, /institutionalGroupRow/);
  assert.match(page, /Allocated/);
  assert.match(page, /Committed/);
  assert.match(page, /Available/);
});

test("needs-variance focus and direct variance creation remain available", async () => {
  const page = await read("app/institutional-budget/page.tsx");
  assert.match(page, /name="negativeOnly"/);
  assert.match(page, /Needs variance/);
  assert.match(page, /createVarianceFromBucketAction/);
  assert.match(page, /createBulkVarianceFromBucketsAction/);
});

test("revenue performance exposes target, received, remaining, and over-target values", async () => {
  const page = await read("app/income/page.tsx");
  const db = await read("lib/db.ts");
  assert.match(page, /<h1>Revenue<\/h1>/);
  assert.match(page, /Revenue Performance/);
  assert.match(page, /performanceTotals\.target/);
  assert.match(page, /performanceTotals\.received/);
  assert.match(page, /performanceTotals\.remaining/);
  assert.match(page, /performanceTotals\.over/);
  assert.match(db, /getRevenuePerformanceRows/);
  assert.match(db, /v_institutional_revenue_performance/);
});

test("new revenue must use an institutional target and cannot create starting-budget records", async () => {
  const form = await read("app/income/add-income-form.tsx");
  const actions = await read("app/income/actions.ts");
  assert.doesNotMatch(form, /<option value="starting_budget">/);
  assert.match(form, /targetAccountCodes/);
  assert.match(form, /Select targeted revenue account/);
  assert.match(actions, /requireRevenueTarget/);
  assert.match(actions, /New starting-budget entries are managed in Budget Planning/);
});

test("historical starting-budget records remain visible and editable as legacy data", async () => {
  const page = await read("app/income/page.tsx");
  const table = await read("app/income/income-table.tsx");
  assert.match(page, /Historical Starting-Budget Records/);
  assert.match(page, /legacyStartingBudget/);
  assert.match(table, /Legacy Starting Budget/);
  assert.match(table, /editingRow\.incomeType === "starting_budget"/);
});

test("navigation names the workspace Revenue without changing its URL", async () => {
  const nav = await read("components/top-nav.tsx");
  assert.match(nav, /href: "\/income", label: "Revenue"/);
});
