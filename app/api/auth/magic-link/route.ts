import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/sanitize-next";
import {
  allowBudgetMagicLinkRequest,
  sendAuthorizedBudgetMagicLink,
} from "@/lib/branded-magic-link";

function accepted() {
  return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  if (request.headers.get("origin") !== requestUrl.origin) return accepted();

  const payload = await request.json().catch(() => null) as { email?: unknown; next?: unknown } | null;
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const next = sanitizeNextPath(typeof payload?.next === "string" ? payload.next : null);
  const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!email || !allowBudgetMagicLinkRequest(email, clientAddress)) return accepted();

  const callback = new URL("/auth/callback", requestUrl.origin);
  callback.searchParams.set("next", next);
  try {
    await sendAuthorizedBudgetMagicLink(email, callback.toString());
  } catch {
    console.error("[budget-magic-link] Request could not be completed.");
  }
  return accepted();
}
