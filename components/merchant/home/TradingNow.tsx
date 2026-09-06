import Link from "next/link";
import { todayLine, deliveryLine, nextOpenLabel, type ScheduleStatus } from "@/lib/schedule";

// ── AM I TRADING RIGHT NOW? ─────────────────────────────────────────────────
//
// Reads store_schedule_status(), which is the SAME function create_order()
// gates on — so this badge can never claim the shop is open while checkout is
// refusing orders. That property is the whole reason it is not computed from
// store_hours here.
//
// `hasFulfilmentChoice` is passed as a plain boolean rather than a kind,
// because the block should not know what a box office is. A seller with all
// three fulfilment options off used to be told in red that they had "no
// fulfillment method" — an error state describing a business that does not
// deliver anything, which is most of them.

export default function TradingNow({
  schedule,
  payment,
  hasFulfilmentChoice,
}: {
  schedule: ScheduleStatus | null;
  payment: {
    acceptsCash: boolean;
    acceptsBankTransfer: boolean;
    offersPickup: boolean;
    offersCustomerDelivery: boolean;
    offersRrDelivery: boolean;
  };
  hasFulfilmentChoice: boolean;
}) {
  if (!schedule) return null;

  const state = !schedule.has_schedule ? "unset" : schedule.is_open ? "open" : "closed";
  const tone = {
    // Hours not set is INFORMATION, not a fault: the shop is treated as always
    // open, which is a defensible default for a market seller and is stated as
    // one rather than coloured like a failure.
    unset: { pill: "bg-white/10 text-muted", dot: "bg-muted", label: "Hours not set" },
    open: { pill: "bg-green-500/15 text-green-400", dot: "bg-green-400", label: "Open now" },
    closed: { pill: "bg-white/10 text-muted", dot: "bg-muted", label: "Closed" },
  }[state];

  const methods =
    [payment.acceptsCash && "cash", payment.acceptsBankTransfer && "bank transfer"]
      .filter(Boolean)
      .join(" and ") || null;

  const fulfilment =
    [
      payment.offersPickup && "pickup",
      payment.offersCustomerDelivery && "own driver",
      payment.offersRrDelivery && "RR delivery",
    ]
      .filter(Boolean)
      .join(", ") || null;

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Link
          href="/merchant/hours"
          className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 font-dm text-xs font-medium ${tone.pill}`}
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {tone.label}
        </Link>
        <span className="font-dm text-xs text-muted">Today {todayLine(schedule)}</span>
        {!schedule.is_open && nextOpenLabel(schedule) && (
          <span className="font-dm text-xs text-muted">{nextOpenLabel(schedule)}</span>
        )}
      </div>

      {payment.offersRrDelivery && (
        <p className="mt-1.5 font-dm text-xs text-muted">
          Delivery{" "}
          <span className={schedule.delivery_available ? "text-green-400" : "text-muted"}>
            {schedule.delivery_available ? "running now" : "not running"}
          </span>
          {deliveryLine(schedule) && ` · ${deliveryLine(schedule)}`}
        </p>
      )}

      <p className="mt-1 font-dm text-xs text-muted">
        Taking {methods ?? <span className="text-red-400">no payment method</span>}
        {hasFulfilmentChoice && (
          <>
            {" · "}
            {fulfilment ?? <span className="text-red-400">no fulfillment method</span>}
          </>
        )}
      </p>

      {!schedule.has_schedule && (
        <p className="mt-2 font-dm text-xs text-muted">
          No hours set, so your shop is treated as always open.{" "}
          <Link href="/merchant/hours" className="text-yellow underline">
            Set them
          </Link>{" "}
          if you want orders to stop outside your working day.
        </p>
      )}
    </div>
  );
}
