"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

// Customer sign-in — shares the exact same Supabase Auth session/cookie
// mechanism as /merchant/login (same provider, same /auth/callback route),
// just differently branded and defaulting to a customer destination
// (?next=/orders) instead of /merchant. There's only ever one kind of
// Supabase user; "merchant" vs "customer" is which tables reference their
// id, not a separate auth system.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/orders";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Resets to hidden on every mount, so a revealed password never survives a
  // navigation back to this page.
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const callback = () =>
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined;

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
      if (data.session) window.location.href = next;
      else setCheckEmail(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(null);
    if (error) setError(error.message);
    else window.location.href = next;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-dark px-5 text-offwhite">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow">
          <ArrowLeft size={15} /> Roule Rodrigues
        </Link>

        <div className="mb-8 text-center">
          <span className="flex items-baseline justify-center gap-1.5 font-syne font-extrabold leading-none">
            <span className="text-2xl text-offwhite">Roulé</span>
            <span className="text-2xl text-yellow">Rodrigues</span>
          </span>
          <p className="mt-1.5 font-bebas text-[11px] tracking-[0.34em] text-yellow">MY ACCOUNT</p>
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
                onClick={() => { setCheckEmail(false); setMode("signin"); }}
                className="mt-4 font-dm text-xs text-yellow hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <h1 className="font-syne text-xl font-bold text-offwhite">
                {mode === "signin" ? "Sign in" : "Create your account"}
              </h1>
              <p className="mt-1 font-dm text-sm text-muted">
                {mode === "signin" ? "Track and manage your orders." : "Takes a minute."}
              </p>

              {/* Renders only when the provider is actually enabled in
                  Supabase — a disabled provider used to strand customers on
                  the authorize endpoint's raw 400 JSON. */}
              <GoogleSignInButton next={next} />

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
                <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 pr-12 font-dm text-sm text-offwhite placeholder:text-muted/50 transition-colors focus:border-yellow focus:outline-none"
                />
                {/* Reveal toggle. Typing a password blind on a phone keyboard is
                    a common cause of failed sign-ins and of people abandoning
                    account creation — and on a 6-character minimum, a single
                    mistyped character is invisible until the request fails.
                    Deliberately a <button type="button">: inside a form, the
                    default type is "submit", so omitting it would make the eye
                    icon submit the login form.
                    h-11 w-11 = 44px, the WCAG 2.5.5 / Apple minimum. Measured
                    at 28px with icon padding alone — a real mistap risk on a
                    mobile-first site where the cost is a failed login. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-offwhite focus:text-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/60"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                </div>
                <button
                  type="submit"
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                >
                  {busy === "email" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={15} /></>
                  )}
                </button>
              </form>

              {error && <p className="mt-4 font-dm text-xs text-red-400">{error}</p>}

              <button
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
                className="mt-5 w-full text-center font-dm text-xs text-muted transition-colors hover:text-yellow"
              >
                {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

