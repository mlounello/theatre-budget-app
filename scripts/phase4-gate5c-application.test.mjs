import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Budget Planning uses one June-May monthly matrix instead of expandable per-row forms", () => {
  const page = read("app/budget-planning/page.tsx");
  const matrix = read("app/budget-planning/budget-planning-matrix.tsx");
  assert.match(page, /<BudgetPlanningMatrix/);
  assert.doesNotMatch(page, /<BudgetPlanningRow/);
  assert.match(page, /Array\.from\(\{ length: 12 \}/);
  assert.match(matrix, /className="planningMatrix"/);
  assert.doesNotMatch(matrix, /<details/);
});

test("matrix separates expense allocations from non-spendable revenue targets", () => {
  const matrix = read("app/budget-planning/budget-planning-matrix.tsx");
  assert.match(matrix, /title="Expense allocations"/);
  assert.match(matrix, /title="Revenue targets"/);
  assert.match(matrix, /never spendable funds/);
  assert.match(matrix, /rows\.filter\(\(row\) => !row\.isRevenue\)/);
  assert.match(matrix, /rows\.filter\(\(row\) => row\.isRevenue\)/);
});

test("prior-year comparison uses the previous fiscal year rather than current-year activity", () => {
  const page = read("app/budget-planning/page.tsx");
  assert.match(page, /const priorFiscalYear =/);
  assert.match(page, /fy\.startDate < selectedStart/);
  assert.match(page, /getHistoricalMonthlyActuals\(\{ fiscalYearId: priorFiscalYear\.id, organizationId \}\)/);
  assert.match(page, /priorAmounts/);
});

test("inline changes expose a visible dirty state and one shared save bar", () => {
  const matrix = read("app/budget-planning/budget-planning-matrix.tsx");
  assert.match(matrix, /dirtyIds/);
  assert.match(matrix, /planningMatrixRow isDirty/);
  assert.match(matrix, /planningSaveBar isDirty/);
  assert.match(matrix, /Save changes/);
  assert.match(matrix, /Discard changes/);
  assert.equal((matrix.match(/<form action=\{action\}/g) ?? []).length, 1);
});

test("matrix save validates all 12 fiscal months and updates annual totals", () => {
  const actions = read("app/budget-planning/actions.ts");
  assert.match(actions, /saveBudgetPlanningMatrixAction/);
  assert.match(actions, /entry\.months\.length === 12/);
  assert.match(actions, /expectedMonthSet/);
  assert.match(actions, /source: "manual"/);
  assert.match(actions, /annual_amount: annualAmount/);
  assert.match(actions, /recomputePercents/);
});

test("institutional allocation imports preserve canonical organizations and fiscal-year memberships", () => {
  const actions = read("app/budget-planning/actions.ts");
  assert.match(actions, /\.is\("superseded_by_organization_id", null\)/);
  assert.match(actions, /fiscal_year_id: null/);
  assert.match(actions, /from\("fiscal_year_organizations"\)\.upsert/);
  assert.doesNotMatch(actions, /\.eq\("fiscal_year_id", fiscalYearId\)\s*\.eq\("org_code", orgCode\)/);
});

test("matrix keeps headers and identifying columns frozen with a mobile fallback", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.planningMatrix thead th[\s\S]*position: sticky/);
  assert.match(css, /\.planningMatrix \.planningStickyAccount/);
  assert.match(css, /\.planningMatrix \.planningStickyPrior/);
  assert.match(css, /\.planningMatrix \.planningStickyAnnual/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.planningMatrix \.planningStickyPrior/);
});
