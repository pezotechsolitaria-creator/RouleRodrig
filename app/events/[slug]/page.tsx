import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Clock, Phone, Ticket, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { ShopHeader } from "@/components/shop/ShopChrome";
import { getPublicEvent } from "@/lib/events/queries";
import { eventDateOnly, eventTimeOnly, availabilityLabel } from "@/lib/events/format";
import ReserveTickets from "@/components/events/ReserveTickets";
import ShareEvent from "@/components/events/ShareEvent";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const event = await getPublicEvent(supabase, slug);
  if (!event) return {};

  const when = eventDateOnly(event.startsAt, event.timezone);
  const description =
    event.tagline ??
    `${event.name} — ${when}${event.venueName ? ` at ${event.venueName}` : ""}, Rodrigues. Reserve your ticket online and pay at the door.`;
  const url = `${SITE_URL}/events/${event.slug}`;

  return {
    title: `${event.name} — ${when} | Roulé Rodrigues`,
    description,
    alternates: { canonical: url },
    // This page is going to live or die on WhatsApp. The preview card IS the
    // poster, so the image and the one-line description matter more here than
    // on any other page in the product.
    openGraph: {
      title: `${event.name} — ${when}`,
      description,
      url,
      type: "website",
      images: [event.coverUrl || `${SITE_URL}/og-image.jpg`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.name} — ${when}`,
      description,
      images: [event.coverUrl || `${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const event = await getPublicEvent(supabase, slug);
  if (!event) notFound();

  const url = `${SITE_URL}/events/${event.slug}`;
  const cancelled = event.phase === "cancelled";
  const ended = event.phase === "ended";
  const avail = availabilityLabel(event.remaining, event.capacity);

  // schema.org/Event. Google shows these in search and in the Events carousel,
  // which for a local concert is free reach we would otherwise have to buy.
  const eventLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    startDate: event.startsAt,
    ...(event.endsAt ? { endDate: event.endsAt } : {}),
    eventStatus: cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.description ? { description: event.description } : {}),
    ...(event.coverUrl ? { image: [event.coverUrl] } : {}),
    location: {
      "@type": "Place",
      name: event.venueName ?? "Rodrigues Island",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venueAddress ?? undefined,
        addressLocality: event.venueName ?? "Rodrigues",
        addressCountry: "MU",
      },
      ...(event.lat != null && event.lng != null
        ? { geo: { "@type": "GeoCoordinates", latitude: event.lat, longitude: event.lng } }
        : {}),
    },
    organizer: { "@type": "Organization", name: "Roulé Rodrigues", url: SITE_URL },
    ...(event.fromPrice !== null && !cancelled && !ended
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: (event.fromPrice / 100).toFixed(2),
            priceCurrency: "MUR",
            availability:
              event.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            validFrom: new Date().toISOString(),
          },
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/events" backLabel="All events" />
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Events", url: `${SITE_URL}/events` },
            { name: event.name, url },
          ]),
          eventLd,
        ]}
      />

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
              <p className="font-syne text-sm font-bold text-red-400">This event was cancelled</p>
              {event.cancelledReason && (
                <p className="mt-1 font-dm text-sm text-offwhite/85">{event.cancelledReason}</p>
              )}
              <p className="mt-1 font-dm text-xs text-muted">
                Nothing was charged online, so there is nothing to refund.
              </p>
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
                ? `Doors ${eventTimeOnly(event.doorsOpenAt, event.timezone)} · starts ${eventTimeOnly(event.startsAt, event.timezone)}`
                : eventTimeOnly(event.startsAt, event.timezone)}
            </p>
            <p className="mt-1 font-dm text-[11px] text-muted">Rodrigues time</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="flex items-center gap-2 font-dm text-sm text-offwhite">
              <MapPin size={15} className="text-yellow" /> {event.venueName ?? "Rodrigues"}
            </p>
            {event.venueAddress && <p className="mt-1 font-dm text-xs text-muted">{event.venueAddress}</p>}
            {event.lat != null && event.lng != null && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${event.lat},${event.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-dm text-xs font-semibold text-yellow hover:underline"
              >
                Open in Maps →
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
              <p className="font-syne text-sm font-bold text-offwhite">This event has finished</p>
              <Link href="/events" className="mt-2 inline-block font-dm text-sm font-bold text-yellow hover:underline">
                See what&apos;s coming up →
              </Link>
            </div>
          ) : (
            <ReserveTickets
              storeId={event.storeId}
              storeName={event.name}
              ticketTypes={event.ticketTypes}
              paymentNote={null}
              disabled={cancelled}
            />
          )}
        </div>

        <div className="mt-5">
          <ShareEvent name={event.name} url={url} startsAt={event.startsAt} timezone={event.timezone} venue={event.venueName} />
        </div>

        {event.supportPhone && (
          <p className="mt-5 flex items-center gap-2 font-dm text-xs text-muted">
            <Phone size={13} /> Questions about this event: {event.supportPhone}
          </p>
        )}
        {event.terms && <p className="mt-3 font-dm text-[11px] leading-relaxed text-muted/80">{event.terms}</p>}
      </div>
    </main>
  );
}
