import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("settings is split into the five reviewed workspaces", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  assert.match(client, /label: "Structure"/);
  assert.match(client, /label: "Project Allocations"/);
  assert.match(client, /label: "People & Access"/);
  assert.match(client, /label: "Payment Setup"/);
  assert.match(client, /label: "Imports & Maintenance"/);
  assert.match(client, /settingsWorkspaceNav/);
  assert.match(client, /selectedSection === "structure"/);
  assert.match(client, /selectedSection === "allocations"/);
  assert.match(client, /selectedSection === "people"/);
  assert.match(client, /selectedSection === "payment"/);
  assert.match(client, /selectedSection === "maintenance"/);
});

test("structure defaults safely and keeps hierarchy editing primary", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  const css = await read("app/globals.css");
  assert.match(client, /: "structure";/);
  assert.match(client, /settingsHierarchyPrimary/);
  assert.match(client, /<HierarchyTreeControls/);
  assert.match(client, /<FiscalYearReorder/);
  assert.match(client, /<OrganizationReorder/);
  assert.match(client, /<ProjectReorder/);
  assert.match(client, /<BudgetLineReorder/);
  assert.match(css, /\.settingsHierarchyPrimary\s*\{[\s\S]*?order: -2/);
});

test("existing settings tools remain assigned to their focused workspace", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  assert.match(client, /selectedSection === "allocations"[\s\S]*?<ProjectAllocationEditor/);
  assert.match(client, /selectedSection === "payment"[\s\S]*?<FoapalManager/);
  assert.match(client, /selectedSection === "payment"[\s\S]*?Current Account Codes/);
  assert.match(client, /selectedSection === "people"[\s\S]*?Production Team & Budget Access/);
  assert.match(client, /selectedSection === "maintenance"[\s\S]*?CSV Import/);
  assert.match(client, /selectedSection === "maintenance"[\s\S]*?Open Debug & Diagnostics/);
});

test("admin-only workspaces stay hidden from project managers", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  assert.match(client, /availableSettingsSections = SETTINGS_SECTIONS\.filter\(\(section\) => isAdmin \|\| !section\.adminOnly\)/);
  assert.match(client, /Payment Setup[\s\S]*?adminOnly: true/);
  assert.match(client, /Imports & Maintenance[\s\S]*?adminOnly: true/);
});

test("debug is available through maintenance but not primary navigation", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  const nav = await read("components/top-nav.tsx");
  assert.match(client, /href="\/debug"/);
  assert.doesNotMatch(nav, /href: "\/debug"/);
  assert.match(nav, /links: \[\{ href: "\/settings", label: "Settings" \}\]/);
});

test("settings edit drawers preserve unrelated workspace query state when closing", async () => {
  const client = await read("app/settings/settings-page-client.tsx");
  assert.match(client, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(client, /params\.delete\("editType"\)/);
  assert.match(client, /params\.delete\("editId"\)/);
  assert.doesNotMatch(client, /params\.delete\("settings_view"\)/);
});
