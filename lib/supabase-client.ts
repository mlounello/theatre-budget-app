import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getBrowserAppSchema } from "@/lib/supabase-schema";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient<Database, "app_theatre_budget">(url, anon, {
    db: {
      schema: getBrowserAppSchema() as "app_theatre_budget"
    }
  });
}

export function createTbBrowserDb() {
  return createSupabaseBrowserClient().schema(getBrowserAppSchema() as "app_theatre_budget");
}

// Backwards-compatible export used across the app today.
export function getSupabaseBrowserClient() {
  return createSupabaseBrowserClient();
}
