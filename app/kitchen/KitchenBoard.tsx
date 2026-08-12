"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChefHat, Check, Clock, UtensilsCrossed, ClipboardList } from "lucide-react";
import MenuPanel from "./MenuPanel";

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
  /** Bank transfer with a receipt uploaded, waiting on the kitchen's judgement. */
  awaitingPayment?: boolean;
  /** Bank transfer with nothing proven yet — do NOT cook this. */
  waitingOnTransfer?: boolean;
  hasReceipt?: boolean;
  /** Collected, cancelled or refunded. Kept on screen as today's record. */
  finished?: boolean;
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
  collected: "Handed over",
  cancelled: "Cancelled",
  refunded: "Refunded",
  awaiting_payment_confirmation: "Check the payment proof",
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
  // Two jobs, two tabs. Orders first and by default: during service that is
  // the only screen that matters, and the menu is set once at the start of the
  // day. A cook should never have to find their orders behind a menu editor.
  const [tab, setTab] = useState<"orders" | "menu">("orders");
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

  // Judge the transfer. The restaurant decides, not the platform owner —
  // otherwise every sale queues behind one person opening /admin.
  async function judgePayment(order: Order, decision: "confirm" | "reject") {
    if (busy) return;
    let reason: string | undefined;
    if (decision === "reject") {
      const answer = window.prompt(
        `Why can't this payment be accepted?

The customer can send a new photo — their order is NOT cancelled.`,
        "The proof of payment could not be read",
      );
      if (answer === null) return;
      reason = answer;
    }
    setBusy(order.id);
    setError(null);
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, payment: decision, reason }),
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

  // The receipt lives in a private bucket, so it is opened through a signed URL
  // minted for this cook, valid two minutes.
  async function openReceipt(order: Order) {
    try {
      const res = await fetch("/api/kitchen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Could not open that receipt.");
      window.open(body.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that receipt.");
    }
  }

  // Cancelling. Quiet and secondary by design: it is the rarest action on this
  // screen and the only one that disappoints somebody.
  async function cancelOrder(order: Order) {
    if (busy) return;
    const reason = window.prompt(
      `Cancel ${order.orderNumber}?

Tell the customer why — they will see this.`,
      "We have run out of this dish",
    );
    if (reason === null) return;
    setBusy(order.id);
    setError(null);
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, cancel: true, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      // Said plainly rather than hidden: the kitchen must not assume the
      // platform quietly handled money it never held.
      if (body.wasPaid) {
        setError("Cancelled. This customer had already paid — Roulé Rodrigues must return their money.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

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

  const tabCls = (active: boolean) =>
    `flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl font-syne text-sm font-bold transition-colors ${
      active ? "bg-yellow text-dark" : "border border-white/15 text-offwhite"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab("orders")} className={tabCls(tab === "orders")}>
          <ClipboardList size={15} /> Orders{orders.length > 0 ? ` (${orders.length})` : ""}
        </button>
        <button onClick={() => setTab("menu")} className={tabCls(tab === "menu")}>
          <UtensilsCrossed size={15} /> Today&apos;s menu
        </button>
      </div>

      {tab === "menu" ? (
        <MenuPanel />
      ) : (
      <>
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      {(() => {
        const live = orders.filter((o) => !o.finished);
        const done = orders.filter((o) => o.finished);
        return (
          <>
            {done.length > 0 && (
              // Today's record, stated plainly. Orders used to vanish the moment
              // they finished, so a cancelled order or a disputed receipt had
              // nowhere to be looked up an hour later.
              <p className="font-dm text-xs text-muted">
                {live.length} open · {done.length} finished today (below)
              </p>
            )}
          </>
        );
      })()}

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
          <Check size={26} className="mx-auto text-green-400" />
          <p className="mt-2 font-syne text-base font-bold">
            {/* Say WHICH kitchen is quiet. An unlabelled empty screen reads as a
                broken page; a named one reads as a quiet evening. */}
            {(dash.kitchens ?? []).length > 0
              ? `No orders for ${(dash.kitchens ?? []).map((k) => k.name).join(" or ")}`
              : "All caught up"}
          </p>
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
                o.finished
                  ? "border-white/10 bg-dark-card opacity-60"
                  : ready
                    ? "border-green-500/40 bg-green-500/[0.06]"
                    : "border-yellow/30 bg-yellow/[0.05]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bebas text-[10px] tracking-[0.25em] text-yellow">{o.orderNumber}</p>
                  <p className="font-syne text-base font-bold">{o.customer || "Customer"}</p>
                  {/* ALWAYS shown, not only when someone works in two kitchens.
                      The owner was on Riri Resto's team while every order sat in
                      Ti Kitchen, saw an empty screen, and had no way to tell
                      WHICH kitchen was empty. Naming it costs one line and turns
                      "it is broken" into "I am looking at the wrong shop". */}
                  <p className="font-dm text-xs text-muted">{o.kitchen}</p>
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

              {/* The proof, on every order that has one and at any stage. It
                  used to appear only while a decision was pending, so the
                  moment it was accepted it became unreachable — and rejecting
                  actively deleted it. Neither survives a dispute an hour later,
                  which is exactly when somebody asks. */}
              {o.hasReceipt && !o.awaitingPayment && (
                <button
                  onClick={() => void openReceipt(o)}
                  className="mt-3 w-full rounded-xl border border-white/20 py-2.5 font-dm text-sm text-offwhite"
                >
                  View proof of payment
                </button>
              )}

              {/* WAITING ON A TRANSFER. The cook looks at the photo and decides.
                  Accept sits last and primary, Reject first and quiet — the
                  destructive one should never be where a thumb lands by
                  accident. Rejecting does NOT cancel: the customer can send a
                  better photo. */}
              {o.awaitingPayment && (
                <div className="mt-3 rounded-xl border border-yellow/30 bg-yellow/[0.07] p-3">
                  <p className="font-dm text-sm text-yellow">
                    The customer says they have paid by bank transfer.
                  </p>
                  {o.hasReceipt ? (
                    <button
                      onClick={() => void openReceipt(o)}
                      className="mt-2 min-h-[44px] w-full rounded-xl border border-white/20 font-dm text-sm text-offwhite"
                    >
                      View their proof of payment
                    </button>
                  ) : (
                    <p className="mt-1 font-dm text-xs text-muted">No photo was uploaded.</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => void judgePayment(o, "reject")}
                      disabled={busy !== null}
                      className="min-h-[48px] flex-1 rounded-xl border border-white/20 font-syne text-sm font-bold disabled:opacity-50"
                    >
                      Not received
                    </button>
                    <button
                      onClick={() => void judgePayment(o, "confirm")}
                      disabled={busy !== null}
                      className="min-h-[48px] flex-[2] rounded-xl bg-yellow font-syne text-sm font-bold text-dark disabled:opacity-50"
                    >
                      {busy === o.id ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Payment received"}
                    </button>
                  </div>
                </div>
              )}

              {/* Last, small and quiet. A cook cancels rarely, and never by
                  accident on a screen used with one thumb. */}
              {!o.awaitingPayment && !o.finished && (
                <button
                  onClick={() => void cancelOrder(o)}
                  disabled={busy !== null}
                  className="mt-3 w-full font-dm text-xs text-muted underline underline-offset-2 disabled:opacity-50"
                >
                  Cancel this order
                </button>
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
      </>
      )}
    </div>
  );
}