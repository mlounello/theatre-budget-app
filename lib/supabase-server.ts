import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { APP_SCHEMA } from "@/lib/supabase-schema";

function mustGetEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  type CookieToSet = {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  };
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing env var: SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createServerClient(url, anon, {
    db: {
      schema: APP_SCHEMA
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items: CookieToSet[]) {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always set cookies; middleware refresh handles session persistence.
        }
      }
    }
  });
}

export async function createTbServerDb() {
  const supabase = await createSupabaseServerClient();
  return supabase.schema(APP_SCHEMA);
}

// Backwards-compatible export used across the app today.
export async function getSupabaseServerClient() {
  return createSupabaseServerClient();
}
