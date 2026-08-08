"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, AlertTriangle, User, Phone, Ticket } from "lucide-react";
import { orderKeys } from "@/lib/merchant/orders";
import { centsToDecimalString } from "@/lib/money";
import { normalizePickupCode, formatPickupCode, isCompletePickupCode } from "@/lib/orders/pickup";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { Button } from "@/components/ui/button";

// The screen a scanned pickup QR lands on.
//
// PREVIEW, THEN CONFIRM — never redeem on load. A QR is one flick of a camera
// and `collected` has no way back, so auto-redeeming would let a merchant close
// an order by pointing their phone at the wrong screen, with no undo. The
// preview also answers the question they actually have while somebody is
// standing at the counter: is this the right customer, and is this the right
// bag?
//
// The code is read from location.hash, which the browser never sends to the
// server — see pickupScanUrl(). It is stripped from the address bar once read
// so it does not sit in history or get shared with a screenshot of the tab.
type Preview = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  status: OrderStatus;
  items: { name: string; variant: string | null; qty: number }[];
  alreadyRedeemed: boolean;
  redeemedAt: string | null;
  redeemable: boolean;
  reason: string | null;
};

export default function ScanHandoff() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderNumber: string; alreadyRedeemed: boolean } | null>(null);

  const load = useCallback(async (raw: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/pickup/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: raw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't check that code.");
      setPreview(body as Preview);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "We couldn't check that code.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fromHash = normalizePickupCode(window.location.hash.replace(/^#/, ""));
    if (!isCompletePickupCode(fromHash)) {
      setLoading(false);
      return;
    }
    setCode(fromHash);
    // Keep the single-use code out of browser history and out of anything the
    // merchant might later share from this tab.
    window.history.replaceState(null, "", window.location.pathname);
    void load(fromHash);
  }, [load]);

  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/pickup/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't confirm that handover.");
      setDone({ orderNumber: body.orderNumber, alreadyRedeemed: Boolean(body.alreadyRedeemed) });
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't confirm that handover.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-5">
        <p className="flex items-center gap-1.5 font-syne text-base font-bold text-green-400">
          <CheckCircle2 size={17} /> {done.alreadyRedeemed ? "Already handed over" : "Handed over"}
        </p>
        <p className="mt-2 font-dm text-sm text-offwhite">
          Order <span className="font-bold">{done.orderNumber}</span> is marked Collected
          {done.alreadyRedeemed ? " — it was already closed, nothing changed." : " and the customer has been told."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/merchant/orders">
            <Button variant="outline" size="sm">Back to orders</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-dark-card p-5 font-dm text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Checking the code…
      </div>
    );
  }

  // Landed here without a code — someone opened /merchant/pickup directly, or
  // the camera app dropped the fragment. Say so and point at the typed box
  // rather than showing an empty screen.
  if (!preview && !error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
        <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
          <Ticket size={15} className="text-yellow" /> Nothing to confirm
        </p>
        <p className="mt-2 font-dm text-sm text-muted">
          This page opens when you scan a customer&apos;s pickup QR. If you have the code written down,
          type it into the box at the top of your orders list instead.
        </p>
        <Link href="/merchant/orders" className="mt-3 inline-block">
          <Button variant="outline" size="sm">Go to orders</Button>
        </Link>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-5">
        <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-red-400">
          <AlertTriangle size={15} /> {error}
        </p>
        <Link href="/merchant/orders" className="mt-3 inline-block">
          <Button variant="outline" size="sm">Go to orders</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{preview.orderNumber}</p>
        <span className="rounded-full bg-white/10 px-3 py-1 font-dm text-[11px] font-medium text-offwhite">
          {STATUS_LABEL[preview.status] ?? preview.status}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 font-dm text-sm">
        <p className="flex items-center gap-2 text-offwhite">
          <User size={14} className="text-muted" /> {preview.customerName ?? "—"}
        </p>
        {preview.customerPhone && (
          <p className="flex items-center gap-2 text-offwhite">
            <Phone size={14} className="text-muted" /> {preview.customerPhone}
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-4 font-dm text-sm text-muted">
        {preview.items.map((it, i) => (
          <li key={`${it.name}-${i}`}>
            {it.qty}× {it.name}
            {it.variant ? <span className="text-muted/70"> ({it.variant})</span> : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t border-white/[0.08] pt-3 font-dm text-sm">
        <span className="text-muted">Total</span>
        <span className="font-syne font-bold text-yellow">Rs {centsToDecimalString(preview.total)}</span>
      </div>

      <p className="mt-4 text-center font-syne text-lg font-bold tracking-[0.2em] text-muted">
        {formatPickupCode(code)}
      </p>

      {preview.redeemable ? (
        <Button type="button" className="mt-4 w-full" disabled={busy} onClick={() => void confirm()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Confirm pickup"}
        </Button>
      ) : (
        <div className="mt-4 rounded-xl border border-yellow/25 bg-yellow/[0.06] p-3">
          <p className="font-dm text-sm text-offwhite/85">{preview.reason}</p>
          <Link href={`/merchant/orders/${preview.orderId}`} className="mt-2 inline-block">
            <Button variant="outline" size="sm">Open the order</Button>
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 font-dm text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
