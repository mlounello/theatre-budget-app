import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendAuthorizedBudgetMagicLink } from "@/lib/branded-magic-link";

export const dynamic = "force-dynamic";

function matchesSecret(received: string, expected: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAuthorized(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const configured = [
    process.env.BUDGET_ACCESS_INTEGRATION_SECRET?.trim(),
    process.env.SUPABASE_SECRET_KEY?.trim(),
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ].filter((value): value is string => Boolean(value));
  return Boolean(received) && configured.some((expected) => matchesSecret(received, expected));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  try {
    const origin = new URL(request.url).origin;
    await sendAuthorizedBudgetMagicLink(email, `${origin}/auth/callback`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Theatre Budget access email failed." },
      { status: 502 }
    );
  }
}
