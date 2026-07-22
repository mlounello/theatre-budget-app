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

async function sendEmail(email: string, link: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAGIC_LINK_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Theatre Budget magic-link email credentials are not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `budget-magic-${randomUUID()}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Theatre Budget App sign-in link",
      text: `Use this one-time link to sign in to the Theatre Budget App:\n\n${link}\n\nIf you did not request this link, you can ignore this email.`,
      html: `<h2>Sign in to the Theatre Budget App</h2><p>Use the one-time link below to open your authorized budget workspace.</p><p><a href="${link}">Open the Theatre Budget App</a></p><p>If you did not request this link, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Theatre Budget magic-link email delivery failed (${response.status}).`);
}

export async function sendAuthorizedBudgetMagicLink(email: string, redirectTo: string) {
  const normalized = normalizeEmail(email);
  const userId = await findAuthUserId(normalized);
  if (!userId || !(await hasBudgetAccess(userId))) return;
  const link = await createDirectLink(normalized, redirectTo);
  await sendEmail(normalized, link);
}
