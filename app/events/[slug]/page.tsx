import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { getPublicEvent } from "@/lib/events/queries";
import { eventDateOnly } from "@/lib/events/format";
import EventsBackBar from "@/components/events/EventsBackBar";
import EventDetail from "@/components/events/EventDetail";

export const dynamic = "force-dynamic";

// A single-evening event with no ends_at stays "in_progress" forever in
// phaseOf() — its start passed and nothing ever ends it. That is how a
// concert sat in Google 17 days after it happened still marked as scheduled,
// with a live Offer whose validFrom opened AFTER the music started — the
// exact stale-event pattern Google's event guidelines penalise. phaseOf()
// mirrors event_phase() in SQL, so its semantics are not this page's to
// change; what IS this page's to decide is what it tells crawlers. 24h of
// grace after the start covers any real evening plus timezone slack.
function eventIsOver(e: { phase: string; startsAt: string; endsAt: string | null }): boolean {
  if (e.phase === "ended") return true;
  if (e.endsAt) return false; // a real end time exists; phaseOf handles it
  return new Date(e.startsAt).getTime() < Date.now() - 24 * 60 * 60 * 1000;
}

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
    `${event.name} — ${when}${event.venueName ? ` at ${event.venueName}` : ""}, Rodrigues. Reserve your ticket online — your QR code is your ticket at the gate.`;
  const url = `${SITE_URL}/events/${event.slug}`;

  return {
    title: `${event.name} — ${when} | Roulé Rodrigues`,
    description,
    alternates: { canonical: url },
    // A finished or cancelled event has no business in the index: searchers
    // land on tickets they cannot buy, and Google treats lingering scheduled
    // markup on past events as spammy structured data. follow stays true so
    // the page's links (venue, events index) keep passing.
    ...(eventIsOver(event) || event.phase === "cancelled"
      ? { robots: { index: false, follow: true } }
      : {}),
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
  // eventIsOver, not phase === "ended": an event with no ends_at is never
  // "ended" in phaseOf() — see the note above generateMetadata.
  const ended = eventIsOver(event);

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
      <EventsBackBar backHref="/events" label="allEvents" />
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

      <EventDetail event={event} url={url} />
    </main>
  );
}
