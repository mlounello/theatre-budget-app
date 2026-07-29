import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/access";
import {
  createImpersonationToken,
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SECONDS
} from "@/lib/impersonation";
import { APP_ID } from "@/lib/supabase-schema";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function normalizedRole(value: unknown): "admin" | "project_manager" | "viewer" | "procurement_tracker" | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "buyer") return "viewer";
  if (role === "admin" || role === "project_manager" || role === "viewer" || role === "procurement_tracker") return role;
  return null;
}

function rank(role: string): number {
  return role === "admin" ? 4 : role === "project_manager" ? 3 : role === "viewer" ? 2 : 1;
}

export async function POST(request: Request) {
  const actualAccess = await getAccessContext({ ignoreImpersonation: true });
  if (!actualAccess.userId || actualAccess.role !== "admin") {
    return new NextResponse("Only administrators can use View as User.", { status: 403 });
  }
  const formData = await request.formData();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  if (!targetUserId || targetUserId === actualAccess.userId) {
    return new NextResponse("Select another user.", { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const [userResult, coreResult, membershipsResult, scopesResult] = await Promise.all([
    supabase.from("users").select("id, full_name").eq("id", targetUserId).maybeSingle(),
    supabase
      .schema("core")
      .from("app_memberships")
      .select("role")
      .eq("user_id", targetUserId)
      .eq("app_id", APP_ID)
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("project_memberships").select("role").eq("user_id", targetUserId),
    supabase.from("user_access_scopes").select("scope_role").eq("user_id", targetUserId).eq("active", true)
  ]);
  if (userResult.error || !userResult.data?.id) return new NextResponse("User not found.", { status: 404 });
  if (coreResult.error || membershipsResult.error || scopesResult.error) {
    return new NextResponse("Could not resolve the selected user's access.", { status: 500 });
  }

  const preferredRole = normalizedRole(coreResult.data?.role);
  const collectedRoles = [
    ...(membershipsResult.data ?? []).map((row) => normalizedRole(row.role)),
    ...(scopesResult.data ?? []).map((row) => normalizedRole(row.scope_role))
  ].filter((role): role is NonNullable<typeof role> => Boolean(role));
  const effectiveRole =
    preferredRole ??
    collectedRoles.sort((left, right) => rank(right) - rank(left))[0] ??
    null;
  if (effectiveRole === "admin" || effectiveRole === "project_manager") {
    return new NextResponse(
      "View as User is limited to read-only Viewer and Procurement Tracker accounts.",
      { status: 400 }
    );
  }
  if (effectiveRole !== "viewer" && effectiveRole !== "procurement_tracker") {
    return new NextResponse("The selected user does not have active scoped access.", { status: 400 });
  }

  const targetName = String(userResult.data.full_name ?? "").trim() || "Selected User";
  const expiresAt = Date.now() + IMPERSONATION_MAX_AGE_SECONDS * 1000;
  const token = createImpersonationToken({
    actorUserId: actualAccess.userId,
    targetUserId,
    targetName,
    targetRole: effectiveRole,
    expiresAt
  });
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const { error: auditError } = await supabase.from("admin_impersonation_audit").insert({
    actor_user_id: actualAccess.userId,
    target_user_id: targetUserId,
    event_type: "started",
    ip_address: forwardedFor,
    user_agent: request.headers.get("user-agent")
  });
  if (auditError) return new NextResponse(auditError.message, { status: 500 });

  const destination = new URL(effectiveRole === "procurement_tracker" ? "/procurement-tracker" : "/", request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS
  });
  return response;
}
