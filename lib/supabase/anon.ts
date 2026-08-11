import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// A cookieless, session-free Supabase client for PUBLIC reads during static
// generation.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// lib/supabase/server.ts reads cookies to carry the visitor's session. That is
// correct everywhere a request has a visitor — and fatal in a statically
// generated route, because touching cookies opts the whole route into dynamic
// rendering. In app/sitemap.ts it did something worse than fail loudly: Next
// threw "Dynamic server usage", the try/catch swallowed it, and the sitemap
// shipped with EVERY dish URL missing. A silently shorter sitemap is exactly
// the kind of SEO regression nobody notices for months.
//
// So: same anon key, same RLS, same public grants — just no cookie jar, and
// therefore no accidental dynamic rendering.
//
// Use it ONLY for data that is public by definition (the food catalog, the shop
// directory). Anything scoped to a signed-in user needs the session and belongs
// on the server client.
export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase URL / anon key are not configured.");

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
