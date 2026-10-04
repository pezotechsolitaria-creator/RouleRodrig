"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { PAYPAL_FEE_PERCENT } from "@/lib/site";
import { formatMur } from "@/lib/reservations/policy";

// ── PayPal for a confirmed reservation ──────────────────────────────────────
//
// The existing PayPal integration, pointed at /api/reservations/[token]/paypal:
// OUR server prices the order (what is still due, plus PayPal's fee, in EUR)
// and OUR server captures and records it. This component never sends an
// amount. Renders nothing until NEXT_PUBLIC_PAYPAL_CLIENT_ID is set.

const CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

export const paypalAvailable = (): boolean => Boolean(CLIENT_ID);

/** Load the SDK once per page, and wait for it even when another component
 *  (PayPalDeposit) already started loading it. */
function loadSdk(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const id = "paypal-sdk";
    let s = document.getElementById(id) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = id;
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=EUR&intent=capture`;
      document.body.appendChild(s);
    }
    s.addEventListener("load", () => resolve(), { once: true });
    s.addEventListener("error", () => reject(new Error("paypal sdk")), { once: true });
  });
}

export default function ReservationPayPal({
  token,
  funding = "paypal",
  dueMur,
  payLabel,
  feeLabel,
  doneLabel,
  errorLabel,
  onPaid,
}: {
  token: string;
  /** "card": PayPal's own card form, no PayPal account; "paypal": the wallet. */
  funding?: "card" | "paypal";
  dueMur: number;
  payLabel: (amount: string) => string;
  feeLabel: (fee: string) => string;
  doneLabel: string;
  errorLabel: string;
  onPaid: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const paid = useRef(onPaid);
  paid.current = onPaid;
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<"idle" | "paid" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const fee = Math.round((dueMur * PAYPAL_FEE_PERCENT) / 100);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let on = true;
    loadSdk()
      .then(() => on && setReady(true))
      .catch(() => {
        if (!on) return;
        setState("error");
        setMsg(errorLabel);
      });
    return () => {
      on = false;
    };
  }, [errorLabel]);

  useEffect(() => {
    if (!ready || !window.paypal || !box.current || state === "paid") return;
    const el = box.current;
    el.innerHTML = "";
    const post = (body: object) =>
      fetch(`/api/reservations/${token}/paypal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const paypal = window.paypal as typeof window.paypal & { FUNDING?: { CARD: string; PAYPAL: string } };
    window.paypal
      .Buttons({
        // One button per method, so "Card" never opens a PayPal login and
        // "PayPal" never shows a card form. The card button expands PayPal's
        // own card fields in place.
        fundingSource: funding === "card" ? (paypal.FUNDING?.CARD ?? "card") : (paypal.FUNDING?.PAYPAL ?? "paypal"),
        style: funding === "card" ? { color: "black", shape: "pill", height: 44 } : { color: "gold", shape: "pill", label: "pay", height: 44 },
        createOrder: async () => {
          const res = await post({ step: "create" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok || !j.orderID) {
            setMsg(j.error || errorLabel);
            throw new Error(j.error || "create failed");
          }
          setMsg(null);
          return j.orderID as string;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await post({ step: "capture", orderID: data.orderID });
          const j = await res.json().catch(() => ({}));
          if (res.ok && j.ok) {
            setState("paid");
            paid.current();
          } else {
            setState("error");
            setMsg(j.error || errorLabel);
          }
        },
        onError: () => {
          setState("error");
          setMsg((m) => m ?? errorLabel);
        },
      })
      .render(el)
      .catch(() => {
        setState("error");
        setMsg(errorLabel);
      });
  }, [ready, token, state, errorLabel, funding]);

  if (!CLIENT_ID) return null;

  if (state === "paid") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-yellow/30 bg-yellow/[0.06] px-4 py-3 font-dm text-sm text-offwhite">
        <Loader2 size={16} className="shrink-0 animate-spin text-yellow" /> {doneLabel}
      </p>
    );
  }

  return (
    <div>
      <p className="font-dm text-sm text-offwhite">
        {payLabel(formatMur(dueMur + fee))}
        <span className="ml-1.5 text-[11px] text-muted">({feeLabel(formatMur(fee))})</span>
      </p>
      {!ready && state !== "error" && (
        <p className="mt-2 flex items-center gap-2 font-dm text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> PayPal…
        </p>
      )}
      <div ref={box} className="mt-3" />
      {msg && <p className="mt-2 font-dm text-xs text-red-400">{msg}</p>}
    </div>
  );
}
