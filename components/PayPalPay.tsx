"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, Loader2, ShieldCheck } from "lucide-react";
import { PAYPAL_FEE_PERCENT } from "@/lib/site";

// Generic "pay the full amount now" PayPal button — same create-order /
// capture-order integration as PayPalDeposit.tsx, minus the deposit/full
// toggle (a marketplace order has one amount, not a partial-then-full
// choice), and without booking-specific copy. Used by checkout.
declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: unknown) => { render: (sel: string | HTMLElement) => Promise<void> };
    };
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

export default function PayPalPay({
  referenceId,
  amountMur,
  kind,
  onPaid,
  onError,
}: {
  referenceId: string;
  amountMur: number;
  kind: "order";
  onPaid?: () => void;
  onError?: (message: string) => void;
}) {
  const feeMur = Math.round((amountMur * PAYPAL_FEE_PERCENT) / 100);
  const totalMur = amountMur + feeMur;
  const rs = (n: number) => `Rs ${n.toLocaleString()}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "paid" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    if (window.paypal) { setReady(true); return; }
    const id = "paypal-sdk";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=EUR&intent=capture`;
    s.onload = () => setReady(true);
    s.onerror = () => { setState("error"); setMsg("Could not load PayPal. Please try again."); };
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !window.paypal || !containerRef.current || state === "paid") return;
    containerRef.current.innerHTML = "";
    window.paypal
      .Buttons({
        style: { color: "gold", shape: "pill", label: "pay", height: 44 },
        createOrder: async () => {
          const res = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId: referenceId, kind }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || "create failed");
          return j.orderID as string;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderID: data.orderID, bookingId: referenceId, kind }),
          });
          const j = await res.json();
          if (res.ok && j.ok) { setState("paid"); onPaid?.(); }
          else {
            const message = j.error || "Payment could not be completed. Please try again.";
            setState("error"); setMsg(message); onError?.(message);
          }
        },
        onError: () => {
          const message = "Payment could not be completed. Please try again.";
          setState("error"); setMsg(message); onError?.(message);
        },
      })
      .render(containerRef.current)
      .catch(() => { setState("error"); setMsg("Could not load PayPal. Please try again."); });
  }, [ready, referenceId, kind, state, onPaid, onError]);

  if (!CLIENT_ID) {
    return <p className="font-dm text-xs text-muted">Card payment isn&apos;t available yet — choose cash instead.</p>;
  }

  if (state === "paid") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3">
        <CheckCircle size={18} className="shrink-0 text-green-400" />
        <span className="font-dm text-sm text-green-400">Payment received — your order is confirmed!</span>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 font-dm text-sm text-offwhite">
        Pay now: <span className="font-syne font-bold text-yellow">{rs(totalMur)}</span>
      </p>
      <p className="mb-2 font-dm text-[11px] text-muted/80">
        {rs(amountMur)} + {rs(feeMur)} incl. {PAYPAL_FEE_PERCENT}% PayPal fee
      </p>
      {!ready && (
        <div className="flex items-center gap-2 font-dm text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> …
        </div>
      )}
      <div ref={containerRef} />
      {state === "error" && msg && <p className="mt-2 font-dm text-xs text-red-400">{msg}</p>}
      <p className="mt-2 flex items-center gap-1.5 font-dm text-[11px] text-muted/70">
        <ShieldCheck size={12} className="text-yellow/60" /> Secure payment via PayPal
      </p>
    </div>
  );
}
