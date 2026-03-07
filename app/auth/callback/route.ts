import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { sanitizeNextPath } from "@/lib/sanitize-next";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const debugAccess = process.env.DEBUG_DASHBOARD_ACCESS === "true";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      if (debugAccess) {
        console.error("[auth:callback] exchangeCodeForSession failed", {
          message: exchangeError.message,
          status: (exchangeError as { status?: number | string }).status ?? null,
          code: (exchangeError as { code?: string }).code ?? null
        });
      }
      const loginUrl = new URL("/login", requestUrl.origin);
      loginUrl.searchParams.set("error", exchangeError.message || "OAuth callback failed");
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
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
