import { CalendarClock } from "lucide-react";
import type { SlotCardCopy } from "@/lib/orders/slot-copy";

// ── WHEN (M216) ─────────────────────────────────────────────────────────────
//
// PickupLocationCard says WHERE; this says WHEN. A food order booked a day or
// two ahead used to show the customer a 7-day "your items are reserved" clock
// and never the slot they chose, so the only date on the page was the wrong
// one. This sits near the top of /orders/[id] and /orders/track, in place of
// that clock.
//
// No hooks and no "use client": the signed-in page renders it on the server
// and the guest page in the browser. The words arrive already built by
// slotCard(), in the visitor's language.

export default function BookedSlotCard({ copy, className = "" }: { copy: SlotCardCopy; className?: string }) {
  return (
    <section
      aria-labelledby="booked-slot-heading"
      className={`rounded-2xl border border-yellow/40 bg-yellow/[0.08] p-5 ${className}`}
    >
      <p className="flex items-center gap-1.5 font-bebas text-[11px] tracking-[0.25em] text-yellow">
        <CalendarClock size={13} /> {copy.eyebrow.toUpperCase()}
      </p>
      <h2 id="booked-slot-heading" className="mt-2 font-syne text-xl font-extrabold leading-snug text-offwhite">
        {copy.headline}
      </h2>
      {copy.date && <p className="mt-0.5 font-dm text-sm text-offwhite/80">{copy.date}</p>}
      {copy.lines.length > 0 && (
        <div className="mt-3 space-y-1">
          {copy.lines.map((line) => (
            <p key={line} className="font-dm text-sm leading-relaxed text-offwhite/85">
              {line}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
