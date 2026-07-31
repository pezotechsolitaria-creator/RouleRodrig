"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, ArrowRight } from "lucide-react";

// Merchant sign-in. Google (Android-native, one tap) + email magic-link fallback
// so the flow works today without any provider setup. Both funnel through
// /auth/callback. Trilingual copy comes with the wider merchant UI; kept simple here.
export default function MerchantLoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callback = () =>
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function google() {
    setBusy("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (error) {
      setError("Google sign-in isn't set up yet — use your email below.");
      setBusy(null);
    }
  }

  async function emailLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callback() },
    });
    setBusy(null);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-dark px-5 text-offwhite">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="flex items-baseline justify-center gap-1.5 font-syne font-extrabold leading-none">
            <span className="text-2xl text-offwhite">Roulé</span>
            <span className="text-2xl text-yellow">Rodrigues</span>
          </span>
          <p className="mt-1.5 font-bebas text-[11px] tracking-[0.34em] text-yellow">MERCHANT</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          <h1 className="font-syne text-xl font-bold text-offwhite">Sell on Roulé Rodrigues</h1>
          <p className="mt-1 font-dm text-sm text-muted">Sign in to your producer account.</p>

          {sent ? (
            <div className="mt-6 rounded-xl border border-yellow/25 bg-yellow/[0.06] p-5 text-center">
              <Mail className="mx-auto mb-2 text-yellow" size={22} />
              <p className="font-syne text-sm font-bold text-offwhite">Check your inbox</p>
              <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                We sent a sign-in link to <b className="text-offwhite/90">{email}</b>. Open it on this phone.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 font-dm text-xs text-yellow hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={google}
                disabled={!!busy}
                className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 font-syne text-sm font-bold text-offwhite transition-colors hover:bg-white/[0.08] disabled:opacity-60"
              >
                {busy === "google" ? <Loader2 size={16} className="animate-spin" /> : <GoogleGlyph />}
                Continue with Google
              </button>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />
                <span className="font-dm text-[11px] text-muted">or</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={emailLink} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                >
                  {busy === "email" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Email me a sign-in link <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {error && <p className="mt-4 font-dm text-xs text-red-400">{error}</p>}
        </div>

        <p className="mx-auto mt-5 max-w-xs text-center font-dm text-[11px] leading-relaxed text-muted/60">
          Listing is free. We only verify your business before your first payout.
        </p>
      </div>
    </main>
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
