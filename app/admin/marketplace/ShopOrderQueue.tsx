"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Bike, ShoppingBag, Phone, MapPin, Clock,
  CheckCircle2, XCircle, ScanLine, StickyNote, PackageCheck,
} from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import { STATUS_LABEL, legalNextStatuses, type OrderStatus } from "@/lib/orders/status";
import { shopWrite, type AdminShopOrder } from "./types";

// The live marketplace order queue, for the platform owner.
//
// A deliberate near-twin of app/admin/food/OrderQueue.tsx. The owner asked for
// "the same dashboard for marketplace with the same feature like for resto",
// and the strongest reading of that is not "something similar" — it is the same
// screen with the same controls in the same places, so switching desks costs no
// thought. Where the two differ, it is because the underlying thing differs:
// a shop has no kitchen, so there is no "Cooking" column doing the work of
// "Packing".
//
// It refuses to invent progress: the buttons offered come from
// legalNextStatuses(), the same state machine the RPC enforces, so the screen
// never offers a transition the database is about to reject.

const COLUMNS: { status: OrderStatus; label: string; icon: React.ElementType; hint: string }[] = [
  { status: "pending_payment", label: "New", icon: Clock, hint: "Waiting to be confirmed" },
  { status: "paid", label: "Confirmed", icon: CheckCircle2, hint: "Tell the shop" },
  { status: "preparing", label: "Packing", icon: PackageCheck, hint: "Being put together" },
  { status: "ready_for_pickup", label: "Ready", icon: ShoppingBag, hint: "Waiting for the customer" },
];

const ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  paid: "Confirm payment",
  preparing: "Send to the shop",
  ready_for_pickup: "Mark ready",
  collected: "Handed over",
  cancelled: "Cancel",
};

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

/** How long this order has been waiting, in words. The operator's real clock. */
function waited(iso: string): string {
  const m = minutesAgo(iso);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export default function ShopOrderQueue({ shops }: { shops: { id: string; name: string }[] }) {
  const [orders, setOrders] = useState<AdminShopOrder[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [storeId, setStoreId] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ scope });
    if (storeId) params.set("storeId", storeId);
    try {
      const res = await fetch(`/api/admin/marketplace-ops/orders?${params}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load orders.");
      setOrders(body.orders);
      setCounts(body.counts ?? {});
      setError(null);
    } catch (e) {
      setOrders(null);
      setError(e instanceof Error ? e.message : "Failed to load orders.");
    }
  }, [scope, storeId]);

  // Not `void load()` in the effect body: that sets state synchronously from
  // React's point of view, and it also lets a slow first response land after
  // the panel has gone. The cancel flag is the canonical fix for both.
  useEffect(() => {
    let cancelled = false;
    void (async () => { if (!cancelled) await load(); })();
    return () => { cancelled = true; };
  }, [load]);

  // Trading is live. A queue that only updates when someone remembers to press
  // refresh is a queue that shows a paid order as "New" for twenty minutes.
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const move = useCallback(
    async (order: AdminShopOrder, status: OrderStatus) => {
      if (status === "cancelled" && !confirm(
        `Cancel order ${order.orderNumber}? The stock goes back on sale and the customer is emailed.`,
      )) return;

      setBusy(order.id);
      const result = await shopWrite("/api/admin/marketplace-ops/orders", {
        method: "PATCH",
        body: JSON.stringify({ orderId: order.id, status }),
      });
      setBusy(null);

      if (!result.ok) {
        toast.error(result.error);
        // Reload rather than leave the row showing a state the write never
        // reached — the likeliest cause is that somebody already moved it.
        void load();
        return;
      }
      toast.success(`${order.orderNumber} → ${STATUS_LABEL[status]}`);
      void load();
    },
    [load],
  );

  const saveNote = useCallback(async () => {
    if (!noteFor || !note.trim()) return;
    setBusy(noteFor);
    const result = await shopWrite("/api/admin/marketplace-ops/orders", {
      method: "PATCH",
      body: JSON.stringify({ orderId: noteFor, internalNote: note.trim() }),
    });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Note saved.");
    setNoteFor(null);
    setNote("");
  }, [noteFor, note]);

  const grouped = useMemo(() => {
    const map = new Map<string, AdminShopOrder[]>();
    for (const o of orders ?? []) {
      map.set(o.status, [...(map.get(o.status) ?? []), o]);
    }
    return map;
  }, [orders]);

  return (
    <div>
      {/* Counters. Read at a glance, from across a room. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLUMNS.map((c) => {
          const n =
            c.status === "pending_payment"
              ? (counts.pending_payment ?? 0) + (counts.awaiting_payment_confirmation ?? 0)
              : (counts[c.status] ?? 0);
          const Icon = c.icon;
          return (
            <div
              key={c.status}
              className={`rounded-2xl border px-4 py-3 ${
                n > 0 ? "border-yellow/40 bg-yellow/10" : "border-white/10 bg-dark-card"
              }`}
            >
              <p className="flex items-center gap-1.5 font-bebas text-[11px] tracking-[0.2em] text-muted">
                <Icon size={13} /> {c.label.toUpperCase()}
              </p>
              <p className={`mt-0.5 font-syne text-2xl font-extrabold ${n > 0 ? "text-yellow" : "text-offwhite/40"}`}>
                {n}
              </p>
              <p className="font-dm text-[11px] text-muted">{c.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* Named tabs, never a toggle that states only what you ARE seeing. */}
        {(
          [
            { key: "open", label: "Needs action" },
            { key: "all", label: "All orders · incl. cancelled" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setScope(t.key)}
            aria-pressed={scope === t.key}
            className={`rounded-full px-3 py-1.5 font-dm text-xs transition ${
              scope === t.key
                ? "bg-yellow font-bold text-dark"
                : "border border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite"
            }`}
          >
            {t.label}
          </button>
        ))}
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded-full border border-white/10 bg-dark-card px-3 py-1.5 font-dm text-xs text-offwhite"
        >
          <option value="">All shops</option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-dark-card px-3 py-1.5 font-dm text-xs text-muted hover:text-yellow"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-dm text-sm text-red-200">
          {error}
        </div>
      )}

      {orders === null && !error && (
        <div className="mt-8 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={15} className="animate-spin" /> Loading the queue…
        </div>
      )}

      {orders !== null && orders.length === 0 && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
          <p className="font-syne text-lg font-bold text-offwhite">Nothing waiting</p>
          <p className="mt-1.5 font-dm text-sm text-muted">
            {scope === "open"
              ? "Every order is finished. New ones appear here within 30 seconds."
              : "No shop orders yet."}
          </p>
        </div>
      )}

      {/* Grouped by status, most urgent first — not a flat list sorted by time,
          because "what needs me next" is a question about state, not time. */}
      <div className="mt-5 space-y-6">
        {COLUMNS.map((col) => {
          const list = [
            ...(grouped.get(col.status) ?? []),
            ...(col.status === "pending_payment" ? grouped.get("awaiting_payment_confirmation") ?? [] : []),
          ];
          if (list.length === 0) return null;
          return (
            <section key={col.status}>
              <h3 className="font-bebas text-[12px] tracking-[0.25em] text-yellow">
                {col.label.toUpperCase()} · {list.length}
              </h3>
              <div className="mt-2 space-y-3">
                {list.map((o) => (
                  <ShopOrderCard
                    key={o.id}
                    order={o}
                    busy={busy === o.id}
                    onMove={move}
                    onNote={(id) => { setNoteFor(id); setNote(""); }}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {scope === "all" && (grouped.get("collected")?.length || grouped.get("cancelled")?.length) ? (
          <section>
            <h3 className="font-bebas text-[12px] tracking-[0.25em] text-muted">FINISHED</h3>
            <div className="mt-2 space-y-3 opacity-60">
              {[...(grouped.get("collected") ?? []), ...(grouped.get("cancelled") ?? [])].map((o) => (
                <ShopOrderCard key={o.id} order={o} busy={false} onMove={move} onNote={() => {}} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {noteFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-dark-card p-5">
            <p className="font-syne text-lg font-bold text-offwhite">Internal note</p>
            <p className="mt-1 font-dm text-xs text-muted">
              Only the platform team sees this. The customer never does.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Called the shop — the blue one is out of stock."
              className="mt-3 w-full rounded-xl border border-white/10 bg-dark px-3 py-2 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setNoteFor(null); setNote(""); }}
                className="flex-1 rounded-xl border border-white/15 px-4 py-2.5 font-dm text-sm text-muted hover:text-offwhite"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveNote()}
                disabled={!note.trim() || busy === noteFor}
                className="flex-1 rounded-xl bg-yellow px-4 py-2.5 font-dm text-sm font-bold text-dark disabled:opacity-50"
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShopOrderCard({
  order, busy, onMove, onNote,
}: {
  order: AdminShopOrder;
  busy: boolean;
  onMove: (o: AdminShopOrder, s: OrderStatus) => void;
  onNote: (id: string) => void;
}) {
  const next = legalNextStatuses(order.status as OrderStatus);
  const isDelivery = order.fulfillment === "rr_delivery" || order.fulfillment === "customer_delivery";
  // Twenty minutes in one state is the point at which somebody should be
  // looking at it, whatever the state is.
  const stale = minutesAgo(order.placedAt) > 20 && !["collected", "cancelled"].includes(order.status);

  return (
    <article
      className={`rounded-2xl border bg-dark-card p-4 ${
        stale ? "border-orange-400/40" : "border-white/10"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-syne text-base font-extrabold text-offwhite">
            {order.orderNumber}
            <span className="ml-2 font-dm text-xs font-normal text-muted">{order.storeName}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-dm text-xs text-muted">
            <span className={stale ? "font-semibold text-orange-300" : ""}>{waited(order.placedAt)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              {isDelivery ? <Bike size={12} /> : <ShoppingBag size={12} />}
              {order.fulfillment === "rr_delivery"
                ? `Delivery${order.deliveryZone ? ` · ${order.deliveryZone}` : ""}`
                : order.fulfillment === "customer_delivery"
                  ? "Own driver"
                  : "Pickup"}
            </span>
            {order.payment?.provider && (
              <>
                <span aria-hidden>·</span>
                <span>
                  {order.payment.provider === "bank_transfer" ? "Bank transfer" : "Cash"}
                  {order.payment.status === "captured" ? " ✓" : ""}
                </span>
              </>
            )}
          </p>
        </div>
        <p className="font-syne text-lg font-extrabold text-yellow">
          Rs {centsToDecimalString(order.total)}
        </p>
      </header>

      <ul className="mt-3 space-y-1 border-y border-white/5 py-2.5">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 font-dm text-sm text-offwhite">
            <span>
              <span className="font-bold text-yellow">{i.quantity}×</span> {i.name}
              {i.variantName && <span className="text-muted"> · {i.variantName}</span>}
            </span>
            <span className="shrink-0 text-muted">Rs {centsToDecimalString(i.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded-xl bg-yellow/10 px-3 py-2 font-dm text-xs text-yellow">
          “{order.notes}”
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-dm text-xs text-muted">
        {order.customerName && <span>{order.customerName}</span>}
        {order.customerPhone && (
          // A tel: link, because the next thing that happens after "we are out
          // of that" is a phone call, and retyping a number is how the call
          // does not get made.
          <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 text-yellow hover:underline">
            <Phone size={12} /> {order.customerPhone}
          </a>
        )}
        {order.deliveryLat != null && order.deliveryLng != null && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryLat},${order.deliveryLng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-yellow hover:underline"
          >
            <MapPin size={12} /> Open the pin
          </a>
        )}
      </div>
      {order.deliveryInstructions && (
        <p className="mt-1.5 font-dm text-xs text-muted">Directions: {order.deliveryInstructions}</p>
      )}

      {next.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {next
            // Cancel is offered last and styled differently — it is the only
            // action on this card that cannot be undone.
            .sort((a, b) => (a === "cancelled" ? 1 : b === "cancelled" ? -1 : 0))
            .map((s) => (
              <button
                key={s}
                onClick={() => onMove(order, s)}
                disabled={busy}
                className={
                  s === "cancelled"
                    ? "inline-flex items-center gap-1.5 rounded-xl border border-red-500/40 px-3 py-2 font-dm text-xs font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    : "inline-flex items-center gap-1.5 rounded-xl bg-yellow px-4 py-2 font-dm text-xs font-bold text-dark hover:opacity-90 disabled:opacity-50"
                }
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                {s === "cancelled" ? <XCircle size={13} /> : null}
                {ACTION_LABEL[s] ?? STATUS_LABEL[s]}
              </button>
            ))}
          <button
            onClick={() => onNote(order.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 font-dm text-xs text-muted hover:text-offwhite"
          >
            <StickyNote size={13} /> Note
          </button>
        </div>
      )}

      {/* A split payment the owner has not been handed yet. The shop collects
          it, but the platform still needs to know it is outstanding. */}
      {(order.balanceDue ?? 0) > 0 && (
        <p className="mt-2 rounded-lg border border-red-400/40 bg-red-500/[0.08] px-3 py-2 font-dm text-xs text-red-300">
          Rs {((order.balanceDue ?? 0) / 100).toFixed(2)} still to collect in cash
        </p>
      )}

      {/* The customer's proof of transfer, signed for five minutes on demand.
          The path itself never reaches the browser. */}
      {order.hasReceipt && (
        <button
          type="button"
          onClick={async () => {
            const result = await shopWrite("/api/admin/marketplace-ops/orders", {
              method: "PUT",
              body: JSON.stringify({ orderId: order.id }),
            });
            if (!result.ok) { toast.error(result.error); return; }
            const url = (result.data as { url?: string }).url;
            if (!url) { toast.error("Could not open that receipt."); return; }
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="mt-2 w-full rounded-xl border border-white/20 py-2 font-dm text-xs text-offwhite hover:border-yellow/40"
        >
          View proof of payment
        </button>
      )}

      {order.status === "ready_for_pickup" && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 font-dm text-xs text-muted">
          <ScanLine size={13} className="text-yellow" />
          The customer shows their pickup code at the shop to close this.
        </p>
      )}
    </article>
  );
}
