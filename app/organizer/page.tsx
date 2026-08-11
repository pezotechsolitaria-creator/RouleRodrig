import Link from "next/link";
import { CalendarDays, MapPin, ArrowRight, AlertTriangle, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listMyEvents, type OrganizerEvent } from "@/lib/events/organizer";
import { centsToDecimalString } from "@/lib/money";

// Dynamic, never cached: every number here is an operational count somebody is
// about to make a decision on. A stale "173 remaining" is worse than a slow
// page — the same reasoning as /events and the /shop "Open now" badge.
export const dynamic = "force-dynamic";

const PHASE_STYLE: Record<OrganizerEvent["phase"], string> = {
  upcoming: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/15 text-green-400 border-green-500/30",
  ended: "bg-white/10 text-muted border-white/15",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/25",
  draft: "bg-yellow/15 text-yellow border-yellow/30",
};

const PHASE_LABEL: Record<OrganizerEvent["phase"], string> = {
  upcoming: "Upcoming",
  in_progress: "Happening now",
  ended: "Finished",
  cancelled: "Cancelled",
  draft: "Not published",
};

function fmtDate(iso: string, tz = "Indian/Mauritius") {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default async function OrganizerHome() {
  const supabase = await createClient();
  const events = await listMyEvents(supabase);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-20 pt-8">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MY EVENTS</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite">
        {events.length === 1 ? events[0].name : "Your events"}
      </h1>
      <p className="mt-1.5 font-dm text-sm text-muted">
        Everything you need to run your event. Ticket money is paid to you directly — Roulé Rodrigues
        never holds it.
      </p>

      {events.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
            <CalendarDays size={22} />
          </span>
          <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">No events yet</h2>
          {/* An empty state that explains WHY it is empty and what happens next.
              An organiser who signs in to nothing assumes it is broken. */}
          <p className="mx-auto mt-1 max-w-sm font-dm text-sm text-muted">
            Your account is active, but no event has been assigned to it yet. Roulé Rodrigues assigns
            events — once yours is added it will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {events.map((e) => (
            <EventCard key={e.store_id} event={e} />
          ))}
        </div>
      )}
    </main>
  );
}

function EventCard({ event: e }: { event: OrganizerEvent }) {
  const sold = e.confirmed;
  // Guard the divide: a brand-new event with no ticket types has capacity 0.
  const pct = e.capacity > 0 ? Math.min(100, Math.round((sold / e.capacity) * 100)) : 0;
  const attendancePct = e.issued > 0 ? Math.round((e.redeemed / e.issued) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-syne text-lg font-bold text-offwhite">{e.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-dm text-sm text-muted">
            <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {fmtDate(e.starts_at)}</span>
            {e.venue_name && <span className="flex items-center gap-1.5"><MapPin size={13} /> {e.venue_name}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 font-dm text-[11px] font-medium ${PHASE_STYLE[e.phase]}`}>
          {PHASE_LABEL[e.phase]}
        </span>
      </div>

      {e.phase === "draft" && (
        <p role="status" className="mt-3 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-2.5 font-dm text-xs text-yellow/90">
          This event is not published yet, so nobody can buy tickets. Roulé Rodrigues publishes it when
          you are ready.
        </p>
      )}
      {e.cancelled_at && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-2.5 font-dm text-xs text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          This event is cancelled. Tickets are void and no new reservations can be made.
        </p>
      )}

      {/* Sold progress — the one number an organiser looks at first. */}
      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="font-syne text-2xl font-extrabold text-offwhite">
            {sold}
            <span className="font-dm text-sm font-normal text-muted"> of {e.capacity} sold</span>
          </p>
          <p className="font-dm text-sm text-muted">{e.remaining} left</p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={`${pct}% of tickets sold`}
        >
          <div className="h-full rounded-full bg-yellow transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Awaiting payment" value={String(e.awaiting)} hint="Reserved, not paid yet" />
        <Stat label="Confirmed" value={String(e.confirmed)} accent />
        <Stat label="Checked in" value={e.issued > 0 ? `${e.redeemed} / ${e.issued}` : "—"} hint={e.issued > 0 ? `${attendancePct}% arrived` : "No tickets issued yet"} />
        <Stat label="You've taken" value={`Rs ${centsToDecimalString(e.gross_confirmed)}`} hint="Paid directly to you" accent />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <Link
          href={`/organizer/${e.slug}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-syne text-xs font-bold text-dark transition-colors hover:bg-yellow-dark"
        >
          <Ticket size={14} /> Manage event <ArrowRight size={14} />
        </Link>
        {e.can_verify_payments && (
          <span className="font-dm text-[11px] text-green-400">You can approve payments for this event</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <dt className="font-dm text-[11px] leading-tight text-muted">{label}</dt>
      <dd className={`mt-1 font-syne text-base font-bold ${accent ? "text-yellow" : "text-offwhite"}`}>{value}</dd>
      {hint && <p className="mt-0.5 font-dm text-[10px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}
