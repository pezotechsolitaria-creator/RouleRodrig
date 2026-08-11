import { Check, X } from "lucide-react";
import { statusLabel, statusSteps, timelineIndexFor, type OrderStatus } from "@/lib/orders/status";

// `isEvent` changes both the words and the number of steps: a ticket buyer has
// two milestones, not five, and calling `paid` "Confirmed" leaves them hunting
// for the word "ticket". See EVENT_STATUS_LABEL in lib/orders/status.ts.
export default function OrderTimeline({
  status,
  isEvent = false,
}: {
  status: OrderStatus;
  isEvent?: boolean;
}) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3">
        <X size={16} className="text-red-400" />
        <span className="font-dm text-sm font-medium text-red-400">{statusLabel(status, isEvent)}</span>
      </div>
    );
  }

  const steps = statusSteps(isEvent);
  const activeIndex = timelineIndexFor(status, isEvent);

  return (
    <ol className="flex items-center" aria-label="Order status">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const current = i === activeIndex;
        const last = i === steps.length - 1;
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-full border font-dm text-[11px] font-bold " +
                  (done
                    ? "border-yellow bg-yellow text-dark"
                    : current
                      ? "border-yellow bg-yellow/15 text-yellow"
                      : "border-white/15 bg-transparent text-muted")
                }
                aria-current={current ? "step" : undefined}
              >
                {done ? <Check size={13} /> : i + 1}
              </span>
              <span className={"font-dm text-[10px] " + (done || current ? "text-offwhite" : "text-muted")}>
                {statusLabel(s, isEvent)}
              </span>
            </div>
            {!last && (
              <span
                className={"mx-1.5 h-px flex-1 " + (done ? "bg-yellow" : "bg-white/15")}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
