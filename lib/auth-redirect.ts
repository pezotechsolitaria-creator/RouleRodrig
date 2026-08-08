import { SITE_URL } from "@/lib/site";

// Where Supabase Auth sends people back to after an email link or OAuth hop.
//
// ── THE BUG THIS FIXES ──────────────────────────────────────────────────────
// Every call site built these from `window.location.origin`. On a production
// visit that is correct — but it makes the link depend on which host the person
// happened to be standing on when they asked, and it silently produces
// `http://localhost:3000/...` for anything triggered from a dev machine.
//
// A password-reset email is the worst possible place for that, because the
// email OUTLIVES the browsing session that created it: the customer opens it an
// hour later, on their phone, and gets "Ce site est inaccessible — localhost".
// The reset itself worked; the landing did not. Reported from production
// 2026-08-08 with exactly that screenshot.
//
// ── THE RULE ────────────────────────────────────────────────────────────────
// NEXT_PUBLIC_SITE_URL is the canonical origin and is set in Vercel. When it
// exists, it always wins — an email link must point at the real site no matter
// where it was generated. Only when it is absent (local development, where the
// var is deliberately unset) do we fall back to the current origin, which is
// what a developer actually wants.
//
// This is the same principle lib/site.ts already applies to canonical tags,
// JSON-LD, the sitemap and every transactional email link; auth was the one
// surface still deriving its own answer.
//
// ── WHAT THIS ALONE CANNOT FIX ──────────────────────────────────────────────
// Supabase refuses any redirect that is not in its allow-list and silently
// falls back to the project's Site URL. If that is still the default
// `http://localhost:3000`, links land on localhost however correct this code
// is. Both halves are required — see docs/supabase-auth-emails.md.
export function authRedirect(path: string): string {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : SITE_URL);
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
