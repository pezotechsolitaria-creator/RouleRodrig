"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Lock, ShieldCheck, X, Check } from "lucide-react";
import type { PublicPlan } from "@/lib/esim/service";
import { planLabel, usageHint } from "@/lib/esim/format";
import { formatEur } from "@/lib/esim/pricing";
import { displayNetworks } from "@/lib/esim/networks";
import { esimTrack } from "@/lib/esim/analytics";
import { HOME_CODE, type Destination } from "@/lib/esim/destinations";
import CompatChecker from "./CompatChecker";
import { COPY, type UiLang } from "./copy";

// ── The checkout sheet ───────────────────────────────────────────────────────
//
// Three inputs, in the order a hesitant buyer needs them: WHAT they are
// buying (summary, restated), WHERE it goes (email), and WHETHER it will work
// (the eSIM tick — the single biggest cause of eSIM refunds is a phone that
// cannot take one). Then PayPal's own buttons, which include a guest card
// form: no PayPal account needed, and no card number ever touches this site.
//
// The price is never sent from here. /api/esim/checkout reads it from the
// plan row and checks the wholesaler's live price before PayPal is opened.

type PayPalButtons = {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
};
type PayPalNS = { Buttons: (opts: unknown) => PayPalButtons };
const paypalNS = () => (window as unknown as { paypal?: PayPalNS }).paypal;

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function useAttribution(): Record<string, string> {
  const [src, setSrc] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const out: Record<string, string> = { landing: u.pathname };
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"]) {
        const v = u.searchParams.get(k);
        if (v) out[k] = v.slice(0, 120);
      }
      if (document.referrer) out.referrer = new URL(document.referrer).hostname.slice(0, 120);
      setSrc(out);
    } catch {
      /* attribution is optional */
    }
  }, []);
  return src;
}

export default function CheckoutSheet({
  plan,
  lang,
  selling,
  destination,
  onClose,
}: {
  plan: PublicPlan;
  lang: UiLang;
  selling: boolean;
  /** The shelf the plan was chosen on — sent to checkout, which checks the
   *  plan really is listed there (and, for Mauritius, covers Rodrigues). */
  destination: Destination;
  onClose: () => void;
}) {
  const t = COPY[lang];
  const router = useRouter();
  const source = useAttribution();

  const [email, setEmail] = useState("");
  const [compatOk, setCompatOk] = useState(false);
  const [showCompat, setShowCompat] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [notified, setNotified] = useState(false);

  // Latest values for the PayPal callbacks, which are created once.
  const live = useRef({ email, compatOk, source });
  // Synced after each render, not during it: the PayPal callbacks only ever run
  // on a later user action, by which time this has caught up.
  useEffect(() => {
    live.current = { email, compatOk, source };
  });
  const orderIdRef = useRef<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const price = formatEur(plan.retail_eur_cents, lang);
  const label = planLabel(plan, lang);

  // ── Escape closes; focus moves into the sheet; the page behind stops scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !processing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, processing]);

  // ── PayPal SDK, loaded once per page (shared id with the rental button).
  useEffect(() => {
    if (!selling || !CLIENT_ID) return;
    if (paypalNS()) {
      setSdkReady(true);
      return;
    }
    const id = "paypal-sdk";
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    const onLoad = () => setSdkReady(true);
    const onErr = () => setError(t.payFail);
    if (existing) {
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onErr);
      return () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onErr);
      };
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=EUR&intent=capture`;
    s.onload = onLoad;
    s.onerror = onErr;
    document.body.appendChild(s);
  }, [selling, t.payFail]);

  const validate = useCallback((): boolean => {
    setTouched(true);
    if (!EMAIL_RE.test(live.current.email.trim())) {
      setError(t.emailBad);
      return false;
    }
    if (!live.current.compatOk) {
      setError(t.compatConfirmNeeded);
      return false;
    }
    setError(null);
    return true;
  }, [t.emailBad, t.compatConfirmNeeded]);

  // ── PayPal buttons, rendered once the SDK is ready.
  useEffect(() => {
    const paypal = paypalNS();
    if (!sdkReady || !paypal || !container.current) return;
    container.current.innerHTML = "";
    const buttons = paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "pill", label: "pay", height: 48 },
      onClick: (_data: unknown, actions: { resolve: () => void; reject: () => void }) => {
        if (!validate()) return actions.reject();
        esimTrack.checkoutStarted({ plan: plan.name, price_eur: plan.retail_eur_cents / 100 });
        return actions.resolve();
      },
      createOrder: async () => {
        const res = await fetch("/api/esim/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: plan.id,
            destination: destination.code,
            email: live.current.email.trim(),
            language: lang,
            source: live.current.source,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          esimTrack.checkoutFailed({ stage: "create", status: res.status });
          setError(j.error || t.payFail);
          throw new Error(j.error || "create failed");
        }
        orderIdRef.current = j.orderId;
        return j.paypalOrderId as string;
      },
      onApprove: async (data: { orderID: string }) => {
        setProcessing(true);
        setError(null);
        const res = await fetch("/api/esim/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderIdRef.current, paypalOrderId: data.orderID }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.url) {
          esimTrack.paid({ plan: plan.name, price_eur: plan.retail_eur_cents / 100, delivered: j.status === "delivered" });
          router.push(j.url);
          return;
        }
        esimTrack.checkoutFailed({ stage: "capture", status: res.status });
        setProcessing(false);
        setError(j.error || t.payFail);
      },
      onError: () => {
        esimTrack.checkoutFailed({ stage: "paypal", status: null });
        setError((e) => e ?? t.payFail);
      },
    });
    buttons.render(container.current).catch(() => setError(t.payFail));
    return () => {
      buttons.close?.().catch(() => {});
    };
    // Rendered once per sheet; callbacks read the latest values through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdkReady]);

  async function notify(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid) {
      setTouched(true);
      setError(t.emailBad);
      return;
    }
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), source: "esim" }),
    });
    if (res.ok) {
      setNotified(true);
      esimTrack.notifyMe({ plan: plan.name });
    } else setError(t.payFail);
  }

  const home = destination.code === HOME_CODE;
  const networks = home
    ? displayNetworks(plan.networks)
    : plan.networks.slice(0, 2).map((n) => (n.type ? `${n.name} ${n.type}` : n.name));

  // PORTALLED to <body>. Rendered in place, the sheet sat inside the page
  // wrapper's stacking context (it animates with a transform), so the global
  // bottom nav — z-40 at the root — painted OVER the sheet's pay button on a
  // phone, whatever z-index the sheet asked for. z-[600] is the site's modal
  // layer (the booking and cart sheets use the same).
  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        aria-label={t.close}
        onClick={() => !processing && onClose()}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="esim-sheet-title"
        tabIndex={-1}
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-dark px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
              {t.sheetTitle.toUpperCase()} · {(lang === "en" ? destination.en : destination.fr).toUpperCase()}
            </p>
            <h2 id="esim-sheet-title" className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
              {label}
            </h2>
            <p className="mt-1 font-dm text-sm text-muted">
              {[...networks, usageHint(plan, lang)].join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            aria-label={t.close}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-offwhite/80 hover:bg-white/5 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-baseline justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="font-dm text-sm text-muted">Total</span>
          <span className="font-syne text-2xl font-extrabold text-yellow">{price}</span>
        </div>

        {processing ? (
          <div className="mt-6 flex flex-col items-center py-8 text-center" role="status" aria-live="polite">
            <Loader2 size={32} className="animate-spin text-yellow" aria-hidden />
            <p className="mt-4 font-syne text-lg font-bold text-offwhite">{t.processing}</p>
            <p className="mt-1 font-dm text-sm text-muted">{t.processingSub}</p>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={selling ? (e) => e.preventDefault() : notify} noValidate>
            <div>
              <label htmlFor="esim-email" className="font-bebas text-[11px] tracking-[0.25em] text-muted">
                {t.email.toUpperCase()} <span className="text-yellow">*</span>
              </label>
              <input
                id="esim-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onBlur={() => setTouched(true)}
                aria-invalid={touched && !emailValid}
                aria-describedby="esim-email-help"
                placeholder="you@example.com"
                className={`mt-1.5 w-full rounded-xl border bg-dark-card px-4 py-3.5 font-dm text-base text-offwhite placeholder:text-muted/50 focus:outline-none ${
                  touched && !emailValid ? "border-red-500/60" : "border-dark-border focus:border-yellow"
                }`}
              />
              <p id="esim-email-help" className="mt-1.5 font-dm text-xs text-muted">
                {t.emailHelp}
              </p>
            </div>

            {selling && (
              <div>
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={compatOk}
                    onChange={(e) => {
                      setCompatOk(e.target.checked);
                      if (error) setError(null);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-yellow/60 ${
                      compatOk ? "border-yellow bg-yellow text-dark" : "border-white/25"
                    }`}
                  >
                    {compatOk && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="font-dm text-sm text-offwhite/90">{t.compatConfirm}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowCompat((v) => !v)}
                  aria-expanded={showCompat}
                  className="ml-8 min-h-11 font-dm text-sm text-yellow/80 underline underline-offset-4 hover:text-yellow"
                >
                  {t.compatCheck}
                </button>
                {showCompat && (
                  <div className="mt-2">
                    <CompatChecker lang={lang} compact />
                  </div>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-300">
                {error}
              </p>
            )}

            {selling ? (
              <div>
                {!sdkReady && (
                  <div className="flex h-12 items-center justify-center gap-2 rounded-full border border-white/10 font-dm text-sm text-muted">
                    <Loader2 size={16} className="animate-spin" aria-hidden /> {t.payLoading}
                  </div>
                )}
                <div ref={container} className="min-h-[1px]" />
                <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-dm text-xs text-muted">
                  <Lock size={12} aria-hidden /> {t.secure}
                </p>
                <p className="mt-1.5 flex items-center justify-center gap-1.5 text-center font-dm text-xs text-muted">
                  <ShieldCheck size={12} aria-hidden /> {t.guarantee}
                </p>
              </div>
            ) : notified ? (
              <p role="status" className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 font-dm text-sm text-offwhite">
                {t.soonDone}
              </p>
            ) : (
              <div>
                <p className="font-syne text-base font-bold text-offwhite">{t.soonTitle}</p>
                <p className="mt-1 font-dm text-sm text-muted">{t.soonBody}</p>
                <button
                  type="submit"
                  className="mt-4 w-full rounded-full bg-yellow py-4 font-syne text-sm font-bold text-dark transition-colors hover:bg-yellow-dark"
                >
                  {t.soonCta}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
