import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const middlewareSource = source("../middleware.ts");
const callbackSource = source("../app/auth/callback/route.ts");
const deniedSource = source("../app/auth/denied/route.ts");
const magicLinkSource = source("../app/api/auth/magic-link/route.ts");
const integrationInviteSource = source("../app/api/integrations/production-management/budget-access-link/route.ts");
const brandedEmailSource = source("../lib/branded-magic-link.ts");
const loginClientSource = source("../app/login/login-client.tsx");
const topNavSource = source("../components/top-nav.tsx");
const dashboardSource = source("../app/page.tsx");
const myBudgetSource = source("../app/my-budget/page.tsx");

test("only authentication and explicitly integrated endpoints are public", () => {
  assert.match(middlewareSource, /"\/login"/);
  assert.match(middlewareSource, /"\/auth\/callback"/);
  assert.match(middlewareSource, /"\/auth\/denied"/);
  assert.match(middlewareSource, /if \(!user && !isPublic && !isAsset\)/);
});

test("an authenticated account without access is signed out before protected UI renders", () => {
  assert.match(topNavSource, /hasUser && role === "none"/);
  assert.match(topNavSource, /redirect\("\/auth\/denied"\)/);
  assert.match(topNavSource, /if \(!hasUser\) return null/);
  assert.match(dashboardSource, /access\.role === "none"\) redirect\("\/auth\/denied"\)/);
  assert.match(myBudgetSource, /access\.role === "none"\) redirect\("\/auth\/denied"\)/);
  assert.match(deniedSource, /signOut\(\{ scope: "local" \}\)/);
  assert.match(deniedSource, /NextResponse\.redirect\(loginUrl\)/);
});

test("Google and magic-link callbacks reject accounts without active access", () => {
  assert.match(callbackSource, /access\.role === "none"/);
  assert.match(callbackSource, /signOut\(\{ scope: "local" \}\)/);
  assert.match(callbackSource, /exact email that was authorized/);
});

test("magic-link requests do not reveal whether an email exists", () => {
  assert.match(magicLinkSource, /status: 202/);
  assert.doesNotMatch(magicLinkSource, /user not found|account does not exist/i);
  assert.match(loginClientSource, /If this email has active Theatre Budget access/);
  assert.match(loginClientSource, /If it does not arrive/);
});

test("Production Management sends a permanent branded access-ready email, not a magic link", () => {
  assert.match(integrationInviteSource, /sendBudgetAccessReadyEmail/);
  assert.doesNotMatch(integrationInviteSource, /sendAuthorizedBudgetMagicLink/);
  assert.match(integrationInviteSource, /fullName/);
  assert.match(brandedEmailSource, /Your budget access is ready/);
  assert.match(brandedEmailSource, /Propared production book/);
  assert.match(brandedEmailSource, /bookmarking the Theatre Budget App page/);
  assert.match(brandedEmailSource, /permanent app address, not a one-time sign-in link/);
  assert.match(brandedEmailSource, /tktba-horizontal\.png/);
});
