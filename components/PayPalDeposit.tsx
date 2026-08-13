"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { PAYPAL_FEE_PERCENT } from "@/lib/site";

// PayPal deposit button, shown after a booking is created. Renders nothing
// unless NEXT_PUBLIC_PAYPAL_CLIENT_ID is set, so the site is unaffected until
// PayPal is configured. Charges in EUR (PayPal doesn't support MUR); the amount
// comes from the server, not this component.
declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: unknown) => { render: (sel: string | HTMLElement) => Promise<void> };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

export default function PayPalDeposit({
  bookingId,
  depositMur,
  fullMur,
  kind = "vehicle",
  settlement = "deposit",
  onPaid,
}: {
  bookingId: string;
  depositMur: number; // the amount due in Rs (fee added on top for PayPal)
  fullMur?: number; // if set and > deposit, the customer can choose to pay the full total
  kind?: "vehicle" | "place"; // which table the booking lives in
  /**
   * Whether `depositMur` is a deposit with a balance owed later, or the whole
   * price. Activities are settled in full at booking, and calling that "pay
   * deposit to confirm" would promise a balance that will never be asked for.
   * The amount and the mechanics are identical — only the sentence differs.
   */
  settlement?: "deposit" | "full";
  onPaid?: () => void;
}) {
  const { language } = useLanguage();
  // Vehicles may let the customer pay the deposit OR the full total.
  const canPayFull = typeof fullMur === "number" && fullMur > depositMur;
  const [mode, setMode] = useState<"deposit" | "full">("deposit");
  const amountMur = mode === "full" && canPayFull ? (fullMur as number) : depositMur;
  // The customer bears the PayPal fee, so it's added on top for a transparent
  // "amount + fee = total" line (matches the server charge).
  const feeMur = Math.round((amountMur * PAYPAL_FEE_PERCENT) / 100);
  const totalMur = amountMur + feeMur;
  const rs = (n: number) => `Rs ${n.toLocaleString()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "paid" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const T = {
    en: { pay: "Pay deposit to confirm", payFull: "Pay in full", deposit: "Deposit", full: "Full", fee: `incl. ${PAYPAL_FEE_PERCENT}% PayPal fee`, paid: "Payment received — booking confirmed! 🎉", secure: "Secure payment via PayPal", err: "Payment could not be completed. Please try again or pay by bank transfer." },
    fr: { pay: "Payer l'acompte pour confirmer", payFull: "Payer la totalité", deposit: "Acompte", full: "Total", fee: `frais PayPal ${PAYPAL_FEE_PERCENT}% inclus`, paid: "Paiement reçu — réservation confirmée ! 🎉", secure: "Paiement sécurisé via PayPal", err: "Le paiement n'a pas pu aboutir. Réessayez ou payez par virement." },
    cr: { pay: "Pey depo pou konfirmen", payFull: "Pey tou", deposit: "Depo", full: "Tou", fee: `avek ${PAYPAL_FEE_PERCENT}% fre PayPal`, paid: "Peyman resevwar — rezervasion konfirmen! 🎉", secure: "Peyman sekirize ar PayPal", err: "Peyman pa finn pas. Reisi ankor ouswa pey par bank." },
  }[language] ?? {
    pay: "Pay deposit to confirm", payFull: "Pay in full", deposit: "Deposit", full: "Full", fee: `incl. ${PAYPAL_FEE_PERCENT}% PayPal fee`, paid: "Payment received — booking confirmed!", secure: "Secure payment via PayPal", err: "Payment could not be completed.",
  };

  // One word, three languages. The button is the last thing a customer reads
  // before paying, so it must not say "deposit" when the amount is everything.
  const PAY_IN_FULL = { en: "Pay in full to confirm", fr: "Payer la totalité pour confirmer", cr: "Pey tou pou konfirmen" };
  const payLabel = settlement === "full" ? (PAY_IN_FULL[language as keyof typeof PAY_IN_FULL] ?? PAY_IN_FULL.en) : T.pay;

  // Load the PayPal SDK once.
  useEffect(() => {
    if (!CLIENT_ID) return;
    if (window.paypal) { setReady(true); return; }
    const id = "paypal-sdk";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=EUR&intent=capture`;
    s.onload = () => setReady(true);
    s.onerror = () => { setState("error"); setMsg(T.err); };
    document.body.appendChild(s);
  }, [T.err]);

  // Render the buttons once the SDK is ready.
  useEffect(() => {
    if (!ready || !window.paypal || !containerRef.current || state === "paid") return;
    containerRef.current.innerHTML = "";
    window.paypal
      .Buttons({
        style: { color: "gold", shape: "pill", label: "pay", height: 44 },
        // Ask OUR server to create the order — amount is computed there.
        createOrder: async () => {
          const res = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId, kind, mode }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "create failed");
          return j.orderID as string;
        },
        // On approval, OUR server captures + verifies before we show success.
        onApprove: async (data: { orderID: string }) => {
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID, bookingId, kind }),
          });
          const j = await res.json();
          if (res.ok && j.ok) { setState("paid"); onPaid?.(); }
          else { setState("error"); setMsg(j.error || T.err); }
        },
        onError: () => { setState("error"); setMsg(T.err); },
      })
      .render(containerRef.current)
      .catch(() => { setState("error"); setMsg(T.err); });
  }, [ready, bookingId, kind, mode, state, onPaid, T.err]);

  if (!CLIENT_ID) return null;

  if (state === "paid") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
        <CheckCircle size={18} className="text-green-400 shrink-0" />
        <span className="font-dm text-sm text-green-400">{T.paid}</span>
      </div>
    );
  }

  return (
    <div>
      {canPayFull && (
        <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl bg-white/5 p-1">
          <button
            type="button"
            onClick={() => setMode("deposit")}
            className={`rounded-lg px-2 py-2 text-center text-[11px] font-syne font-bold leading-tight transition-colors ${mode === "deposit" ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"}`}
          >
            {T.deposit}<br />{rs(depositMur)}
          </button>
          <button
            type="button"
            onClick={() => setMode("full")}
            className={`rounded-lg px-2 py-2 text-center text-[11px] font-syne font-bold leading-tight transition-colors ${mode === "full" ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"}`}
          >
            {T.full}<br />{rs(fullMur as number)}
          </button>
        </div>
      )}
      <p className="mb-1 font-dm text-sm text-offwhite">
        {mode === "full" ? T.payFull : payLabel}: <span className="font-syne font-bold text-yellow">{rs(totalMur)}</span>
      </p>
      <p className="mb-2 font-dm text-[11px] text-muted/80">
        {rs(amountMur)} + {rs(feeMur)} {T.fee}
      </p>
      {!ready && (
        <div className="flex items-center gap-2 text-muted text-xs font-dm">
          <Loader2 size={14} className="animate-spin" /> …
        </div>
      )}
      <div ref={containerRef} />
      {state === "error" && msg && <p className="mt-2 font-dm text-xs text-red-400">{msg}</p>}
      <p className="mt-2 flex items-center gap-1.5 font-dm text-[11px] text-muted/70">
        <ShieldCheck size={12} className="text-yellow/60" /> {T.secure}
      </p>
    </div>
  );
}
