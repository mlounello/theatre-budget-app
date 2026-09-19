import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const ccActions = source("../app/cc/actions.ts");
const ccPage = source("../app/cc/page.tsx");
const ccClient = source("../app/cc/cc-page-client.tsx");
const expenseClaimForm = source("../app/cc/expense-claim-form.tsx");
const statementForm = source("../app/cc/create-statement-month-form.tsx");
const procurementPage = source("../app/procurement/page.tsx");
const paginationControls = source("../components/ui/pagination-controls.tsx");
const institutionalPage = source("../app/institutional-budget/page.tsx");
const institutionalLib = source("../lib/institutional-budget.ts");
const dbSource = source("../lib/db.ts");

test("Credit Card writers require explicit fiscal-year scope", () => {
  assert.match(statementForm, /name="fiscalYearId"/);
  assert.match(ccActions, /requireFiscalYearForDate/);
  assert.match(ccActions, /fiscal_year_id: fiscalYearId/);
  assert.match(ccActions, /requireOrganizationMembership/);
  assert.match(ccActions, /projectlessOnly: true/);
});

test("Credit Card UI includes projectless organization reimbursements", () => {
  assert.match(ccClient, /ExpenseClaimForm/);
  assert.match(expenseClaimForm, /organizationId/);
  assert.match(expenseClaimForm, /Organization Budgets/);
  assert.match(ccPage, /getFiscalYearOrganizationOptions\(selectedFiscalYearId\)/);
  assert.match(ccPage, /organizations\(name, org_code\)/);
});

test("Procurement is scoped and paginated on the server", () => {
  assert.match(dbSource, /\.range\(rangeFrom, rangeTo\)/);
  assert.match(dbSource, /purchasesQuery = purchasesQuery\.eq\("fiscal_year_id", params\.fiscalYearId\)/);
  assert.match(procurementPage, /pr_page/);
  assert.match(procurementPage, /PaginationControls/);
  assert.match(paginationControls, /Page \{page\} of \{totalPages\}/);
});

test("institutional commitments use the transaction fiscal year", () => {
  assert.match(institutionalLib, /fiscal_year_id: string/);
  assert.match(institutionalLib, /\.eq\("id", purchaseRow\.fiscal_year_id\)/);
  assert.doesNotMatch(institutionalLib, /organizationFiscalYearId/);
});

test("institutional revenue reports target, received, remaining, and over target", () => {
  assert.match(institutionalPage, /v_institutional_revenue_performance/);
  assert.match(institutionalPage, /Target/);
  assert.match(institutionalPage, /Received/);
  assert.match(institutionalPage, /Remaining/);
  assert.match(institutionalPage, /Over Target/);
  assert.match(institutionalPage, /never available to spend/);
});
