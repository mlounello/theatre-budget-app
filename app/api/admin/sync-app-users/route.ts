import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAccessContext } from "@/lib/access";
import { syncAppUsers } from "@/lib/app-user-sync";

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const access = await getAccessContext();
  if (access.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const result = await syncAppUsers({ fullSync: true, reason: "api_admin_trigger" });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Sync failed" }, { status: result.status ?? 500 });
  }

  return NextResponse.json({ ok: true, count: result.count });
}
