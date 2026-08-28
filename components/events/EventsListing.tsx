"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Ticket, ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { centsToDecimalString } from "@/lib/money";
import { eventDateTime } from "@/lib/events/format";
import { EVENTS_COPY, availabilityCopy, countdownCopy } from "@/lib/events/copy.i18n";
import type { EventSummary } from "@/lib/events/queries";
import type { EventItem } from "@/lib/defaults";
import Events from "@/components/Events";
import type { Language } from "@/lib/i18n";

// ── The body of /events, in the reader's language ───────────────────────────
//
// app/events/page.tsx stays a server component: it does the Supabase read, the
// JSON-LD and the metadata, and hands the finished data here. This half is a
// client component for one reason — the chosen language lives in localStorage
// (context/LanguageContext.tsx) and no server component can read it. Same
// reasoning as app/deliver/DeliverTitle.tsx, at the size this page needed:
// nearly every line of the listing is a sentence, so extracting the strings one
// at a time would have meant a dozen one-line client children.
//
// Nothing about the page's behaviour moves with it. The route is still
// force-dynamic, the counts are still read per request, and the markup is the
// markup that was here before.

function EventCard({
  event,
  now,
  language,
}: {
  event: EventSummary;
  now: number;
  language: Language;
}) {
  const c = EVENTS_COPY[language];
  const avail = availabilityCopy(language, event.remaining, event.capacity);
  const countdown = countdownCopy(language, event.startsAt, now);
  const cancelled = event.phase === "cancelled";

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-all hover:border-yellow/30 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/5">
        {event.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-yellow/15 to-transparent text-yellow/30">
            <Ticket size={40} />
          </div>
        )}
        {countdown && !cancelled && (
          <span className="absolute left-2 top-2 rounded-full bg-dark/90 px-2.5 py-1 font-dm text-[11px] font-semibold text-yellow">
            {countdown}
          </span>
        )}
        {cancelled && (
          <span className="absolute inset-0 flex items-center justify-center bg-dark/75 font-syne text-lg font-extrabold text-red-400">
            {c.list.cancelled}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-syne text-lg font-bold leading-tight text-offwhite">{event.name}</h3>
        {event.tagline && <p className="mt-1 line-clamp-2 font-dm text-xs text-muted">{event.tagline}</p>}

        <div className="mt-3 space-y-1.5 font-dm text-xs text-muted">
          <p className="flex items-center gap-1.5">
            <CalendarDays size={13} className="shrink-0 text-yellow" />
            {eventDateTime(event.startsAt, event.timezone)}
          </p>
          {event.venueName && (
            <p className="flex items-center gap-1.5">
              <MapPin size={13} className="shrink-0 text-yellow" /> {event.venueName}
            </p>
          )}
        </div>

        {!cancelled && (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.08] pt-3">
            <span
              className={`font-dm text-xs font-semibold ${
                avail.tone === "gone" ? "text-red-400" : avail.tone === "low" ? "text-orange-300" : "text-muted"
              }`}
            >
              {avail.text}
            </span>
            {event.fromPrice !== null && (
              <span className="font-syne text-sm font-bold text-yellow">
                Rs {centsToDecimalString(event.fromPrice)}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function EventsListing({
  upcoming,
  past,
  notices,
  now,
}: {
  upcoming: EventSummary[];
  past: EventSummary[];
  /** The owner's free-text noticeboard, already filtered by the page. */
  notices: EventItem[];
  /** The SERVER's clock, so "Today" cannot become "Tomorrow" at hydration on a
   *  phone whose clock is wrong. See countdownCopy(). */
  now: number;
}) {
  const { language } = useLanguage();
  const c = EVENTS_COPY[language];

  return (
    <div className="mx-auto max-w-4xl">
      <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">{c.list.eyebrow}</p>
      <h1 className="mt-1 font-syne text-2xl font-extrabold sm:text-3xl">{c.list.title}</h1>
      <p className="mt-2 max-w-2xl font-dm text-sm text-muted">{c.list.intro}</p>

      {upcoming.length === 0 ? (
        <div className="mt-10 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
            <Ticket size={26} />
          </span>
          <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">{c.list.emptyTitle}</h2>
          <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">
            {c.list.emptyBody}
          </p>
          {/* NOT /browse/events — that redirects back to this page now, so
              the button would have been a loop. */}
          <Link
            href="/explore"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            {c.list.emptyCta} <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {upcoming.map((e) => (
            <EventCard key={e.storeId} event={e} now={now} language={language} />
          ))}
        </div>
      )}

      {notices.length > 0 && (
        <section className="mt-12">
          <h2 className="font-syne text-lg font-bold text-offwhite">{c.list.alsoTitle}</h2>
          <p className="mt-1 font-dm text-sm text-muted">{c.list.alsoBody}</p>
          <div className="mt-3">
            <Events events={notices} />
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-12">
          <h2 className="font-syne text-lg font-bold text-offwhite">{c.list.pastTitle}</h2>
          <ul className="mt-3 space-y-1.5">
            {past.slice(0, 8).map((e) => (
              <li key={e.storeId} className="font-dm text-sm text-muted">
                <Link href={`/events/${e.slug}`} className="hover:text-yellow">
                  {e.name}
                </Link>{" "}
                · {eventDateTime(e.startsAt, e.timezone)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The acquisition loop, kept to one quiet line rather than a wall of
          adverts: somebody who came for a concert should discover the rest of
          the island exists, not be sold to. */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
        <p className="font-dm text-sm text-muted">{c.list.crossSell}</p>
        <div className="flex gap-3 font-dm text-sm font-bold text-yellow">
          <Link href="/#fleet" className="hover:underline">{c.list.scooters} →</Link>
          <Link href="/explore" className="hover:underline">{c.list.explore} →</Link>
        </div>
      </div>
    </div>
  );
}
