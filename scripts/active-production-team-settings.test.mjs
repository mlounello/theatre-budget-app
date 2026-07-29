import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dbSource = readFileSync(new URL("../lib/db.ts", import.meta.url), "utf8");
const loader = dbSource.slice(
  dbSource.indexOf("export async function getSettingsProductionTeamAssignments"),
  dbSource.indexOf("export async function getTemplateNames")
);

test("Theatre Budget settings hide inactive production-team mirrors", () => {
  assert.match(loader, /\.from\("production_team_assignments"\)[\s\S]*?\.eq\("active", true\)/);
});
