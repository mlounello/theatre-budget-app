import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access";
import { IMPERSONATION_COOKIE, verifyImpersonationToken } from "@/lib/impersonation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const actualAccess = await getAccessContext({ ignoreImpersonation: true });
  const cookieHeader = request.headers.get("cookie") ?? "";
  const encodedCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${IMPERSONATION_COOKIE}=`))
    ?.slice(IMPERSONATION_COOKIE.length + 1);
  const payload = verifyImpersonationToken(encodedCookie ? decodeURIComponent(encodedCookie) : null);
  if (actualAccess.userId && payload?.actorUserId === actualAccess.userId) {
    const supabase = await getSupabaseServerClient();
    await supabase.from("admin_impersonation_audit").insert({
      actor_user_id: actualAccess.userId,
      target_user_id: payload.targetUserId,
      event_type: "exited",
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: request.headers.get("user-agent")
    });
  }
  const response = NextResponse.redirect(new URL("/settings", request.url), 303);
  response.cookies.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
