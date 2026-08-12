import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, MapPin, Ticket, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { ShopHeader } from "@/components/shop/ShopChrome";
import { listPublicEvents, splitByTime, type EventSummary } from "@/lib/events/queries";
import { eventDateTime, availabilityLabel, countdownLabel } from "@/lib/events/format";
import { getContent } from "@/lib/content";
import Events from "@/components/Events";

// Dynamic, not ISR: the number on the card is "143 tickets remaining", and a
// stale count is worse than a slow page — it is the one thing a visitor makes a
// decision on. Same reasoning as /shop's "Open now" badge.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Concerts, sega nights, markets and festivals in Rodrigues Island. Reserve your ticket online in seconds and pay the organiser at the door.";

export const metadata: Metadata = {
  title: "What's On in Rodrigues | Events & Tickets | Roulé Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/events` },
  openGraph: {
    title: "What's On in Rodrigues — Events & Tickets",
    description: DESCRIPTION,
    url: `${SITE_URL}/events`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

function EventCard({ event }: { event: EventSummary }) {
  const avail = availabilityLabel(event.remaining, event.capacity);
  const countdown = countdownLabel(event.startsAt);
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
            Cancelled
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

export default async function EventsPage() {
  const supabase = await createClient();
  const [all, content] = await Promise.all([listPublicEvents(supabase), getContent()]);
  const { upcoming, past } = splitByTime(all);
  // The owner's free-text noticeboard, which used to be a second page called
  // Events. A blank title is a half-created row, not a listing.
  const notices = content.events.filter((e) => e.title?.trim());

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/" backLabel="Home" />

      {upcoming.length > 0 && (
        <JsonLd
          data={[
            breadcrumbLd([
              { name: "Home", url: SITE_URL },
              { name: "Events", url: `${SITE_URL}/events` },
            ]),
            itemListLd(
              "Events in Rodrigues",
              upcoming.map((e) => ({ name: e.name, url: `${SITE_URL}/events/${e.slug}` })),
            ),
          ]}
        />
      )}

      <div className="mx-auto max-w-4xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">WHAT&apos;S ON</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold sm:text-3xl">Events in Rodrigues</h1>
        <p className="mt-2 max-w-2xl font-dm text-sm text-muted">
          Reserve your place in seconds — no account needed. You pay the organiser at the door.
        </p>

        {upcoming.length === 0 ? (
          <div className="mt-10 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <Ticket size={26} />
            </span>
            <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">Nothing on sale right now</h2>
            <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">
              Sega nights, markets and festivals will appear here as soon as they open. In the meantime
              there is plenty happening on the island.
            </p>
            {/* NOT /browse/events — that redirects back to this page now, so
                the button would have been a loop. */}
            <Link
              href="/explore"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              See what&apos;s happening <ArrowRight size={15} />
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {upcoming.map((e) => (
              <EventCard key={e.storeId} event={e} />
            ))}
          </div>
        )}

        {notices.length > 0 && (
          <section className="mt-12">
            <h2 className="font-syne text-lg font-bold text-offwhite">Also happening</h2>
            <p className="mt-1 font-dm text-sm text-muted">
              Around the island — no tickets sold here, just what is on.
            </p>
            <div className="mt-3">
              <Events events={notices} />
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-12">
            <h2 className="font-syne text-lg font-bold text-offwhite">Already happened</h2>
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
          <p className="font-dm text-sm text-muted">While you&apos;re here — get around the island your way.</p>
          <div className="flex gap-3 font-dm text-sm font-bold text-yellow">
            <Link href="/#fleet" className="hover:underline">Scooters →</Link>
            <Link href="/explore" className="hover:underline">Explore →</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
