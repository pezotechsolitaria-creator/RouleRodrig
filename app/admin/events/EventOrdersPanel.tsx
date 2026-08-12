"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X, Mail, Ticket, RefreshCw } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { paymentWords } from "@/lib/payments/words";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";

// ── The box office for one event ─────────────────────────────────────────────
//
// Everything the door needs before the door: who bought, whether the money
// arrived, whether their tickets were actually issued, and whether the email
// went out. Opening this panel is how the platform operator finishes a sale for
// an event with no organiser — which until M70 could not be done at all.

type Order = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  placedAt: string;
  receiptPath: string | null;
  payment: { provider?: string; status?: string } | null;
  items: { name: string; variant: string | null; quantity: number; lineTotal: number }[];
  ticketsIssued: number;
  ticketsScanned: number;
};

type Totals = { orders: number; paid: number; waiting: number; revenue: number };

export default function EventOrdersPanel({
  storeId,
  eventName,
}: {
  storeId: string;
  eventName: string;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/admin/events/orders?storeId=${encodeURIComponent(storeId)}`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "Could not load orders.");
      setOrders(b.orders ?? []);
      setTotals(b.totals ?? null);
    } catch (e) {
      setOrders(null);
      setError(e instanceof Error ? e.message : "Could not load orders.");
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  async function act(orderId: string, action: string, reason?: string) {
    setBusy(orderId + action);
    try {
      const r = await fetch("/api/admin/events/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action, ...(reason ? { reason } : {}) }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || "That didn't work.");
      if (action === "confirm") {
        toast.success(
          b.ticketsIssued
            ? `Paid. ${b.ticketsIssued} ticket${b.ticketsIssued === 1 ? "" : "s"} issued and emailed.`
            : "Payment confirmed.",
        );
      } else if (action === "resend_tickets") {
        toast.success(`Tickets emailed again (${b.resent}).`);
      } else {
        toast.success("Payment rejected — the buyer can try again.");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 font-dm text-xs text-red-200">
        {error}
      </p>
    );
  }
  if (!orders) {
    return (
      <p className="flex items-center gap-2 font-dm text-xs text-muted">
        <Loader2 size={13} className="animate-spin" /> Loading orders…
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bebas text-[11px] tracking-[0.25em] text-yellow">
          TICKET SALES — {eventName.toUpperCase()}
        </p>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 font-dm text-xs text-muted hover:text-offwhite"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {totals && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-dm text-xs text-muted">
          <span><strong className="text-offwhite">{totals.orders}</strong> orders</span>
          <span><strong className="text-green-400">{totals.paid}</strong> paid</span>
          <span><strong className="text-yellow">{totals.waiting}</strong> waiting on you</span>
          <span>Rs <strong className="text-offwhite">{centsToDecimalString(totals.revenue)}</strong> taken</span>
        </div>
      )}

      {orders.length === 0 ? (
        <p className="mt-4 font-dm text-xs text-muted">
          Nobody has bought yet. Orders appear here the moment someone reserves.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {orders.map((o) => {
            const pay = paymentWords(o.payment?.status, o.payment?.provider);
            const waiting =
              o.status === "awaiting_payment_confirmation" || o.status === "pending_payment";
            return (
              <li key={o.id} className="rounded-xl border border-white/10 bg-dark-card p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-dm text-sm font-medium text-offwhite">
                    {o.orderNumber} · {o.customerName ?? "guest"}
                  </span>
                  <span className="font-dm text-sm text-yellow">Rs {centsToDecimalString(o.total)}</span>
                </div>

                <p className="mt-1 font-dm text-[11px] text-muted">
                  {o.items.map((i) => `${i.quantity}× ${i.variant ?? i.name}`).join(", ")}
                  {o.customerEmail ? ` · ${o.customerEmail}` : ""}
                  {o.customerPhone ? ` · ${o.customerPhone}` : ""}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-[11px]">
                  <span className={waiting ? "text-yellow" : "text-muted"}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                  <span
                    className={
                      pay.tone === "good" ? "text-green-400" : pay.tone === "bad" ? "text-red-300" : "text-muted"
                    }
                  >
                    {pay.label}
                  </span>
                  {/* The honest answer to "did it work?" — a paid order with no
                      tickets means the trigger did not fire, which is worth
                      seeing rather than assuming. */}
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Ticket size={11} />
                    {o.ticketsIssued} issued
                    {o.ticketsIssued > 0 && ` · ${o.ticketsScanned} scanned`}
                  </span>
                  {o.receiptPath && (
                    <span className="text-muted">receipt attached</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {waiting && (
                    <>
                      <button
                        disabled={!!busy}
                        onClick={() => void act(o.id, "confirm")}
                        className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-3 py-1.5 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50"
                      >
                        {busy === o.id + "confirm" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Money received — issue tickets
                      </button>
                      {o.status === "awaiting_payment_confirmation" && (
                        <button
                          disabled={!!busy}
                          onClick={() => {
                            const why = prompt(
                              "Why was the payment not confirmed? The buyer sees this and can try again.",
                              "",
                            );
                            if (why === null) return;
                            void act(o.id, "reject", why || undefined);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
                        >
                          <X size={12} /> Not received
                        </button>
                      )}
                    </>
                  )}
                  {o.ticketsIssued > 0 && (
                    <button
                      disabled={!!busy}
                      onClick={() => void act(o.id, "resend_tickets")}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-yellow/50 hover:text-yellow disabled:opacity-50"
                    >
                      {busy === o.id + "resend_tickets"
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Mail size={12} />}
                      Email the tickets again
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
