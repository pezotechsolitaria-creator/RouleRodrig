"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ── Google sign-in that can never strand a customer on raw JSON ─────────────
//
// The old code called signInWithOAuth() directly, which NAVIGATES the browser
// to <supabase>/auth/v1/authorize. With the Google provider disabled in
// Supabase, that endpoint answers `{"code":400,...,"Unsupported provider"}` —
// and because the navigation had already happened, the page's own error
// handling never ran. A customer tapping "Continue with Google" landed on a
// black screen of JSON (verified live, 2026-08-07).
//
// This component asks GoTrue's public settings endpoint (auth/v1/settings →
// external.google) whether the provider is actually enabled, and renders
// NOTHING when it isn't — a button that cannot work should not exist. The
// moment the owner enables the provider in Supabase, the button reappears on
// its own: no code change, no redeploy.
//
// The click path is hardened too: skipBrowserRedirect gives us the authorize
// URL without navigating, so any error surfaces inline instead of replacing
// the page.

let cachedAvailable: boolean | null = null;

async function googleEnabled(): Promise<boolean> {
  if (cachedAvailable !== null) return cachedAvailable;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    cachedAvailable = settings.external?.google === true;
    return cachedAvailable;
  } catch {
    return false; // unreachable settings → don't offer a sign-in we can't prove works
  }
}

export default function GoogleSignInButton({ next }: { next: string }) {
  const [available, setAvailable] = useState<boolean>(cachedAvailable === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    googleEnabled().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  async function google() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
      },
    });
    if (error || !data?.url) {
      setError("Google sign-in didn't respond — use your email and password below.");
      setBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <>
      <button
        onClick={google}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 font-syne text-sm font-bold text-offwhite transition-colors hover:bg-white/[0.08] disabled:opacity-60"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlyph />}
        Continue with Google
      </button>
      {error && <p className="mt-2 font-dm text-xs text-red-400">{error}</p>}
      {/* mt only — the email form below carries its own top margin, which is
          also the whole spacing when this component renders nothing. */}
      <div className="mt-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="font-dm text-[11px] text-muted">or with email</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
    </>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z" />
    </svg>
  );
}
