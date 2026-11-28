import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readDirSources } from "./_db-source.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = "supabase/migrations/20261123120000_atomic_bulk_procurement_update.sql";

function sqlKeys(sql) {
  const block = sql.match(/c_purchase_keys constant text\[\] := array\[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

function actionKeys(source) {
  const fn = source.slice(source.indexOf("export async function bulkUpdateProcurementAction"));
  const block = fn.match(/purchase: \{([\s\S]*?)\n\s{8}\},\n\s+allocation/)[1];
  return [...block.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
}

test("bulk update sends exactly the purchase columns the RPC requires", async () => {
  const [sql, actions] = await Promise.all([read(MIGRATION), readDirSources("app/procurement/actions")]);
  const required = sqlKeys(sql);
  assert.equal(required.length, 24);
  assert.deepEqual(actionKeys(actions), required);
});

test("every required key is also assigned by the RPC update", async () => {
  const sql = await read(MIGRATION);
  for (const key of sqlKeys(sql)) {
    assert.match(sql, new RegExp(`\\b${key} = r\\.${key}\\b`), `${key} is validated but not updated`);
  }
});

test("RPC runs with caller privileges and is not callable anonymously", async () => {
  const sql = await read(MIGRATION);
  assert.match(sql, /security invoker/);
  assert.doesNotMatch(sql, /security definer/);
  assert.match(sql, /revoke all on function app_theatre_budget\.apply_procurement_bulk_update\(jsonb\) from public, anon/);
  assert.match(sql, /grant execute on function app_theatre_budget\.apply_procurement_bulk_update\(jsonb\) to authenticated/);
});

test("bulk update applies rows in one RPC and no longer writes purchases row by row", async () => {
  const actions = await readDirSources("app/procurement/actions");
  const fn = actions.slice(actions.indexOf("export async function bulkUpdateProcurementAction"));
  const body = fn.slice(0, fn.indexOf("\nexport async function ", 10));
  assert.match(body, /rpc\("apply_procurement_bulk_update"/);
  assert.doesNotMatch(body, /\.from\("purchases"\)\s*\.update\(/);
  assert.doesNotMatch(body, /from\("purchase_allocations"\)\.delete\(\)/);
});

test("rollback drops only the function", async () => {
  const rollback = await read("supabase/rollback/20261123120000_atomic_bulk_procurement_update.sql");
  assert.match(rollback, /drop function if exists app_theatre_budget\.apply_procurement_bulk_update\(jsonb\)/);
});

test("bulk delete handles projectless purchases without treating null as a project", async () => {
  const actions = await readDirSources("app/procurement/actions");
  const fn = actions.slice(actions.indexOf("export async function bulkDeleteProcurementAction"));
  const body = fn.slice(0, fn.indexOf("\nexport async function ", 10));
  assert.match(body, /select\("id, project_id, organization_id"\)/);
  assert.doesNotMatch(body, /row\.project_id as string\)/);
  assert.match(body, /access\.role !== "admin"\) throw new Error\("Only Admin can delete procurement rows\."\)/);
});
