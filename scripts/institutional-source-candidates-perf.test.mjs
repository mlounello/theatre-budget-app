import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261128020000_speed_up_institutional_source_candidates.sql", import.meta.url),
  "utf8"
);

test("source-candidates function keeps its signature, result columns and invoker security", () => {
  assert.match(migration, /create or replace function app_theatre_budget\.get_institutional_source_candidates\(/);
  for (const param of ["p_fiscal_year_id uuid", "p_organization_id uuid", "p_account_code_id uuid", "p_month_start date", "p_search text", "p_target_organization_id uuid", "p_allow_cross_org boolean"]) {
    assert.ok(migration.includes(param), param);
  }
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(migration, /security definer/);
  assert.match(migration, /set search_path = pg_catalog, app_theatre_budget, public/);
  assert.match(migration, /grant execute on function app_theatre_budget\.get_institutional_source_candidates\(uuid, uuid, uuid, date, text, uuid, boolean\) to authenticated/);
});

test("availability view is computed once and filtered by fiscal year before row filtering", () => {
  assert.match(migration, /with a as materialized \(/);
  assert.match(migration, /where p_fiscal_year_id is null or v\.fiscal_year_id = p_fiscal_year_id/);
  assert.match(migration, /not a\.is_revenue/);
  assert.match(migration, /a\.official_available_amount > 0/);
  assert.match(migration, /#variable_conflict use_column/);
});

test("migration is additive: no drops and no table changes", () => {
  assert.doesNotMatch(migration, /\bdrop\s+(table|view|column|function)\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
});
