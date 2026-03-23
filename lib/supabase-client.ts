import { createBrowserClient } from "@supabase/ssr";
import { getBrowserAppSchema } from "@/lib/supabase-schema";

export function createSupabaseBrowserClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing env var: SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anon, {
    db: {
      schema: getBrowserAppSchema()
    }
  });
}

export function createTbBrowserDb() {
  return createSupabaseBrowserClient().schema(getBrowserAppSchema());
}

// Backwards-compatible export used across the app today.
export function getSupabaseBrowserClient() {
  return createSupabaseBrowserClient();
}
