import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeNextPath } from "@/lib/sanitize-next";
import { syncAppUsersSafe } from "@/lib/app-user-sync";
import { getAccessContext } from "@/lib/access";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const debugAccess = process.env.DEBUG_DASHBOARD_ACCESS === "true";

  if (code || (tokenHash && type)) {
    const supabase = await getSupabaseServerClient();
    const { error: exchangeError } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({
          token_hash: tokenHash!,
          type: type as "magiclink" | "recovery" | "invite" | "signup" | "email_change" | "email"
        });
    if (exchangeError) {
      if (debugAccess) {
        console.error("[auth:callback] exchangeCodeForSession failed", {
          message: exchangeError.message,
          status: (exchangeError as { status?: number | string }).status ?? null,
          code: (exchangeError as { code?: string }).code ?? null
        });
      }
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("error", exchangeError.message || "Authentication callback failed");
      loginUrl.searchParams.set("next", next);
      return NextResponse.redirect(loginUrl);
    }

    const access = await getAccessContext();
    if (!access.userId || access.role === "none") {
      await supabase.auth.signOut({ scope: "local" });
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("error", "This account does not have active Theatre Budget access.");
      loginUrl.searchParams.set("next", next);
      return NextResponse.redirect(loginUrl);
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      const fullName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email ??
        "User";

      await supabase.from("users").upsert(
        {
          id: user.id,
          full_name: fullName
        },
        { onConflict: "id" }
      );
      await syncAppUsersSafe("auth_callback");
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
