import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type AuthUserLite = {
  id: string;
  email?: string | null;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/$/, "");
  return "http://localhost:3000";
}

async function findAuthUserByEmail(email: string): Promise<AuthUserLite | null> {
  const admin = createSupabaseAdminClient();
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data?.users ?? []).find((user) => normalizeEmail(user.email ?? "") === target);
    if (found) return { id: found.id, email: found.email };
    if (!data?.users || data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function ensureLocalUser(userId: string, fullName: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("users").upsert(
    {
      id: userId,
      full_name: fullName.trim() || "Budget User"
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

export async function ensureBudgetAccessUser(params: {
  email: string;
  fullName: string;
}): Promise<{ userId: string; created: boolean }> {
  const email = normalizeEmail(params.email);
  if (!email) throw new Error("Email is required before sending a magic link.");

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await ensureLocalUser(existing.id, params.fullName || email);
    return { userId: existing.id, created: false };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: params.fullName || email,
      name: params.fullName || email
    },
    redirectTo: `${appUrl()}/auth/callback`
  });
  if (error) throw error;
  const invitedUserId = data.user?.id;
  if (!invitedUserId) throw new Error("Supabase did not return an invited user id.");
  await ensureLocalUser(invitedUserId, params.fullName || email);
  return { userId: invitedUserId, created: true };
}

export async function sendBudgetAccessMagicLink(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Email is required before sending a magic link.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.signInWithOtp({
    email: normalized,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback`
    }
  });
  if (error) throw error;
}
