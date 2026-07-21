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
  onPaid,
}: {
  bookingId: string;
  depositMur: number; // the deposit in Rs (fee added on top for PayPal)
  onPaid?: () => void;
}) {
  const { language } = useLanguage();
  // The customer bears the PayPal fee, so it's added to the deposit here for a
  // fully transparent "deposit + fee = total" line (matches the server charge).
  const feeMur = Math.round((depositMur * PAYPAL_FEE_PERCENT) / 100);
  const totalMur = depositMur + feeMur;
  const rs = (n: number) => `Rs ${n.toLocaleString()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "paid" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const T = {
    en: { pay: "Pay deposit to confirm", fee: `incl. ${PAYPAL_FEE_PERCENT}% PayPal fee`, paid: "Deposit paid — booking confirmed! 🎉", secure: "Secure payment via PayPal", err: "Payment could not be completed. Please try again or pay by bank transfer." },
    fr: { pay: "Payer l'acompte pour confirmer", fee: `frais PayPal ${PAYPAL_FEE_PERCENT}% inclus`, paid: "Acompte payé — réservation confirmée ! 🎉", secure: "Paiement sécurisé via PayPal", err: "Le paiement n'a pas pu aboutir. Réessayez ou payez par virement." },
    cr: { pay: "Pey depo pou konfirmen", fee: `avek ${PAYPAL_FEE_PERCENT}% fre PayPal`, paid: "Depo peye — rezervasion konfirmen! 🎉", secure: "Peyman sekirize ar PayPal", err: "Peyman pa finn pas. Reisi ankor ouswa pey par bank." },
  }[language] ?? {
    pay: "Pay deposit to confirm", fee: `incl. ${PAYPAL_FEE_PERCENT}% PayPal fee`, paid: "Deposit paid — booking confirmed!", secure: "Secure payment via PayPal", err: "Payment could not be completed.",
  };

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
            body: JSON.stringify({ bookingId }),
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
            body: JSON.stringify({ orderID: data.orderID, bookingId }),
          });
          const j = await res.json();
          if (res.ok && j.ok) { setState("paid"); onPaid?.(); }
          else { setState("error"); setMsg(j.error || T.err); }
        },
        onError: () => { setState("error"); setMsg(T.err); },
      })
      .render(containerRef.current)
      .catch(() => { setState("error"); setMsg(T.err); });
  }, [ready, bookingId, state, onPaid, T.err]);

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
      <p className="mb-1 font-dm text-sm text-offwhite">
        {T.pay}: <span className="font-syne font-bold text-yellow">{rs(totalMur)}</span>
      </p>
      <p className="mb-2 font-dm text-[11px] text-muted/80">
        {rs(depositMur)} + {rs(feeMur)} {T.fee}
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
