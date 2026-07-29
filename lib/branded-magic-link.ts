import { createHash, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { APP_ID } from "@/lib/supabase-schema";

type Bucket = { count: number; resetAt: number };
type MagicLinkGlobal = typeof globalThis & {
  __budgetMagicLinkBuckets?: Map<string, Bucket>;
};

const bucketStore = globalThis as MagicLinkGlobal;
const buckets = bucketStore.__budgetMagicLinkBuckets ?? new Map<string, Bucket>();
bucketStore.__budgetMagicLinkBuckets = buckets;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function consumeBucket(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function allowBudgetMagicLinkRequest(email: string, clientAddress: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const emailAllowed = consumeBucket(`email:${digest(normalized)}`, 1, 60_000);
  const clientAllowed = consumeBucket(`client:${digest(clientAddress || "unknown")}`, 5, 10 * 60_000);
  return emailAllowed && clientAllowed;
}

async function findAuthUserId(email: string) {
  const admin = createSupabaseAdminClient();
  const target = normalizeEmail(email);
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data.users ?? []).find((user) => normalizeEmail(user.email ?? "") === target);
    if (found) return found.id;
    if ((data.users ?? []).length < perPage) return null;
  }
  return null;
}

async function hasBudgetAccess(userId: string) {
  const admin = createSupabaseAdminClient();
  const [coreMembership, projectMembership, accessScope] = await Promise.all([
    admin
      .schema("core")
      .from("app_memberships")
      .select("user_id")
      .eq("user_id", userId)
      .eq("app_id", APP_ID)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    admin.from("project_memberships").select("user_id").eq("user_id", userId).limit(1).maybeSingle(),
    admin
      .from("user_access_scopes")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
  ]);
  if (coreMembership.error) throw coreMembership.error;
  if (projectMembership.error) throw projectMembership.error;
  if (accessScope.error) throw accessScope.error;
  return Boolean(coreMembership.data || projectMembership.data || accessScope.data);
}

async function createDirectLink(email: string, redirectTo: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  const tokenHash = String(data?.properties?.hashed_token ?? "").trim();
  if (error || !tokenHash) throw error ?? new Error("Supabase did not return a magic-link token.");
  const callback = new URL(redirectTo);
  callback.searchParams.set("token_hash", tokenHash);
  callback.searchParams.set("type", "magiclink");
  return callback.toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function budgetSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://theatrebudgetapp.mlounello.com").replace(/\/+$/, "");
}

async function sendEmail(input: {
  email: string;
  subject: string;
  text: string;
  html: string;
  idempotencyPrefix: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAGIC_LINK_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Theatre Budget email credentials are not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${input.idempotencyPrefix}-${randomUUID()}`,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });
  if (!response.ok) throw new Error(`Theatre Budget email delivery failed (${response.status}).`);
}

export async function sendAuthorizedBudgetMagicLink(email: string, redirectTo: string) {
  const normalized = normalizeEmail(email);
  const userId = await findAuthUserId(normalized);
  if (!userId || !(await hasBudgetAccess(userId))) return;
  const link = await createDirectLink(normalized, redirectTo);
  await sendEmail({
    email: normalized,
    subject: "Your Theatre Budget App sign-in link",
    text: `Use this one-time link to sign in to the Theatre Budget App:\n\n${link}\n\nIf you did not request this link, you can ignore this email.`,
    html: `<h2>Sign in to the Theatre Budget App</h2><p>Use the one-time link below to open your authorized budget workspace.</p><p><a href="${escapeHtml(link)}">Open the Theatre Budget App</a></p><p>If you did not request this link, you can ignore this email.</p>`,
    idempotencyPrefix: "budget-magic",
  });
}

export async function sendBudgetAccessReadyEmail(email: string, fullName?: string) {
  const normalized = normalizeEmail(email);
  const userId = await findAuthUserId(normalized);
  if (!userId || !(await hasBudgetAccess(userId))) {
    throw new Error("Theatre Budget access is not active for this email address.");
  }

  const appUrl = budgetSiteUrl();
  const recipientName = fullName?.trim() || "there";
  const safeName = escapeHtml(recipientName);
  const safeEmail = escapeHtml(normalized);
  const safeAppUrl = escapeHtml(appUrl);
  const logoUrl = `${safeAppUrl}/tktba-horizontal.png`;
  const subject = "Your Theatre Budget access is ready";
  const text = [
    `Hello ${recipientName},`,
    "",
    "Your view-only Theatre Budget access is ready. You can use it to check the department budgets assigned to you.",
    "",
    `Open the Theatre Budget App: ${appUrl}`,
    "",
    `Sign in with Google using ${normalized}, or enter that email address and request a magic link. The address above is the permanent Theatre Budget App page, not a one-time sign-in link.`,
    "",
    "You can also check the budget at any time using the Theatre Budget link in your Propared production book. We recommend bookmarking the app page for future reference.",
    "",
    "If you were not expecting this access, contact your production manager.",
    "",
    "Siena Theatre Production Management",
  ].join("\n");
  const html = `
    <div style="margin:0;padding:32px 12px;background:#eef3f0;font-family:Arial,Helvetica,sans-serif;color:#17251f">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your view-only Theatre Budget access is ready.</div>
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d8e3dd;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,46,35,.08)">
        <div style="padding:24px 28px;background:#ffffff;border-bottom:6px solid #f6c515">
          <img src="${logoUrl}" alt="Theatre Budget App" style="display:block;width:100%;max-width:430px;height:auto;margin:0 auto">
        </div>
        <div style="padding:34px 32px 30px">
          <p style="margin:0 0 18px;font-size:17px;line-height:1.6">Hello ${safeName},</p>
          <h1 style="margin:0 0 16px;color:#006b54;font-size:28px;line-height:1.2">Your budget access is ready</h1>
          <p style="margin:0 0 20px;font-size:17px;line-height:1.6">Your view-only Theatre Budget access is active. You can use it to check the department budgets assigned to you.</p>
          <div style="margin:28px 0;text-align:center">
            <a href="${safeAppUrl}" style="display:inline-block;background:#006b54;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;padding:14px 24px;border-radius:8px">Open Theatre Budget App</a>
          </div>
          <div style="margin:24px 0;padding:18px 20px;background:#f4f8f6;border-left:5px solid #f6c515;border-radius:8px">
            <p style="margin:0 0 10px;font-size:16px;line-height:1.55"><strong>How to sign in</strong></p>
            <p style="margin:0;font-size:16px;line-height:1.55">Continue with Google using <strong>${safeEmail}</strong>, or enter that email address and request a magic link. This email contains the permanent app address, not a one-time sign-in link.</p>
          </div>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6">You can also check the budget at any time using the Theatre Budget link in your <strong>Propared production book</strong>.</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:1.6"><strong>We recommend bookmarking the Theatre Budget App page</strong> so it is easy to return to throughout the production.</p>
          <p style="margin:0;font-size:14px;line-height:1.55;color:#5d6d66">If you were not expecting this access, contact your production manager.</p>
        </div>
        <div style="padding:18px 32px;background:#006b54;color:#ffffff;font-size:13px;line-height:1.5;text-align:center">
          Siena Theatre Production Management
        </div>
      </div>
    </div>`;

  await sendEmail({
    email: normalized,
    subject,
    text,
    html,
    idempotencyPrefix: "budget-access-ready",
  });
}
