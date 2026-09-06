import Link from "next/link";
import { AlertTriangle, ChevronRight, Clock, ShoppingBag } from "lucide-react";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { holdInfo, holdRemaining } from "@/lib/orders/hold";
import { centsToDecimalString } from "@/lib/money";
import type { WorkQueue as Queue, WorkItem } from "@/lib/merchant/context";

// ── WHAT NEEDS ME, SOONEST FIRST ────────────────────────────────────────────
//
// This replaces the single most misleading figure in the merchant console: a
// StatCard labelled "Orders" showing an unfiltered lifetime COUNT of every
// order the store had ever taken, at any status. A shop with eleven orders ever
// and one customer waiting since Tuesday read "11" — a number that never moves
// and answers no question. It was also the ONLY figure on the whole home screen
// derived from an order.
//
// ── WHY THIS ONE COMPONENT SERVES EVERY KIND OF BUSINESS ───────────────────
// It branches on a COLUMN, never on what sort of merchant is looking at it.
// An order with a pickup_slot renders its collection window; an order without
// one renders the payment deadline from auto_release_at. That is the entire
// difference between a kitchen and a shop here — and it is why a car wash's
// 09:00 appointment will render correctly the day trade bookings exist,
// without this file being reopened.
//
// Money is CENTS. Every figure goes through centsToDecimalString, because this
// platform has shipped the rupees-vs-cents bug three times and twice in a
// column called something plausible.

function slotWindow(range: string | null): string | null {
  if (!range) return null;
  // ["2026-09-06 12:30:00+00","2026-09-06 13:00:00+00")
  const parts = range.match(/[[(]"?([^",)\]]+)"?,\s*"?([^",)\]]+)/);
  if (!parts) return null;
  const fmt = (raw: string) => {
    const d = new Date(raw.replace(" ", "T"));
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Indian/Mauritius",
        });
  };
  const from = fmt(parts[1]);
  const to = fmt(parts[2]);
  return from && to ? `${from}–${to}` : from;
}

/** The deadline in words, and whether it should shout. */
function dueLabel(item: WorkItem): { text: string; urgent: boolean } | null {
  const window = slotWindow(item.pickupSlot);
  if (window) return { text: `Collection ${window}`, urgent: false };

  const hold = holdInfo(item.autoReleaseAt);
  if (!hold) return null;
  if (hold.expired) return { text: "Hold expired", urgent: true };
  // holdRemaining already speaks in words — "2 days", "7 hours", "under an
  // hour" — so the merchant never has to decode a bare number.
  return { text: `${holdRemaining(hold)} to pay`, urgent: hold.urgent };
}

/** First name only. The full name belongs on the order, not in a scan-list. */
function firstName(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "Guest";
  return n.split(/\s+/)[0];
}

export default function WorkQueue({
  queue,
  storeSlug,
}: {
  queue: Queue;
  storeSlug?: string | null;
}) {
  // A FAILED READ IS NOT A QUIET DAY. PostgREST answers an RLS denial with an
  // empty array and no error, so without this branch losing the server would
  // look exactly like a calm evening — and the merchant would sit waiting for
  // an order that already arrived.
  if (!queue.ok) {
    return (
      <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-amber-300">
          <AlertTriangle size={15} /> Couldn&apos;t load your orders
        </p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          This is a problem at our end, not a quiet day. Reload the page, and tell us if it keeps
          happening.
        </p>
      </section>
    );
  }

  if (queue.items.length === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="font-syne text-sm font-bold text-offwhite">Nothing waiting on you</p>
        {queue.lastCollectedAt ? (
          <p className="mt-1 font-dm text-xs text-muted">
            Your last order was collected on{" "}
            {new Date(queue.lastCollectedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            .
          </p>
        ) : (
          // Never traded. A compliment would be a lie and a zero would be
          // useless, so this is the one thing that actually helps: the link.
          <>
            <p className="mt-1 font-dm text-xs text-muted">
              No orders yet. Customers can buy from you right now — share your shop.
            </p>
            {storeSlug && (
              <p className="mt-2 truncate font-dm text-xs text-yellow">
                roulerodrig.com/shop/{storeSlug}
              </p>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-syne text-sm font-bold text-offwhite">Waiting on you</h2>
        {queue.openCount > queue.items.length && (
          <Link href="/merchant/orders" className="font-dm text-xs text-muted hover:text-yellow">
            {queue.openCount} open
          </Link>
        )}
      </div>

      <ul className="mt-2 space-y-2">
        {queue.items.map((item) => {
          const due = dueLabel(item);
          return (
            <li key={item.id}>
              <Link
                href={`/merchant/orders/${item.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3 transition-colors hover:border-yellow/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow/10 text-yellow">
                  <ShoppingBag size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate font-dm text-sm font-semibold text-offwhite">
                      {firstName(item.customerName)}
                    </span>
                    <span className="shrink-0 font-dm text-[11px] text-muted/70">
                      {item.orderNumber}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-dm text-[11px] text-muted">
                    {/* The label, never the raw Postgres enum. */}
                    <span>{STATUS_LABEL[item.status as OrderStatus] ?? item.status}</span>
                    {item.itemCount > 0 && (
                      <>
                        <span className="opacity-50">·</span>
                        <span>
                          {item.itemCount} item{item.itemCount === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                    {item.totalCents != null && (
                      <>
                        <span className="opacity-50">·</span>
                        <span>Rs {centsToDecimalString(item.totalCents)}</span>
                      </>
                    )}
                  </div>
                  {due && (
                    <p
                      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-dm text-[10px] ${
                        due.urgent
                          ? "bg-red-500/15 text-red-300"
                          : "bg-white/5 text-offwhite/70"
                      }`}
                    >
                      <Clock size={10} /> {due.text}
                    </p>
                  )}
                </div>

                <ChevronRight size={15} className="shrink-0 text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
