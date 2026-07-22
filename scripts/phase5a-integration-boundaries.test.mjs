import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const syncSource = readFileSync(new URL("../lib/production-management-sync.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/guest-artists/actions.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202607221500_phase5a_guest_artist_bridge.sql", import.meta.url), "utf8");
const entitlementMigration = readFileSync(new URL("../supabase/migrations/202607221510_phase5a_lighting_designer_budget_access.sql", import.meta.url), "utf8");

test("guest-artist reconciliation is disabled unless explicitly enabled", () => {
  assert.match(syncSource, /ENABLE_PRODUCTION_MANAGEMENT_GUEST_ARTIST_SYNC/);
  assert.match(syncSource, /=== "true"/);
  assert.match(syncSource, /createSupabaseAdminClient/);
  assert.match(syncSource, /\.schema\("app_production_management"\)/);
});

test("Lighting Designer access is disabled by default and requires an explicit project link", () => {
  assert.match(entitlementMigration, /'lighting_designer_budget_viewer',[\s\S]*?false/);
  assert.match(entitlementMigration, /local_entity_type = 'project'/);
  assert.match(entitlementMigration, /external_table = 'projects'/);
  assert.match(entitlementMigration, /budget_access_role[\s\S]*?'viewer'/);
  assert.match(entitlementMigration, /No explicit Theatre Budget project link exists; no access was granted/);
});

test("Lighting Designer bridge is service-role-only and never creates app-wide membership", () => {
  assert.match(entitlementMigration, /revoke all on function app_production_management\.reconcile_lighting_designer_budget_access\(uuid\) from public, anon, authenticated/);
  assert.match(entitlementMigration, /grant execute on function app_production_management\.reconcile_lighting_designer_budget_access\(uuid\) to service_role/);
  assert.doesNotMatch(entitlementMigration, /insert into core\.app_memberships/i);
});

test("Budget saves complete before Production Management reconciliation", () => {
  const insertAt = actionsSource.indexOf('.from("guest_artists").insert(payload)');
  const updateAt = actionsSource.indexOf('.from("guest_artists")\n      .update(payload)');
  const firstSyncAt = actionsSource.indexOf("reconcileGuestArtistWithProductionManagement", insertAt);
  const secondSyncAt = actionsSource.indexOf("reconcileGuestArtistWithProductionManagement", updateAt);
  assert.ok(insertAt >= 0 && firstSyncAt > insertAt);
  assert.ok(updateAt >= 0 && secondSyncAt > updateAt);
});

test("database bridge is service-role-only and copies no financial or tax fields", () => {
  assert.match(migration, /revoke all on function app_production_management\.reconcile_theatre_budget_guest_artist\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function app_production_management\.reconcile_theatre_budget_guest_artist\(uuid\) to service_role/);
  const personInsert = migration.match(/insert into app_production_management\.people \(([\s\S]*?)\) values/i)?.[1] ?? "";
  assert.doesNotMatch(personInsert, /vendor_number|tax_id|foapal|address|notes/i);
});
