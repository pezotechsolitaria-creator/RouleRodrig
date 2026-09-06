"use client";

import { Check, Ban, AlertTriangle } from "lucide-react";
import { allDayFrom } from "@/lib/food/all-day";

// ── The batching screen ─────────────────────────────────────────────────────
//
// The Orders tab answers "what does THIS customer get". This one answers the
// only question that saves time: "how much of each thing do I need to cook".
// A cook working ticket by ticket puts the same pan on four times.
//
// Deliberately almost nothing on screen. No prices, no customer names, no
// timers, no buttons. It is read at arm's length, mid-service, and every extra
// element is something the eye has to skip. The quantity is the biggest thing
// on the row because it is the only number being acted on.

type Order = {
  items: { name: string; variant: string | null; qty: number; soldOut?: boolean }[];
  finished?: boolean;
  waitingOnTransfer?: boolean;
};

export default function AllDayPanel({ orders }: { orders: Order[] }) {
  const view = allDayFrom(orders);

  if (view.items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-8 text-center">
        <Check size={26} className="mx-auto text-green-400" />
        <p className="mt-2 font-syne text-base font-bold">Nothing to cook</p>
        <p className="mt-1 font-dm text-sm text-muted">
          {view.excludedOrders > 0
            ? "The only orders in are still waiting on payment."
            : "Totals appear here the moment an order comes in."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* One line of arithmetic, so the cook can sanity-check the list against
          the Orders tab without counting. */}
      <div className="flex items-baseline justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
        <span className="font-dm text-sm text-muted">
          {view.countedOrders} {view.countedOrders === 1 ? "order" : "orders"}
        </span>
        <span className="font-syne text-lg font-bold text-yellow tabular-nums">
          {view.totalPortions} {view.totalPortions === 1 ? "portion" : "portions"}
        </span>
      </div>

      {/* The number on this screen has to be trustworthy, so anything left out
          is said out loud rather than quietly dropped. */}
      {view.excludedOrders > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3 font-dm text-sm text-amber-300">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {view.excludedOrders === 1
              ? "1 more order is not counted here — it is still waiting on the customer's bank transfer."
              : `${view.excludedOrders} more orders are not counted here — they are still waiting on the customer's bank transfer.`}
          </span>
        </p>
      )}

      <ul className="space-y-2">
        {view.items.map((it) => (
          <li
            key={JSON.stringify([it.name, it.variant])}
            className={`flex items-center gap-4 rounded-2xl border px-4 py-4 ${
              it.soldOut
                ? "border-red-500/30 bg-red-500/[0.06]"
                : "border-white/10 bg-dark-card"
            }`}
          >
            {/* Quantity first and biggest: it is what the cook is here for, and
                putting it on the left means the eye finds every number in the
                same place down the column. Tabular figures keep them aligned. */}
            <span
              className={`min-w-[3ch] shrink-0 text-center font-syne text-3xl font-extrabold tabular-nums ${
                it.soldOut ? "text-red-300" : "text-yellow"
              }`}
            >
              {it.qty}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block font-syne text-lg font-bold leading-tight text-offwhite">
                {it.name}
              </span>
              {it.variant && (
                <span className="mt-0.5 block font-dm text-sm text-muted">{it.variant}</span>
              )}
              <span className="mt-1 block font-dm text-xs text-muted/70">
                {it.tickets === 1 ? "1 order" : `${it.tickets} orders`}
              </span>
            </span>

            {/* A dish taken off the menu while orders for it are still live is
                not a rounding error — those customers need telling. */}
            {it.soldOut && (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 px-3 py-1.5 font-syne text-xs font-bold text-red-300">
                <Ban size={13} /> Sold out
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
