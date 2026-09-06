import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { clockAt, durationText, STATUS_VOCAB, type DiaryDay } from "@/lib/services/diary";

// ── A trade's slot-three block ──────────────────────────────────────────────
//
// blocks.ts said, of the service kind: "A booked-slot block is its own thing
// and is not written yet." This is it.
//
// It answers the only question a car wash asks at seven in the morning: WHO IS
// COMING TODAY, AND WHEN. Not a count — "3 bookings" sends them to the diary to
// find out which — the times and the names, which is the whole value, the same
// reason ServingToday lists dishes rather than counting them.
export default function BookedToday({ today }: { today: DiaryDay | null }) {
  if (!today) {
    return (
      <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <p className="font-syne text-sm font-bold text-amber-300">Diary unavailable</p>
        <p className="mt-1 font-dm text-xs text-offwhite/70">
          We couldn&apos;t read your bookings just now. Reload the page.
        </p>
      </section>
    );
  }

  // Only bookings that still hold time. A cancellation belongs on the diary,
  // where the provider can see the day emptied out, and NOT on a home screen
  // that is answering "who is coming".
  const live = today.bookings.filter((b) => STATUS_VOCAB[b.status].holdsTime);

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-dark-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 font-syne text-sm font-bold text-offwhite">
          <CalendarDays size={15} className="text-yellow" /> Booked today
        </p>
        <Link href="/merchant/diary" className="font-dm text-xs text-muted hover:text-yellow">
          {today.isClosed ? "Closed" : live.length === 0 ? "Diary" : durationText(today.bookedMinutes)}
        </Link>
      </div>

      {today.isClosed ? (
        // Closed and empty are not the same fact, and a provider told "nothing
        // booked" on a day they chose to shut would go looking for a fault.
        <p className="mt-1 font-dm text-xs text-muted">You are closed today.</p>
      ) : live.length === 0 ? (
        <p className="mt-1 font-dm text-xs text-muted">Nothing booked today.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {live.slice(0, 4).map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3 font-dm text-xs">
              <span className="truncate text-offwhite/85">
                <span className="tabular-nums text-yellow">{clockAt(b.startsAt)}</span>{" "}
                {b.customerName}
              </span>
              <span className="shrink-0 truncate text-muted">{b.service}</span>
            </li>
          ))}
          {live.length > 4 && (
            <li className="font-dm text-xs text-muted">and {live.length - 4} more</li>
          )}
        </ul>
      )}
    </section>
  );
}
