"use client";

import { useState } from "react";
import { authRedirect } from "@/lib/auth-redirect";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

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
  const [busy, setBusy] = useState<"email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const callback = () =>
    typeof window !== "undefined" ? authRedirect("/auth/callback") : undefined;

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
        {/* This page had NO way back — a merchant who tapped through from the
            marketplace was stuck behind the browser's own controls. */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
        >
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>
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

              {/* Renders only when the provider is actually enabled in
                  Supabase — see components/auth/GoogleSignInButton.tsx. */}
              <GoogleSignInButton next="/merchant" />

              <form onSubmit={submit} className="mt-6 space-y-3">
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

