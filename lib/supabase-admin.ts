import { createClient } from "@supabase/supabase-js";
import { getServerAppSchema } from "@/lib/supabase-schema";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing env var: SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    db: {
      schema: getServerAppSchema()
    }
  });
}
