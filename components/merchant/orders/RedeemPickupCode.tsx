"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Ticket, Loader2, CheckCircle2 } from "lucide-react";
import { orderKeys } from "@/lib/merchant/orders";
import { centsToDecimalString } from "@/lib/money";
import { normalizePickupCode, formatPickupCode, isCompletePickupCode } from "@/lib/orders/pickup";
import { Button } from "@/components/ui/button";

// The counter tool: a customer stands in front of you, you type their eight
// characters, the order closes. This is the whole reason qr_pickup_tokens
// exists, and it is placed at the TOP of the orders screen rather than inside
// an order because the merchant does not know which order it is yet — that is
// what the code tells them.
type Redeemed = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  total: number;
  itemCount: number;
  alreadyRedeemed: boolean;
};

export default function RedeemPickupCode() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Redeemed | null>(null);

  async function submit() {
    if (!isCompletePickupCode(code) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/pickup/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalizePickupCode(code) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "We couldn't check that code.");
      setDone(body as Redeemed);
      setCode("");
      // The list behind this box now has one fewer order to fulfil.
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't check that code.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-4">
        <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-green-400">
          <CheckCircle2 size={15} />
          {done.alreadyRedeemed ? "Already handed over" : "Handed over"}
        </p>
        <p className="mt-2 font-dm text-sm text-offwhite">
          <Link href={`/merchant/orders/${done.orderId}`} className="font-bold text-yellow hover:underline">
            {done.orderNumber}
          </Link>
          {done.customerName ? ` · ${done.customerName}` : ""} · {done.itemCount} item
          {done.itemCount === 1 ? "" : "s"} · Rs {centsToDecimalString(done.total)}
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          {done.alreadyRedeemed
            ? "This code was already used — the order is closed, nothing changed."
            : "The order is now marked Collected and the customer has been notified."}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setDone(null)}>
          Next customer
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-offwhite">
        <Ticket size={15} className="text-yellow" /> Customer collecting?
      </p>
      <p className="mt-1 font-dm text-xs text-muted">
        Type the 8-character code from their order screen. It closes the order for you.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="pickup-code" className="sr-only">
          Pickup code
        </label>
        <input
          id="pickup-code"
          value={formatPickupCode(code)}
          onChange={(e) => {
            setCode(normalizePickupCode(e.target.value));
            setError(null);
          }}
          placeholder="A7K2-9MTX"
          // Codes have no lower-case letters and no 0/O/1/I, so an uppercase
          // keyboard with autocorrect off is strictly less error-prone.
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          className="w-40 rounded-xl border border-dark-border bg-dark px-4 py-2.5 text-center font-syne text-lg font-bold uppercase tracking-[0.2em] text-offwhite placeholder:font-dm placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-muted/60 focus:border-yellow focus:outline-none"
        />
        <Button type="submit" disabled={busy || !isCompletePickupCode(code)}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Confirm pickup"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 font-dm text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
