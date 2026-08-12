"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChefHat, Check, Clock } from "lucide-react";

// ── The cook's screen ──────────────────────────────────────────────────────
//
// Designed for someone with flour on their hands, standing up, glancing at a
// propped-up phone between tasks. The governing rule is the same one the driver
// dashboard follows: EVERY ORDER HAS EXACTLY ONE OBVIOUS NEXT ACTION, and it is
// a full-width button at the bottom of the card.
//
// What is deliberately absent: prices, totals, the customer's email or phone,
// payment method, the menu. A cook needs to know what to cook and who is
// collecting. Everything else is the owner's business, and the safest way to
// keep it that way is that the server never sends it (M72).

type Item = { name: string; variant: string | null; qty: number };
type Order = {
  id: string;
  orderNumber: string;
  kitchen: string;
  status: string;
  customer: string;
  fulfillment: string | null;
  placedAt: string;
  items: Item[];
  note: string | null;
  /** Cash, not yet paid. The customer settles at the counter on collection. */
  payOnCollection?: boolean;
};
type Dash = { onTeam: boolean; kitchens?: { id: string; name: string }[]; orders?: Order[] };

// One next step per state — as data, so there can never be two.
const NEXT: Record<string, { to: string; label: string }> = {
  // Cash orders arrive unpaid and go straight to the kitchen (M74): the
  // customer pays at the counter, so the food has to exist first.
  pending_payment: { to: "preparing", label: "Start cooking" },
  paid: { to: "preparing", label: "Start cooking" },
  preparing: { to: "ready_for_pickup", label: "Food is ready" },
  ready_for_pickup: { to: "collected", label: "Handed to customer" },
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "New order",
  paid: "New order",
  preparing: "Cooking",
  ready_for_pickup: "Ready — waiting for collection",
};

function waitingFor(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function KitchenBoard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load.");
      setDash(body as Dash);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    // A kitchen screen is left open all service. 15s keeps a new order visible
    // quickly without hammering a phone's battery.
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function advance(order: Order) {
    if (busy) return;
    const next = NEXT[order.status];
    if (!next) return;
    setBusy(order.id);
    setError(null);
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, to: next.to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (!dash) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="animate-spin text-yellow" size={28} />
      </div>
    );
  }

  if (!dash.onTeam) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
        <ChefHat size={30} className="mx-auto text-yellow" />
        <h2 className="mt-3 font-syne text-xl font-bold">Not on a kitchen team yet</h2>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          Ask Roulé Rodrigues to add this email address to your kitchen. Once they do, your orders
          appear here automatically — nothing else to set up.
        </p>
      </div>
    );
  }

  const orders = dash.orders ?? [];

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <Check size={26} className="mx-auto text-green-400" />
          <p className="mt-2 font-syne text-base font-bold">All caught up</p>
          <p className="mt-1 font-dm text-sm text-muted">New orders appear here on their own.</p>
        </div>
      ) : (
        orders.map((o) => {
          const next = NEXT[o.status];
          const ready = o.status === "ready_for_pickup";
          return (
            <div
              key={o.id}
              className={`rounded-2xl border p-4 ${
                ready ? "border-green-500/40 bg-green-500/[0.06]" : "border-yellow/30 bg-yellow/[0.05]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{o.orderNumber}</p>
                  <p className="font-syne text-base font-bold">{o.customer || "Customer"}</p>
                  {(dash.kitchens?.length ?? 0) > 1 && (
                    <p className="font-dm text-xs text-muted">{o.kitchen}</p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-1 font-dm text-xs text-muted">
                  <Clock size={12} /> {waitingFor(o.placedAt)}
                </span>
              </div>

              {/* The order itself, big enough to read from arm's length. */}
              <ul className="mt-3 space-y-1">
                {o.items.map((it, i) => (
                  <li key={i} className="flex gap-2 font-dm text-base text-offwhite">
                    <span className="font-syne font-bold text-yellow">{it.qty}×</span>
                    <span>
                      {it.name}
                      {it.variant && <span className="text-muted"> · {it.variant}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              {o.note && (
                // A customer note is the thing most likely to be missed and most
                // expensive to get wrong, so it is boxed rather than inline.
                <p className="mt-3 rounded-xl border border-orange-400/30 bg-orange-400/5 px-3 py-2 font-dm text-sm text-orange-200">
                  {o.note}
                </p>
              )}

              <p className="mt-3 font-dm text-xs text-muted">{STATUS_LABEL[o.status] ?? o.status}</p>

              {/* The cook must know money is still owed BEFORE handing the bag
                  over — after it leaves the counter it is gone. No amount
                  shown: whether it was collected is the cook's business, how
                  much is owed is the owner's. */}
              {o.payOnCollection && ready && (
                <p className="mt-2 rounded-xl border border-yellow/40 bg-yellow/10 px-3 py-2 font-syne text-sm font-bold text-yellow">
                  Take payment when you hand this over
                </p>
              )}

              {next && (
                <button
                  onClick={() => void advance(o)}
                  disabled={busy !== null}
                  className={`mt-3 min-h-[56px] w-full rounded-2xl font-syne text-base font-bold disabled:opacity-50 ${
                    ready ? "bg-green-500 text-dark" : "bg-yellow text-dark"
                  }`}
                >
                  {busy === o.id ? <Loader2 size={18} className="mx-auto animate-spin" /> : next.label}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
