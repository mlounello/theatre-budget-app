import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Variance Center renders compact workflow queues and one URL-addressable drawer", () => {
  const client = read("app/variance/variance-center-client.tsx");
  for (const label of ["Draft", "Submitted", "Approved", "Posted"]) assert.match(client, new RegExp(`title: "${label}"`));
  assert.match(client, /className="varianceQueueGrid"/);
  assert.match(client, /<SideDrawer/);
  assert.match(client, /params\.set\("varianceId", id\)/);
  assert.doesNotMatch(client, /window\.confirm/);
});

test("source choices render only inside the active drawer and remain same-FY ranked suggestions", () => {
  const client = read("app/variance/variance-center-client.tsx");
  assert.match(client, /activeVariance \? <div className="varianceDrawerBody"/);
  assert.match(client, /candidate\.fiscalYearId === targetLine\.fiscalYearId/);
  assert.match(client, /Suggested sources are ranked by same organization, sufficient balance, then available funds/);
  assert.match(client, /slice\(0, 24\)/);
});

test("duplicate drafts can be combined or dismissed deliberately with audit language", () => {
  const client = read("app/variance/variance-center-client.tsx");
  const actions = read("app/variance/actions.ts");
  assert.match(client, /Possible duplicate drafts/);
  assert.match(client, /value="combine"/);
  assert.match(client, /value="dismiss"/);
  assert.match(actions, /resolve_duplicate_variance_draft/);
  assert.match(actions, /p_mode: mode/);
  assert.match(actions, /different fiscal years cannot be combined or dismissed together/);
});

test("duplicate-combine database function is transactional, permission checked, same-FY, and non-destructive", () => {
  const migration = read("supabase/migrations/20260919143000_phase4_gate5b_variance_duplicate_resolution.sql");
  assert.match(migration, /can_manage_variance_request\(v_primary\.id\)/);
  assert.match(migration, /fiscal_year_id is distinct from v_duplicate\.fiscal_year_id/);
  assert.match(migration, /v_primary_targets is distinct from v_duplicate_targets/);
  assert.match(migration, /if p_mode = 'combine' then/);
  assert.match(migration, /update app_theatre_budget\.variance_request_lines/);
  assert.match(migration, /set status = 'denied'/);
  assert.match(migration, /insert into app_theatre_budget\.variance_events/);
  assert.doesNotMatch(migration, /delete from app_theatre_budget\.variance_requests/);
});

test("destructive variance controls use the shared confirmation dialog", () => {
  const client = read("app/variance/variance-center-client.tsx");
  assert.match(client, /<ConfirmationDialog/);
  assert.match(client, /sourceDeleteForms\.current\.get\(confirmAction\.lineId\)\?\.requestSubmit/);
  assert.match(client, /deleteFormRef\.current\?\.requestSubmit/);
});

test("Variance Center has responsive queue and source layouts", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.varianceQueueGrid/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1200px\)/);
  assert.match(css, /\.varianceDrawerSection/);
});
