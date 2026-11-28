// Behavior tests for security-sensitive and date/financial-logic library modules. Run with:
//   node --experimental-strip-types --test scripts/lib-security-behavior.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

const lib = (name) => import(new URL(`../lib/${name}.ts`, import.meta.url).href);
const KEY = "unit-test-key-0123456789abcdef";
process.env.CHECK_REQUEST_TAX_ID_KEY = KEY;

const payload = (over = {}) => ({
  actorUserId: "actor-1", targetUserId: "target-1", targetName: "Pat Viewer",
  targetRole: "viewer", expiresAt: Date.now() + 60_000, ...over
});

test("impersonation tokens round-trip and reject tampering, expiry, bad roles and foreign keys", async () => {
  const { createImpersonationToken, verifyImpersonationToken } = await lib("impersonation");
  const token = createImpersonationToken(payload());
  assert.equal(verifyImpersonationToken(token)?.targetUserId, "target-1");
  assert.equal(verifyImpersonationToken(null), null);
  assert.equal(verifyImpersonationToken(""), null);
  assert.equal(verifyImpersonationToken("nodot"), null);

  const [encoded, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify(payload({ targetRole: "admin" }))).toString("base64url");
  assert.equal(verifyImpersonationToken(`${forged}.${sig}`), null, "payload swapped under old signature");
  assert.equal(verifyImpersonationToken(`${encoded}.${sig.slice(0, -2)}AA`), null, "signature altered");

  assert.equal(verifyImpersonationToken(createImpersonationToken(payload({ expiresAt: Date.now() - 1 }))), null, "expired");
  assert.equal(verifyImpersonationToken(createImpersonationToken(payload({ targetRole: "admin" }))), null, "admin cannot be impersonated");
  assert.equal(verifyImpersonationToken(createImpersonationToken(payload({ targetName: "" }))), null, "missing name");
  assert.equal(verifyImpersonationToken(createImpersonationToken(payload({ targetRole: "procurement_tracker" })))?.targetRole, "procurement_tracker");

  process.env.CHECK_REQUEST_TAX_ID_KEY = "a-completely-different-secret-value";
  assert.equal(verifyImpersonationToken(token), null, "token signed with another key");
  process.env.CHECK_REQUEST_TAX_ID_KEY = "short";
  assert.throws(() => createImpersonationToken(payload()), /CHECK_REQUEST_TAX_ID_KEY/);
  process.env.CHECK_REQUEST_TAX_ID_KEY = KEY;
});

test("sensitive value encryption round-trips, uses fresh IVs, and detects tampering", async () => {
  const { encryptSensitiveValue, decryptSensitiveValue, taxIdLastFour } = await lib("sensitive-encryption");
  const secret = "123-45-6789";
  const a = encryptSensitiveValue(secret);
  const b = encryptSensitiveValue(secret);
  assert.notEqual(a, b, "random IV per encryption");
  assert.ok(a.startsWith("v1:"));
  assert.ok(!a.includes("6789"));
  assert.equal(decryptSensitiveValue(a), secret);
  assert.equal(encryptSensitiveValue("   "), "");
  assert.equal(decryptSensitiveValue(""), "");
  assert.equal(decryptSensitiveValue(null), "");

  const parts = a.split(":");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => decryptSensitiveValue(parts.join(":")));
  assert.throws(() => decryptSensitiveValue("v2:a:b:c"), /supported encrypted format/);
  assert.throws(() => decryptSensitiveValue("garbage"), /supported encrypted format/);

  process.env.CHECK_REQUEST_TAX_ID_KEY = "short";
  assert.throws(() => encryptSensitiveValue(secret), /CHECK_REQUEST_TAX_ID_KEY/);
  process.env.CHECK_REQUEST_TAX_ID_KEY = KEY;

  assert.equal(taxIdLastFour("123-45-6789"), "6789");
  assert.equal(taxIdLastFour("ab"), null);
  assert.equal(taxIdLastFour(""), null);
});

test("fiscal year selection prefers the containing year, then open-ended, then most recent", async () => {
  const { resolveCurrentFiscalYearId, resolveRequestedFiscalYearId } = await lib("fiscal-year-context");
  const fy = (id, startDate, endDate) => ({ id, name: id, startDate, endDate, sortOrder: 0 });
  const years = [fy("fy26", "2025-06-01", "2026-05-31"), fy("fy27", "2026-06-01", "2027-05-31")];
  assert.equal(resolveCurrentFiscalYearId(years, new Date(2026, 10, 27)), "fy27");
  assert.equal(resolveCurrentFiscalYearId(years, new Date(2026, 4, 31)), "fy26");
  assert.equal(resolveCurrentFiscalYearId(years, new Date(2026, 5, 1)), "fy27");
  assert.equal(resolveCurrentFiscalYearId(years, new Date(2030, 0, 1)), "fy27", "after all years: most recent");
  assert.equal(resolveCurrentFiscalYearId([fy("open", "2020-01-01", null)], new Date(2026, 0, 1)), "open");
  assert.equal(resolveCurrentFiscalYearId([], new Date()), "");
  assert.equal(resolveCurrentFiscalYearId([fy("nodates", null, null)], new Date()), "nodates");

  assert.equal(resolveRequestedFiscalYearId(years, "fy26"), "fy26");
  assert.equal(resolveRequestedFiscalYearId(years, "bogus"), resolveCurrentFiscalYearId(years));
  assert.equal(resolveRequestedFiscalYearId(years, "all"), resolveCurrentFiscalYearId(years), "all only when allowed");
  assert.equal(resolveRequestedFiscalYearId(years, "all", { allowAll: true }), "all");
  assert.equal(resolveRequestedFiscalYearId(years, undefined), resolveCurrentFiscalYearId(years));
});

test("institutional fiscal months run June (1) through May (12)", async () => {
  const { determineFiscalMonthFromOrderDate } = await lib("institutional-budget");
  const idx = (d) => determineFiscalMonthFromOrderDate(d).fiscalMonthIndex;
  assert.equal(idx("2026-06-15"), 1);
  assert.equal(idx("2026-12-01"), 7);
  assert.equal(idx("2027-01-31"), 8);
  assert.equal(idx("2027-05-31"), 12);
  assert.deepEqual(determineFiscalMonthFromOrderDate("2026-11-27"), { monthStart: "2026-11-01", fiscalMonthIndex: 6 });
});

test("Argos control CSV parsers total signed amounts and reject the wrong report", async () => {
  const { parseArgosYtdControlCsv, parseArgosEncControlCsv } = await lib("banner-reconciliation-files");
  const ytd = "﻿DOC_CODE,TRANS_AMT,DR_CR_IND,FISCAL_YEAR,ORGN_CODE,ACCT_CODE\nA1,100.10,+,FY27,2ac200,72100\nA2,25.05,-,FY27,2ac200,72100\n,5,+,FY27,2ac200,72100\n";
  assert.deepEqual(parseArgosYtdControlCsv(ytd), { fiscalYear: "FY27", organizationCode: "2AC200", accountCode: "72100", total: 75.05, rowCount: 2 });
  assert.throws(() => parseArgosYtdControlCsv("WRONG,COLUMNS\n1,2"), /not an Evisions Argos YTD/);
  assert.throws(() => parseArgosYtdControlCsv("DOC_CODE,TRANS_AMT\n,5"), /does not contain transaction rows/);

  assert.deepEqual(parseArgosEncControlCsv("ACCOUNT_CODE,TRANS_AMT\n72100,10.10\n72100,20.20\n"), { accountCode: "72100", total: 30.3 });
  assert.throws(() => parseArgosEncControlCsv("DOC_CODE,TRANS_AMT\nx,1"), /not an Evisions Argos ENC/);
});
