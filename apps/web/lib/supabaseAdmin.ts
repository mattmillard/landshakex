import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });

  return client;
}
