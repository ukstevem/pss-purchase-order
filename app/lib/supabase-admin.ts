import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client for server components + server actions. Bypasses RLS;
// never import from a client component. Lazy init so build-time page-data
// collection doesn't trip before runtime env is available.

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "supabase-admin requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in env"
    );
  }

  _client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
