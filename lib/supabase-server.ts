import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getServerAppSchema } from "@/lib/supabase-schema";

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
      schema: getServerAppSchema()
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
  return supabase.schema(getServerAppSchema());
}

// Backwards-compatible export used across the app today.
export async function getSupabaseServerClient() {
  return createSupabaseServerClient();
}
