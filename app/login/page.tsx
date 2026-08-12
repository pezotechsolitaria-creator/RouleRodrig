"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Mail, ArrowRight, ArrowLeft, Eye, EyeOff, ChefHat, Store, Ticket, Truck } from "lucide-react";
import Link from "next/link";
import { safeNext } from "@/lib/safe-next";
import { authRedirect } from "@/lib/auth-redirect";
import { checkPassword } from "@/lib/auth/check-password";
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
  // Sanitised: this value is navigated to and forwarded into the auth callback,
  // and was previously an open redirect + a javascript: sink. See lib/safe-next.
  // Default to /account, not /orders.
  //
  // One sign-in serves customers, shop owners, cooks, drivers and organisers,
  // and it used to land everyone on the CUSTOMER page. A cook who followed an
  // invitation without ?next signed in and saw "Your activity" — no kitchen, no
  // hint one existed — which reads as a broken invitation rather than a wrong
  // landing page.
  //
  // /account is the one page that reads who you actually are and shows the
  // doors you have: your shop, your kitchen, your deliveries, your events. A
  // customer with no other role sees their orders there anyway, so nobody is
  // sent further from where they were going.
  const next = safeNext(searchParams.get("next"), "/account");

  // ── WHO IS SIGNING IN ──────────────────────────────────────────────────────
  // One sign-in serves customers, cooks, shop owners, drivers and organisers,
  // and it looked identical to all of them. A cook following a kitchen invite
  // saw a generic "Sign in — Track and manage your orders", which says nothing
  // about the kitchen they were invited to and reads as the wrong page.
  //
  // The destination already tells us who they are, so the page says it back to
  // them. Same form, same security, different label — enough to confirm "yes,
  // this is the right door" before typing a password.
  const CONTEXT: Record<
    string,
    { badge: string; signin: string; blurb: string; Icon: React.ElementType; ring: string; tint: string; text: string }
  > = {
    "/kitchen": {
      badge: "KITCHEN", signin: "Kitchen sign-in",
      blurb: "See today's orders and move them along.",
      Icon: ChefHat, ring: "border-orange-400/40", tint: "bg-orange-500/10", text: "text-orange-300",
    },
    "/merchant": {
      badge: "MY SHOP", signin: "Shop sign-in",
      blurb: "Your products, orders and opening hours.",
      Icon: Store, ring: "border-sky-400/40", tint: "bg-sky-500/10", text: "text-sky-300",
    },
    "/organizer": {
      badge: "EVENTS", signin: "Organiser sign-in",
      blurb: "Your events, tickets and door staff.",
      Icon: Ticket, ring: "border-fuchsia-400/40", tint: "bg-fuchsia-500/10", text: "text-fuchsia-300",
    },
    "/driver": {
      badge: "DELIVERIES", signin: "Driver sign-in",
      blurb: "Your jobs and today's earnings.",
      Icon: Truck, ring: "border-teal-400/40", tint: "bg-teal-500/10", text: "text-teal-300",
    },
  };
  // startsWith, because an invite may carry a deeper path like /organizer/x/scan.
  const ctx =
    Object.entries(CONTEXT).find(([prefix]) => next === prefix || next.startsWith(`${prefix}/`))?.[1] ??
    null;
  // The auth callback sends people here when a link is expired or already used;
  // nothing read this before, so the visitor saw an unexplained login screen.
  const authFailed = searchParams.get("error") === "auth";
  // ?reset=1 opens straight into the forgot-password panel (used by the
  // "Request a new link" button on an expired reset).
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(
    searchParams.get("reset") === "1" ? "forgot" : "signin",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Resets to hidden on every mount, so a revealed password never survives a
  // navigation back to this page.
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Sending the reset email. This whole flow did not exist: there was no
  // "Forgot password?" link anywhere and resetPasswordForEmail appeared nowhere
  // in the codebase, so a customer who forgot their password could neither sign
  // in nor buy.
  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirect(`/auth/reset-password?next=${encodeURIComponent(next)}`),
    });
    setBusy(null);
    // Deliberately reports success either way: telling an anonymous visitor
    // whether an address has an account is an account-enumeration oracle.
    if (error) console.error("resetPasswordForEmail", error);
    setResetSent(true);
  }

  const callback = () =>
    typeof window !== "undefined"
      ? authRedirect(`/auth/callback?next=${encodeURIComponent(next)}`)
      : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);

    if (mode === "signup") {
      // Refuse a password already in a breach corpus, BEFORE creating the
      // account. Supabase gates this behind the Pro plan; the underlying Have I
      // Been Pwned API is free, so we do it ourselves. Fails open — if the
      // check cannot run, sign-up proceeds rather than stalling on a
      // third-party outage.
      const verdict = await checkPassword(password);
      if (verdict) {
        setBusy(null);
        return setError(verdict);
      }
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
    if (error) return setError(error.message);
    // Adopt any orders placed as a GUEST with this now-verified address, so the
    // account shows a complete history instead of starting empty. Matched
    // server-side on auth.users.email — never on anything sent from here — and
    // idempotent, so a repeat sign-in is a no-op. Best-effort: a failure here
    // must never block a successful sign-in.
    try {
      await supabase.rpc("claim_guest_orders");
    } catch (err) {
      console.error("claim_guest_orders failed", err);
    }
    // An EVENT ORGANISER belongs in their own area, not in /orders (M43/M44).
    // Claim first — someone invited after they signed up is only linked at this
    // moment — then ask. Both calls are idempotent and server-side; a failure in
    // either just means the customer destination, never a blocked sign-in.
    //
    // `next` still wins when it was explicitly asked for, so an organiser who
    // followed a link to a specific page still lands there.
    if (!searchParams.get("next")) {
      try {
        await supabase.rpc("claim_organizer_invite");
        const { data: isOrganizer } = await supabase.rpc("is_event_organizer");
        if (isOrganizer) {
          window.location.href = "/organizer";
          return;
        }
      } catch (err) {
        console.error("organizer check failed", err);
      }
    }
    window.location.href = next;
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
          {ctx ? (
            // A ROLE DOOR. Same account, same form, but it should be
            // recognisable at a glance — the owner's point was that every
            // sign-in looked identical, so wording alone was not enough.
            <div className={`mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 ${ctx.ring} ${ctx.tint}`}>
              <ctx.Icon size={14} className={ctx.text} />
              <span className={`font-bebas text-[11px] tracking-[0.28em] ${ctx.text}`}>{ctx.badge}</span>
            </div>
          ) : (
            <p className="mt-1.5 font-bebas text-[11px] tracking-[0.34em] text-yellow">MY ACCOUNT</p>
          )}
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
          ) : resetSent ? (
            <div className="rounded-xl border border-yellow/25 bg-yellow/[0.06] p-5 text-center">
              <Mail className="mx-auto mb-2 text-yellow" size={22} />
              <p className="font-syne text-sm font-bold text-offwhite">Check your inbox</p>
              <p className="mt-1 font-dm text-xs leading-relaxed text-muted">
                If an account exists for <b className="text-offwhite/90">{email}</b>, we&apos;ve sent a link
                to set a new password. It expires in an hour.
              </p>
              <button
                onClick={() => { setResetSent(false); setMode("signin"); }}
                className="mt-4 font-dm text-xs text-yellow hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : mode === "forgot" ? (
            <>
              <h1 className="font-syne text-xl font-bold text-offwhite">Reset your password</h1>
              <p className="mt-1 font-dm text-sm text-muted">
                We&apos;ll email you a link to choose a new one.
              </p>
              <form onSubmit={sendReset} className="mt-6 space-y-3">
                <label htmlFor="fp-email" className="sr-only">Email</label>
                <input
                  id="fp-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-xl border border-dark-border bg-dark-card px-4 py-3 font-dm text-sm text-offwhite placeholder:text-muted/60 transition-colors focus:border-yellow focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!!busy}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-yellow px-5 py-3 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark disabled:opacity-60"
                >
                  {busy === "email" ? <Loader2 size={16} className="animate-spin" /> : <>Send reset link <ArrowRight size={15} /></>}
                </button>
              </form>
              <button
                onClick={() => { setMode("signin"); setError(null); }}
                className="mt-5 w-full text-center font-dm text-xs text-muted transition-colors hover:text-yellow"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              {/* The auth callback redirects here with ?error=auth when a link
                  is expired or already used. Nothing read it before, so the
                  visitor was returned to a bare login form with no explanation
                  — and customers were sent to the MERCHANT login at that. */}
              {authFailed && (
                <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 font-dm text-xs text-red-400">
                  That sign-in link has expired or was already used. Please sign in again.
                </p>
              )}
              <h1 className="font-syne text-xl font-bold text-offwhite">
                {mode === "signin" ? (ctx?.signin ?? "Sign in") : "Create your account"}
              </h1>
              <p className="mt-1 font-dm text-sm text-muted">
                {mode === "signin"
                  ? (ctx?.blurb ?? "Track and manage your orders.")
                  : ctx
                    ? `${ctx.blurb} Use the email address you were invited with.`
                    : "Takes a minute."}
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
                  minLength={10}
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

              {mode === "signin" && (
                <button
                  onClick={() => { setMode("forgot"); setError(null); }}
                  className="mt-4 w-full text-center font-dm text-xs text-yellow hover:underline"
                >
                  Forgot password?
                </button>
              )}

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

