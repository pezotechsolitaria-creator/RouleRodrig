"use client";

import { Suspense, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { checkPassword } from "@/lib/auth/check-password";
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
  const { t } = useLanguage();
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

  // ── Establishing the recovery session ──────────────────────────────────────
  //
  // THE BUG THIS REPLACES. The old version waited 1.2 seconds for a session to
  // appear from the URL *fragment*, then declared the link dead. It handled no
  // token of any kind — no code exchange, no token_hash, no fragment parsing.
  //
  // But createBrowserClient() from @supabase/ssr uses **PKCE**, which returns
  // `?code=` in the QUERY STRING and requires an explicit exchange. So the
  // session could never appear and EVERY reset link failed, 100% of the time,
  // with a message blaming expiry. Reported from production with the link
  // clicked seconds after it arrived.
  //
  // Three separate arrival shapes now handled, because Supabase's choice
  // depends on flow type, template, and which device opened the mail:
  //
  //   1. ?token_hash=&type=recovery — verifyOtp. DEVICE-INDEPENDENT: it carries
  //      no verifier, so a link requested on a laptop opens fine on a phone.
  //      This is the shape to prefer; see the note at the end of the file.
  //   2. ?code=                     — PKCE exchange. Works only in the SAME
  //      browser that asked, because the code_verifier is stored there.
  //   3. #access_token=             — implicit flow; the client picks it up on
  //      its own, so we only need to wait.
  useEffect(() => {
    let cancelled = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });

    (async () => {
      // Already holding a recovery session (e.g. a refresh after arriving).
      const { data: existing } = await supabase.auth.getSession();
      if (cancelled) return;
      if (existing.session) {
        setReady(true);
        return;
      }

      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const code = params.get("code");

      // 1. token_hash — the cross-device path.
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type === "recovery" ? "recovery" : "email") as "recovery" | "email",
        });
        if (cancelled) return;
        if (!error) {
          setReady(true);
          return;
        }
        setLinkError(
          "This reset link is no longer valid — it may have been used already, or it expired. " +
            "Request a fresh one below; the new link works for one hour.",
        );
        return;
      }

      // 2. PKCE code — same-browser only.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (!error) {
          setReady(true);
          return;
        }
        // The overwhelmingly common cause, and worth naming precisely: the
        // person asked for the reset in one browser and opened the mail in
        // another. Telling them "expired" sends them round the same loop.
        setLinkError(
          "This link has to be opened in the same browser that asked for it. " +
            "If you requested it on another device, or opened it from an email app, " +
            "request a new one below and open it on this device.",
        );
        return;
      }

      // 3. Implicit fragment, or nothing at all. Give the client a moment to
      //    parse a fragment before concluding there is no token here.
      await new Promise((r) => setTimeout(r, 1500));
      if (cancelled) return;
      const { data: after } = await supabase.auth.getSession();
      if (cancelled) return;
      if (after.session) setReady(true);
      else
        setLinkError(
          "This reset link has expired or has already been used. Request a new one below.",
        );
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Those two passwords don't match.");
    // Same gate as sign-up: a reset must not be a route to a breached password.
    const verdict = await checkPassword(password);
    if (verdict) return setError(verdict);
    
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
          <ArrowLeft size={15} /> {t.resetPassword.backToSignIn}
        </Link>

        <div className="mb-8 text-center">
          <span className="flex items-baseline justify-center gap-1.5 font-syne font-extrabold leading-none">
            <span className="text-2xl text-offwhite">Roulé</span>
            <span className="text-2xl text-yellow">Rodrigues</span>
          </span>
          <p className="mt-1.5 font-bebas text-[11px] tracking-[0.34em] text-yellow">{t.resetPassword.newPasswordLabel}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-2 text-green-400" size={26} />
              <p className="font-syne text-sm font-bold text-offwhite">{t.resetPassword.updated}</p>
              <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                {t.resetPassword.takingYou}
              </p>
            </div>
          ) : linkError ? (
            <div className="text-center">
              <p className="font-dm text-sm text-red-400">{linkError}</p>
              <Link
                href="/login?reset=1"
                className="mt-4 inline-block rounded-full bg-yellow px-5 py-2.5 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
              >
                {t.resetPassword.requestNew}
              </Link>
            </div>
          ) : !ready ? (
            <p className="flex items-center justify-center gap-2 font-dm text-sm text-muted">
              <Loader2 size={15} className="animate-spin" /> {t.resetPassword.checkingLink}
            </p>
          ) : (
            <>
              <h1 className="font-syne text-xl font-bold text-offwhite">{t.resetPassword.chooseNew}</h1>
              <p className="mt-1 font-dm text-sm text-muted">{t.resetPassword.atLeast8}</p>

              <form onSubmit={submit} className="mt-5 space-y-3">
                <div className="relative">
                  <label htmlFor="rp-password" className="sr-only">New password</label>
                  <input
                    id="rp-password"
                    type={show ? "text" : "password"}
                    required
                    minLength={10}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t.resetPassword.newPassword}
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
                    minLength={10}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={t.resetPassword.confirmNew}
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
