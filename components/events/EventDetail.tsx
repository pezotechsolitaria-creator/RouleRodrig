"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Clock, Phone, Ticket, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { eventDateOnly, eventTimeOnly } from "@/lib/events/format";
import { EVENTS_COPY, availabilityCopy } from "@/lib/events/copy.i18n";
import type { EventSummary } from "@/lib/events/queries";
import PackagePicker from "@/components/events/PackagePicker";
import ShareEvent from "@/components/events/ShareEvent";

// ── The body of /events/[slug], in the reader's language ────────────────────
//
// app/events/[slug]/page.tsx stays a server component: the Supabase read, the
// schema.org Event payload and generateMetadata all live there, and none of
// them move. This half is a client component because the chosen language is in
// localStorage (context/LanguageContext.tsx) and no server component can read
// it — the same reason as app/deliver/DeliverTitle.tsx, at the size this page
// needed. Both of the interactive pieces it renders, PackagePicker and
// ShareEvent, were already client components.
//
// The event's own words — name, tagline, description, venue, terms, the
// cancellation reason — are the ORGANISER's and are printed exactly as typed.
// Only the site's own sentences are translated.

export default function EventDetail({ event, url }: { event: EventSummary; url: string }) {
  const { language } = useLanguage();
  const c = EVENTS_COPY[language];

  const cancelled = event.phase === "cancelled";
  const ended = event.phase === "ended";
  const avail = availabilityCopy(language, event.remaining, event.capacity);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-yellow/15 to-transparent sm:h-64">
        {event.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-yellow/30">
            <Ticket size={54} />
          </div>
        )}
      </div>

      <h1 className="mt-5 font-syne text-2xl font-extrabold sm:text-3xl">{event.name}</h1>
      {event.tagline && <p className="mt-1.5 font-dm text-sm text-muted">{event.tagline}</p>}

      {cancelled && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
          <div>
            <p className="font-syne text-sm font-bold text-red-400">{c.detail.cancelledTitle}</p>
            {event.cancelledReason && (
              <p className="mt-1 font-dm text-sm text-offwhite/85">{event.cancelledReason}</p>
            )}
            <p className="mt-1 font-dm text-xs text-muted">{c.detail.cancelledNote}</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <p className="flex items-center gap-2 font-dm text-sm text-offwhite">
            <CalendarDays size={15} className="text-yellow" />
            {eventDateOnly(event.startsAt, event.timezone)}
          </p>
          <p className="mt-2 flex items-center gap-2 font-dm text-sm text-offwhite">
            <Clock size={15} className="text-yellow" />
            {event.doorsOpenAt
              ? c.detail.doors(
                  eventTimeOnly(event.doorsOpenAt, event.timezone),
                  eventTimeOnly(event.startsAt, event.timezone),
                )
              : eventTimeOnly(event.startsAt, event.timezone)}
          </p>
          <p className="mt-1 font-dm text-[11px] text-muted">{c.detail.islandTime}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
          <p className="flex items-center gap-2 font-dm text-sm text-offwhite">
            <MapPin size={15} className="text-yellow" /> {event.venueName ?? c.detail.venueFallback}
          </p>
          {event.venueAddress && <p className="mt-1 font-dm text-xs text-muted">{event.venueAddress}</p>}
          {event.lat != null && event.lng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-dm text-xs font-semibold text-yellow hover:underline"
            >
              {c.detail.openMaps} →
            </a>
          )}
        </div>
      </div>

      {!cancelled && !ended && (
        <p
          className={`mt-4 font-dm text-sm font-semibold ${
            avail.tone === "gone" ? "text-red-400" : avail.tone === "low" ? "text-orange-300" : "text-muted"
          }`}
        >
          {avail.text}
        </p>
      )}

      {event.description && (
        <p className="mt-4 whitespace-pre-line font-dm text-sm leading-relaxed text-offwhite/85">
          {event.description}
        </p>
      )}

      <div className="mt-6">
        {ended ? (
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5 text-center">
            <p className="font-syne text-sm font-bold text-offwhite">{c.detail.endedTitle}</p>
            <Link href="/events" className="mt-2 inline-block font-dm text-sm font-bold text-yellow hover:underline">
              {c.detail.endedCta} →
            </Link>
          </div>
        ) : (
          <>
            {/* The conversion moment. Cards first, so the customer chooses
                WHICH before being asked HOW MANY (M47). */}
            <h2 className="mb-4 font-bebas text-[11px] tracking-[0.3em] text-yellow">
              {c.detail.chooseEyebrow}
            </h2>
            <PackagePicker
              storeId={event.storeId}
              storeName={event.name}
              slug={event.slug}
              ticketTypes={event.ticketTypes}
              disabled={cancelled}
            />
          </>
        )}
      </div>

      <div className="mt-5">
        <ShareEvent name={event.name} url={url} startsAt={event.startsAt} timezone={event.timezone} venue={event.venueName} />
      </div>

      {event.supportPhone && (
        <p className="mt-5 flex items-center gap-2 font-dm text-xs text-muted">
          <Phone size={13} /> {c.detail.support} {event.supportPhone}
        </p>
      )}
      {event.terms && <p className="mt-3 font-dm text-[11px] leading-relaxed text-muted/80">{event.terms}</p>}
    </div>
  );
}
