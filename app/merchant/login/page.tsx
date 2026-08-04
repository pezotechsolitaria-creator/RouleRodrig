"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, ArrowRight } from "lucide-react";

// Merchant sign-in. Free + reliable: email + password (no external service, no
// delivery dependency) plus Google one-tap (free, when the provider is enabled).
// A merchant starts as 'pending' and is gated by admin approval, so an
// unconfirmed email can't do anything public — email confirmation can safely be
// off in Supabase for a zero-friction signup.
export default function MerchantLoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

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
      setError("Google sign-in isn't set up yet — use your email and password.");
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: callback() },
      });
      setBusy(null);
      if (error) return setError(error.message);
      // If email confirmation is OFF, a session is returned → go straight in.
      if (data.session) window.location.href = "/merchant";
      else setCheckEmail(true); // confirmation ON → they must click the email
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(null);
    if (error) setError(error.message);
    else window.location.href = "/merchant";
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
          {checkEmail ? (
            <div className="rounded-xl border border-yellow/25 bg-yellow/[0.06] p-5 text-center">
              <Mail className="mx-auto mb-2 text-yellow" size={22} />
              <p className="font-syne text-sm font-bold text-offwhite">Confirm your email</p>
              <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                We sent a confirmation link to <b className="text-offwhite/90">{email}</b>. Open it, then sign in.
              </p>
              <button
                onClick={() => {
                  setCheckEmail(false);
                  setMode("signin");
                }}
                className="mt-4 font-dm text-xs text-yellow hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-syne text-xl font-bold text-offwhite">
                {mode === "signin" ? "Sign in" : "Create your shop account"}
              </h1>
              <p className="mt-1 font-dm text-sm text-muted">
                {mode === "signin" ? "Welcome back." : "Free to join. Sell in minutes."}
              </p>

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
                <span className="font-dm text-[11px] text-muted">or with email</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={submit} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
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
                      {mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </form>

              {error && <p className="mt-4 font-dm text-xs text-red-400">{error}</p>}

              <button
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                }}
                className="mt-5 w-full text-center font-dm text-xs text-muted transition-colors hover:text-yellow"
              >
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>

        <p className="mx-auto mt-5 max-w-xs text-center font-dm text-[11px] leading-relaxed text-muted">
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
