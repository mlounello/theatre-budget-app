import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/202607231700_gate_l1_theatre_budget_function_auth.sql",
    import.meta.url,
  ),
  "utf8",
);
const rollback = readFileSync(
  new URL("./gate-l1-production-rollback.sql", import.meta.url),
  "utf8",
);

test("maintenance seed routines are service-only", () => {
  for (const signature of [
    "seed_all_project_budget_lines_from_account_codes\\(\\)",
    "seed_project_budget_lines_for_account_code\\(uuid\\)",
    "seed_project_budget_lines_for_project\\(uuid\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(
        `revoke all on function app_theatre_budget\\.${signature}[\\s\\S]*?from public, anon, authenticated`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant execute on function app_theatre_budget\\.${signature}[\\s\\S]*?to service_role`,
      ),
    );
  }
});

test("budget-line creation requires an app or project entitlement", () => {
  assert.match(migration, /actor_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /core\.is_platform_owner\(actor_user_id\)/);
  assert.match(
    migration,
    /core\.has_role\('theatre_budget', array\['admin'\]::text\[\]\)/,
  );
  assert.match(migration, /from app_theatre_budget\.project_memberships membership/);
  assert.match(migration, /membership\.project_id = p_project_id/);
  assert.match(migration, /membership\.user_id = actor_user_id/);
  assert.match(migration, /'buyer'::app_theatre_budget\.app_role/);
});

test("scoped access matches project dimensions and selected category", () => {
  assert.match(migration, /from app_theatre_budget\.user_access_scopes scope/);
  assert.match(migration, /scope\.active = true/);
  assert.match(
    migration,
    /scope\.production_category_id is null[\s\S]*?scope\.production_category_id = p_production_category_id/,
  );
  assert.match(
    migration,
    /scope\.project_id is not null[\s\S]*?scope\.organization_id is not null[\s\S]*?scope\.fiscal_year_id is not null/,
  );
});

test("the client RPC remains available only to signed-in and service callers", () => {
  assert.match(
    migration,
    /revoke all on function app_theatre_budget\.ensure_project_category_line\(uuid, uuid\)[\s\S]*?from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function app_theatre_budget\.ensure_project_category_line\(uuid, uuid\)[\s\S]*?to authenticated, service_role/,
  );
});

test("migration changes no Theatre Budget business rows", () => {
  const topLevelMigration = migration.replace(
    /\$function\$[\s\S]*?\$function\$/g,
    "",
  );
  assert.doesNotMatch(topLevelMigration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(topLevelMigration, /\btruncate\b/i);
  assert.doesNotMatch(topLevelMigration, /\bdrop\s+(table|schema|column)\b/i);
  assert.doesNotMatch(topLevelMigration, /\bupdate\s+app_theatre_budget\./i);
  assert.doesNotMatch(topLevelMigration, /\binsert\s+into\s+app_theatre_budget\./i);
  assert.doesNotMatch(topLevelMigration, /\bselect\s+app_theatre_budget\.seed_/i);
});

test("emergency rollback restores only the prior function and grants", () => {
  assert.match(
    rollback,
    /create or replace function app_theatre_budget\.ensure_project_category_line/,
  );
  assert.match(
    rollback,
    /grant execute on function app_theatre_budget\.ensure_project_category_line\(uuid, uuid\)[\s\S]*?to public, anon, authenticated, service_role/,
  );
  assert.match(
    rollback,
    /grant execute on function app_theatre_budget\.seed_all_project_budget_lines_from_account_codes\(\)[\s\S]*?to public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(rollback, /\bdelete\s+from\b/i);
  assert.doesNotMatch(rollback, /\btruncate\b/i);
  assert.doesNotMatch(rollback, /\bdrop\s+(table|schema|column)\b/i);
});
