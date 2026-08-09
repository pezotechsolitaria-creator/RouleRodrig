"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Ticket } from "lucide-react";
import { useCart } from "@/lib/cart/CartContext";
import { centsToDecimalString } from "@/lib/money";
import { Button } from "@/components/ui/button";
import type { EventTicketType } from "@/lib/events/queries";

// Reserving a ticket IS placing a marketplace order.
//
// That is the whole point of "an event is a store": this component does not
// hold inventory, does not price anything and does not know what a reservation
// is. It puts a variant in the existing cart and hands over to the existing
// checkout, which already derives the price server-side (RR012), locks the
// stock row, caps the quantity per order and supports guest buyers. A second
// reservation system here would be a second set of bugs.
export default function ReserveTickets({
  storeId,
  storeName,
  ticketTypes,
  paymentNote,
  disabled,
}: {
  storeId: string;
  storeName: string;
  ticketTypes: EventTicketType[];
  paymentNote: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellable = ticketTypes.filter((t) => t.salesOpen && !t.soldOut);
  const total = ticketTypes.reduce((sum, t) => sum + (qty[t.variantId] ?? 0) * t.price, 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  function step(t: EventTicketType, delta: number) {
    setError(null);
    setQty((prev) => {
      const current = prev[t.variantId] ?? 0;
      // The cap is whichever is tighter: what the organiser allows per order,
      // or what is actually left. Enforced again server-side at checkout.
      const ceiling = Math.min(t.maxPerOrder ?? 99, t.remaining);
      const next = Math.max(0, Math.min(ceiling, current + delta));
      return { ...prev, [t.variantId]: next };
    });
  }

  function reserve() {
    if (count === 0 || busy) return;
    setBusy(true);
    setError(null);
    for (const t of ticketTypes) {
      const n = qty[t.variantId] ?? 0;
      if (n > 0) {
        const result = addItem({ storeId, storeName, variantId: t.variantId, quantity: n });
        if (result === "conflict") {
          // The cart holds one store at a time — the customer has a shop order
          // open. Say so plainly instead of silently discarding either one.
          setError("You have items from another shop in your basket. Finish or empty that order first.");
          setBusy(false);
          return;
        }
      }
    }
    posthog.capture("event_tickets_reserved", {
      event_store_id: storeId,
      ticket_count: count,
      ticket_type_count: Object.values(qty).filter((quantity) => quantity > 0).length,
    });
    router.push("/checkout");
  }

  if (disabled || sellable.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-dark-card p-5 text-center">
        <p className="font-syne text-sm font-bold text-offwhite">
          {ticketTypes.some((t) => t.soldOut) && sellable.length === 0
            ? "Sold out"
            : "Tickets are not on sale"}
        </p>
        <p className="mt-1.5 font-dm text-xs text-muted">
          {ticketTypes.some((t) => t.soldOut) && sellable.length === 0
            ? "Every ticket has been reserved."
            : "Reservations for this event are closed."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-yellow/25 bg-yellow/[0.05] p-5">
      <h2 className="flex items-center gap-1.5 font-syne text-sm font-bold text-yellow">
        <Ticket size={15} /> Reserve your tickets
      </h2>

      <div className="mt-4 space-y-3">
        {ticketTypes.map((t) => {
          const n = qty[t.variantId] ?? 0;
          const closed = !t.salesOpen || t.soldOut;
          const ceiling = Math.min(t.maxPerOrder ?? 99, t.remaining);
          return (
            <div
              key={t.variantId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-dm text-sm font-semibold text-offwhite">{t.name}</p>
                <p className="font-dm text-xs text-muted">
                  Rs {centsToDecimalString(t.price)}
                  {t.soldOut ? " · sold out" : !t.salesOpen ? " · not on sale" : ` · ${t.remaining} left`}
                </p>
              </div>
              {!closed && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`One fewer ${t.name}`}
                    onClick={() => step(t, -1)}
                    disabled={n === 0}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-offwhite disabled:opacity-30"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-6 text-center font-syne text-base font-bold text-offwhite">{n}</span>
                  <button
                    type="button"
                    aria-label={`One more ${t.name}`}
                    onClick={() => step(t, 1)}
                    disabled={n >= ceiling}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-offwhite disabled:opacity-30"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {count > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 font-dm text-sm">
          <span className="text-muted">
            {count} ticket{count === 1 ? "" : "s"}
          </span>
          <span className="font-syne text-base font-bold text-yellow">Rs {centsToDecimalString(total)}</span>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 font-dm text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="button" className="mt-4 w-full" disabled={count === 0 || busy} onClick={reserve}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : "Reserve"}
      </Button>

      {/* Said before they commit, not after: the platform is not taking money,
          and a customer who expects to have paid online would arrive at the
          gate with the wrong assumption. */}
      <p className="mt-3 font-dm text-[11px] leading-relaxed text-muted">
        {paymentNote ?? "You pay the organiser at the entrance — nothing is charged online."}
      </p>
    </div>
  );
}
