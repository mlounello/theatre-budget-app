import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractFunction, readDbSources } from "./_db-source.mjs";

const dbSource = readDbSources();
const loader = extractFunction(dbSource, "getSettingsProductionTeamAssignments");

test("Theatre Budget settings hide inactive production-team mirrors", () => {
  assert.match(loader, /\.from\("production_team_assignments"\)[\s\S]*?\.eq\("active", true\)/);
});
