"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/safe-next";

// ── Set a new password (M20) ────────────────────────────────────────────────
//
// The second half of the flow that did not exist: /login had no "Forgot
// password?" link and `resetPasswordForEmail` appeared nowhere in the codebase,
// so a returning customer who had forgotten their password could not sign in
// AND could not buy — the marketplace was closed to them entirely.
//
// Supabase's reset link carries a recovery token in the URL FRAGMENT, which the
// browser client exchanges for a short-lived session on load. That session can
// do exactly one useful thing: updateUser({ password }). We therefore do not
// treat "has a session here" as being signed in — the user is sent to sign in
// again afterwards, so the new password is proven to work.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/orders");

  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The recovery session arrives asynchronously as the client parses the URL
  // fragment. Waiting for it means we can tell "this link is expired" from
  // "still loading", instead of showing a form that will always fail.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
      else {
        // Give the fragment exchange a moment before declaring the link dead.
        setTimeout(() => {
          if (cancelled) return;
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (cancelled) return;
            if (d2.session) setReady(true);
            else
              setLinkError(
                "This reset link has expired or has already been used. Request a new one below.",
              );
          });
        }, 1200);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Those two passwords don't match.");

    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);

    // Sign out so the new password is actually exercised at the next sign-in,
    // rather than leaving the recovery session logged in and the password
    // unverified.
    await supabase.auth.signOut();
    setDone(true);
    setTimeout(() => router.push(`/login?next=${encodeURIComponent(next)}`), 2200);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-dark px-5 pb-24 text-offwhite md:pb-0">
      <div className="w-full max-w-sm">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
        >
          <ArrowLeft size={15} /> Back to sign in
        </Link>

        <div className="mb-8 text-center">
          <span className="flex items-baseline justify-center gap-1.5 font-syne font-extrabold leading-none">
            <span className="text-2xl text-offwhite">Roulé</span>
            <span className="text-2xl text-yellow">Rodrigues</span>
          </span>
          <p className="mt-1.5 font-bebas text-[11px] tracking-[0.34em] text-yellow">NEW PASSWORD</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-2 text-green-400" size={26} />
              <p className="font-syne text-sm font-bold text-offwhite">Password updated</p>
              <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                Taking you to sign in…
              </p>
            </div>
          ) : linkError ? (
            <div className="text-center">
              <p className="font-dm text-sm text-red-400">{linkError}</p>
              <Link
                href="/login?reset=1"
                className="mt-4 inline-block rounded-full bg-yellow px-5 py-2.5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
              >
                Request a new link
              </Link>
            </div>
          ) : !ready ? (
            <p className="flex items-center justify-center gap-2 font-dm text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> Checking your link…
            </p>
          ) : (
            <>
              <h1 className="font-syne text-xl font-bold text-offwhite">Choose a new password</h1>
              <p className="mt-1 font-dm text-sm text-muted">At least 8 characters.</p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                <div className="relative">
                  <label htmlFor="rp-password" className="sr-only">New password</label>
                  <input
                    id="rp-password"
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 pr-12 font-dm text-sm text-offwhite placeholder:text-muted/60 transition-colors focus:border-yellow focus:outline-none"
                  />
                  {/* 44px target, same reasoning as the sign-in reveal: a
                      mistyped password you cannot see is a failed reset. */}
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-offwhite focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
                  >
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <div>
                  <label htmlFor="rp-confirm" className="sr-only">Confirm new password</label>
                  <input
                    id="rp-confirm"
                    type={show ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 transition-colors focus:border-yellow focus:outline-none"
                  />
                </div>

                {error && <p role="alert" className="font-dm text-xs text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
