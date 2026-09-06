import Link from "next/link";
import { Ticket } from "lucide-react";
import { availabilityLabel } from "@/lib/events/format";
import type { OrganizerEventDetail } from "@/lib/events/organizer";

// ── A box office's slot-three block ─────────────────────────────────────────
//
// blocks.ts said of the events kind: "A box office sells against an allocation
// that cannot be restocked, so 'low stock' is not a warning, it is the point.
// Tickets sold against tickets remaining is its own block and is not written
// yet." This is it, and until now an organiser's home screen showed Earnings
// and nothing else — money with no idea what produced it.
//
// ── WHY NOT THE STOCK BLOCK ────────────────────────────────────────────────
// Stock says "12 low stock items" and offers to restock. A hall holds what it
// holds. The number that matters is not how few are left but how few are left
// AGAINST what there were: 20 remaining is a crisis in a 25-seat room and a
// quiet week in a 5,000-seat one. availabilityLabel already draws exactly that
// distinction for the customer-facing page, so the organiser is shown the same
// judgement rather than a second one that could disagree with it.

export default function TicketsLeft({ event }: { event: OrganizerEventDetail | null }) {
  if (!event) {
    return (
      <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="font-syne text-sm font-bold text-amber-300">Ticket numbers unavailable</p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          We couldn&apos;t read your packages just now. Reload the page.
        </p>
      </section>
    );
  }

  const live = event.packages.filter((p) => p.isActive);

  if (live.length === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <Ticket size={15} className="text-yellow" /> No tickets on sale
        </p>
        <p className="mt-1 font-dm text-xs text-muted">
          {event.packages.length === 0
            ? "Add a package — a name, a price and how many you have is enough."
            : "Every package is switched off, so nobody can buy a ticket right now."}
        </p>
        <Link
          href="/organizer"
          className="mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-yellow px-5 font-syne text-sm font-bold text-dark"
        >
          Open the box office
        </Link>
      </section>
    );
  }

  const remaining = live.reduce((n, p) => n + p.remaining, 0);
  const sold = live.reduce((n, p) => n + p.sold, 0);
  const awaiting = live.reduce((n, p) => n + p.awaiting, 0);
  const total = remaining + sold + awaiting;
  const overall = availabilityLabel(remaining, total);

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <Ticket size={15} className="text-yellow" /> Tickets
        </p>
        <Link href="/organizer" className="font-dm text-xs text-muted hover:text-yellow">
          {sold} sold of {total}
        </Link>
      </div>

      <p
        className={`mt-1 font-dm text-xs ${
          overall.tone === "gone" ? "text-red-300" : overall.tone === "low" ? "text-yellow" : "text-muted"
        }`}
      >
        {overall.text}
        {/* Money that has not landed yet is not a sale, and it is not a spare
            seat either — the places are held. An organiser deciding whether to
            release more has to be able to see that number separately. */}
        {awaiting > 0 && ` · ${awaiting} held, waiting on payment`}
      </p>

      {live.length > 1 && (
        <ul className="mt-2 space-y-1.5">
          {/* Named, not counted — the same reason ServingToday lists dishes.
              "40 remaining" across four tiers hides that the cheap one went
              hours ago and the expensive one has not moved. */}
          {live.slice(0, 4).map((p) => {
            const each = availabilityLabel(p.remaining, p.remaining + p.sold + p.awaiting);
            return (
              <li key={p.variantId} className="flex items-baseline justify-between gap-3 font-dm text-xs">
                <span className="truncate text-offwhite/85">{p.name ?? "Ticket"}</span>
                <span
                  className={`shrink-0 ${
                    each.tone === "gone" ? "text-red-300" : each.tone === "low" ? "text-yellow" : "text-muted"
                  }`}
                >
                  {each.text}
                </span>
              </li>
            );
          })}
          {live.length > 4 && (
            <li className="font-dm text-xs text-muted">and {live.length - 4} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
