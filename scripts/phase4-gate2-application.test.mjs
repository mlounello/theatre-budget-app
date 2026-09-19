import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const procurementActions = source("../app/procurement/actions.ts");
const procurementCreateForm = source("../app/procurement/create-order-form.tsx");
const procurementBatchForm = source("../app/procurement/quick-batch-add-form.tsx");
const incomeActions = source("../app/income/actions.ts");
const incomeForm = source("../app/income/add-income-form.tsx");
const incomeTable = source("../app/income/income-table.tsx");
const institutionalBudgetPage = source("../app/institutional-budget/page.tsx");
const dbSource = source("../lib/db.ts");

test("new procurement writers require and persist fiscal year", () => {
  assert.match(procurementCreateForm, /name="fiscalYearId"/);
  assert.match(procurementBatchForm, /name="fiscalYearId"/);
  assert.match(procurementActions, /if \(!fiscalYearId\) return err\("Fiscal year is required\."\)/);
  assert.match(procurementActions, /fiscal_year_id: fiscalYearId/);
  assert.match(procurementActions, /validateOrganizationFiscalYear/);
});

test("income create and edit writers require explicit fiscal year membership", () => {
  assert.match(incomeForm, /name="fiscalYearId"/);
  assert.match(incomeTable, /name="fiscalYearId"/);
  assert.match(incomeTable, /editingRow\.explicitFiscalYearId/);
  assert.doesNotMatch(incomeTable, /name="fiscalYearId" value=\{editingRow\.fiscalYearId/);
  assert.match(incomeActions, /requireFiscalYearOrganizationMembership/);
  assert.match(incomeActions, /fiscal_year_id: fiscalYearId/);
});

test("organization selectors use the fiscal-year membership resolver", () => {
  assert.match(dbSource, /export async function getFiscalYearOrganizationOptions/);
  assert.match(dbSource, /\.from\("fiscal_year_organizations"\)/);
  assert.match(dbSource, /getContractsData[\s\S]*?getFiscalYearOrganizationOptions\(\)/);
  assert.match(dbSource, /getBudgetPlanningOptions[\s\S]*?getFiscalYearOrganizationOptions\(\)/);
  assert.match(dbSource, /getProcurementData[\s\S]*?getFiscalYearOrganizationOptions\(\)/);
  assert.match(institutionalBudgetPage, /getFiscalYearOrganizationOptions\(fiscalYearId\)/);
});

test("income reads prefer explicit fiscal year but preserve the legacy display fallback", () => {
  assert.match(dbSource, /const fiscalYearId = explicitFiscalYearId \?\? projectFiscalYearId \?\? fallbackFy\?\.id/);
  assert.match(dbSource, /explicitFiscalYearId,/);
});
