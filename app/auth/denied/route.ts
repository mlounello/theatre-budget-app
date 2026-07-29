import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const ACCESS_ERROR =
  "This account does not have active Theatre Budget access. Use the exact email that was authorized or contact the production manager.";

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", ACCESS_ERROR);
  return NextResponse.redirect(loginUrl);
}
