import "server-only";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSSRClient } from "./server";

// ── Privileged, server-only Supabase access ──────────────────────────────────
// When SUPABASE_SERVICE_ROLE_KEY is configured we use the service-role key,
// which BYPASSES Row-Level Security. This is the correct way to perform admin
// writes/reads once RLS is locked down so the public anon key can no longer
// touch sensitive tables.
//
// SECURITY: the service-role key must ONLY ever live on the server. This module
// is marked `server-only`; never import it from a client component.
//
// If the key is not set, we transparently fall back to the cookie/anon SSR
// client so the app keeps working on the *current* permissive RLS. After the
// RLS lockdown migration is applied, the key becomes mandatory for admin ops.

let cached: SupabaseClient | null = null;

export function hasServiceRole(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getPrivileged(): Promise<SupabaseClient> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (key && url) {
    if (!cached) {
      cached = createServiceClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return cached;
  }

  // Fallback — only safe while RLS policies remain permissive.
  return (await createSSRClient()) as unknown as SupabaseClient;
}
