import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("organization options and hierarchy use fiscal-year memberships", () => {
  const db = read("lib/db.ts");
  assert.match(db, /getOrganizationOptions[\s\S]*getFiscalYearOrganizationOptions\(\)/);
  assert.match(db, /getHierarchyRows[\s\S]*fiscal_year_organizations[\s\S]*membershipSort/);
});

test("settings creates one canonical organization and fiscal-year memberships", () => {
  const actions = read("app/settings/actions.ts");
  assert.match(actions, /createOrganizationAction[\s\S]*fiscal_year_id:\s*null/);
  assert.match(actions, /createOrganizationAction[\s\S]*from\("fiscal_year_organizations"\)\.insert/);
  assert.doesNotMatch(actions, /const organizationRows = \(fiscalYearIds/);
});

test("settings edits membership participation and archives instead of deleting organizations", () => {
  const actions = read("app/settings/actions.ts");
  assert.match(actions, /updateOrganizationAction[\s\S]*fiscal_year_organizations[\s\S]*onConflict:\s*"fiscal_year_id,organization_id"/);
  assert.match(actions, /deleteOrganizationAction[\s\S]*update\(\{ active: false \}\)/);
  assert.doesNotMatch(actions, /deleteOrganizationAction[\s\S]*from\("organizations"\)\.delete\(\)/);
  assert.match(actions, /reorderOrganizationsAction[\s\S]*fiscal_year_organizations/);
});

test("organization-scoped authorization uses the transaction fiscal year", () => {
  const procurement = read("app/procurement/actions.ts");
  const dashboard = read("app/dashboard-actions.ts");
  assert.match(procurement, /getPurchaseScope[\s\S]*fiscal_year_id/);
  assert.match(procurement, /ensureOrganizationPmOrAdminAccess\(organizationId: string, fiscalYearId: string\)/);
  assert.match(dashboard, /ensureOrganizationPmOrAdminAccess[\s\S]*fiscalYearId: string/);
  assert.doesNotMatch(procurement, /ensureOrganizationPmOrAdminAccess[\s\S]*select\("id, fiscal_year_id"\)[\s\S]*\.from\("organizations"\)/);
});

test("institutional organization resolution uses active memberships", () => {
  const institutional = read("lib/institutional-budget.ts");
  assert.match(institutional, /resolveInstitutionalOrganizationId[\s\S]*from\("fiscal_year_organizations"\)/);
  assert.match(institutional, /superseded_by_organization_id/);
});
