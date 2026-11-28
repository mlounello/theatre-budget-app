// Behavior tests for pure library modules. Run with:
//   node --experimental-strip-types --test scripts/lib-behavior.test.mjs
import assert from "node:assert/strict";
import test from "node:test";

const lib = (name) => import(new URL(`../lib/${name}.ts`, import.meta.url).href);

test("sanitizeNextPath only allows same-site relative paths", async () => {
  const { sanitizeNextPath } = await lib("sanitize-next");
  assert.equal(sanitizeNextPath("/procurement?x=1"), "/procurement?x=1");
  assert.equal(sanitizeNextPath(null), "/");
  assert.equal(sanitizeNextPath("", "/home"), "/home");
  assert.equal(sanitizeNextPath("https://evil.example"), "/");
  assert.equal(sanitizeNextPath("//evil.example"), "/");
  // Browsers treat "/\" as "//" and strip tabs/newlines, so these are open redirects.
  assert.equal(sanitizeNextPath("/\\evil.example"), "/");
  assert.equal(sanitizeNextPath("/\t/evil.example"), "/");
  assert.equal(sanitizeNextPath("/\n/evil.example"), "/");
});

test("calculateCheckRequestSchedule derives check run, AP receive and mail-by dates", async () => {
  const { calculateCheckRequestSchedule } = await lib("check-request-schedule");
  // Friday due date: check run is the same day, AP a week earlier, mail two business days before that.
  assert.deepEqual(calculateCheckRequestSchedule("2026-11-27"), {
    dueDate: "2026-11-27", checkRunDate: "2026-11-27", apReceiveBy: "2026-11-20", mailBy: "2026-11-18"
  });
  // Wednesday due date rolls back to the previous Friday.
  assert.deepEqual(calculateCheckRequestSchedule("2026-11-25"), {
    dueDate: "2026-11-25", checkRunDate: "2026-11-20", apReceiveBy: "2026-11-13", mailBy: "2026-11-11"
  });
  // Weekend and Monday due dates roll back to the same Friday.
  for (const due of ["2026-11-28", "2026-11-29", "2026-11-30"]) {
    assert.equal(calculateCheckRequestSchedule(due)?.checkRunDate, "2026-11-27", due);
  }
  assert.equal(calculateCheckRequestSchedule(null), null);
  assert.equal(calculateCheckRequestSchedule("11/27/2026"), null);
  assert.equal(calculateCheckRequestSchedule("not a date"), null);
});

test("bannerRuleRelievesEncumbrance excludes adjustments and non-encumbrance classes", async () => {
  const { bannerRuleRelievesEncumbrance } = await lib("banner-rule-class");
  assert.equal(bannerRuleRelievesEncumbrance(null), true);
  assert.equal(bannerRuleRelievesEncumbrance("  "), true);
  assert.equal(bannerRuleRelievesEncumbrance("JV01"), true);
  assert.equal(bannerRuleRelievesEncumbrance("ad01"), false);
  assert.equal(bannerRuleRelievesEncumbrance("INNI"), false);
  assert.equal(bannerRuleRelievesEncumbrance(" innc "), false);
});

test("action helpers parse form values defensively", async () => {
  const { parseMoney, parseIdsJson, getErrorMessage, ok, err } = await lib("action-helpers");
  assert.equal(parseMoney("12.50"), 12.5);
  assert.equal(parseMoney("-3"), -3);
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney(null), 0);
  assert.equal(parseMoney("abc"), 0);
  assert.equal(parseMoney("Infinity"), 0);
  assert.equal(parseMoney(new File([], "x")), 0);
  assert.deepEqual(parseIdsJson('["a","b",""]'), ["a", "b"]);
  assert.deepEqual(parseIdsJson("{}"), []);
  assert.deepEqual(parseIdsJson("not json"), []);
  assert.deepEqual(parseIdsJson(null), []);
  assert.equal(getErrorMessage(new Error("boom"), "fallback"), "boom");
  assert.equal(getErrorMessage(new Error("  "), "fallback"), "fallback");
  assert.equal(getErrorMessage("x", "fallback"), "fallback");
  assert.equal(ok("done").ok, true);
  assert.equal(err("bad").ok, false);
});

test("formatCurrency renders US dollars with two decimals", async () => {
  const { formatCurrency } = await lib("format");
  assert.equal(formatCurrency(1234.5), "$1,234.50");
  assert.equal(formatCurrency(0), "$0.00");
  assert.equal(formatCurrency(-12.34), "-$12.34");
});

test("bearer auth compares secrets in constant time and rejects missing configuration", async () => {
  const { hasBearerSecret, bearerToken, secretsMatch } = await lib("bearer-auth");
  const req = (authorization) => new Request("https://example.test", authorization ? { headers: { authorization } } : {});
  assert.equal(bearerToken(req("Bearer abc ")), "abc");
  assert.equal(bearerToken(req("Basic abc")), "");
  assert.equal(bearerToken(req()), "");
  assert.equal(hasBearerSecret(req("Bearer s3cret"), "s3cret"), true);
  assert.equal(hasBearerSecret(req("Bearer s3cret"), " s3cret "), true);
  assert.equal(hasBearerSecret(req("Bearer wrong!"), "s3cret"), false);
  assert.equal(hasBearerSecret(req("Bearer s3cret"), undefined), false);
  assert.equal(hasBearerSecret(req("Bearer s3cret"), "  "), false);
  assert.equal(hasBearerSecret(req(), "s3cret"), false);
  assert.equal(secretsMatch("a", "ab"), false);
});

test("expense claim schema enforces numbering, scope and funding rules", async () => {
  const { expenseClaimInputSchema, positiveMoneySchema } = await lib("validation/financial");
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const line = (over = {}) => ({
    expenseNumber: "ex000001", title: "Paint", amount: "5", expenseDate: "", note: null,
    projectId: id, organizationId: "", productionCategoryId: id, bannerAccountCodeId: id, ...over
  });
  const claim = (over = {}) => ({
    claimType: "funding_request", fiscalYearId: id, creditCardId: id, claimNumber: "ec000001",
    claimMonth: "", authorizationClaimId: "", overageExplanation: "", notes: "", lines: [line()], ...over
  });
  const parsed = expenseClaimInputSchema.safeParse(claim());
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.claimNumber, "EC000001");
  assert.equal(parsed.data.lines[0].expenseNumber, "EX000001");
  assert.equal(parsed.data.lines[0].amount, 5);
  assert.equal(parsed.data.lines[0].organizationId, null);

  const messages = (input) => { const r = expenseClaimInputSchema.safeParse(input); return r.success ? [] : r.error.issues.map((i) => i.message); };
  assert.ok(messages(claim({ lines: [] })).includes("Add at least one Expense."));
  assert.ok(messages(claim({ claimNumber: "X1" })).includes("Use the EC###### format."));
  assert.ok(messages(claim({ creditCardId: "" })).includes("Choose the physical card for this claim."));
  assert.ok(messages(claim({ claimType: "reimbursement", creditCardId: "" })).length === 0);
  assert.ok(messages(claim({ claimType: "monthly_reconciliation" })).includes("Link the reconciliation to its original funding request."));
  assert.ok(messages(claim({ lines: [line({ organizationId: id })] })).some((m) => m.startsWith("Choose exactly one")));
  assert.ok(messages(claim({ lines: [line({ projectId: "", organizationId: "" })] })).some((m) => m.startsWith("Choose exactly one")));
  assert.ok(messages(claim({ lines: [line({ productionCategoryId: "" })] })).includes("Choose a production category for every theatre Expense."));
  assert.ok(messages(claim({ lines: Array.from({ length: 101 }, () => line()) })).length > 0);

  assert.equal(positiveMoneySchema.parse("12.345"), 12.35);
  assert.equal(positiveMoneySchema.safeParse(0).success, false);
  assert.equal(positiveMoneySchema.safeParse("abc").success, false);
});
