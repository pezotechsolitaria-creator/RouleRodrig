import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  contentWasRead,
  eventsPageItemCount,
  knownPublicEventCount,
  robotsWhileEmpty,
} from "@/lib/listing-gates";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { listPublicEvents, splitByTime } from "@/lib/events/queries";
import { getContent } from "@/lib/content";
import EventsBackBar from "@/components/events/EventsBackBar";
import EventsListing from "@/components/events/EventsListing";

// Dynamic, not ISR: the number on the card is "143 tickets remaining", and a
// stale count is worse than a slow page — it is the one thing a visitor makes a
// decision on. Same reasoning as /shop's "Open now" badge.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Concerts, sega nights, markets and festivals in Rodrigues Island. Reserve your ticket online in seconds — your QR code is your ticket at the gate.";

// One read for both the metadata and the page — cache() is per request.
const loadEvents = cache(async () => {
  const supabase = await createClient();
  return Promise.all([listPublicEvents(supabase), getContent()]);
});

// `noindex, follow` while there is nothing on it at all — no public event and
// no titled notice (SEO audit 2026-09-29 C16/T4). "Nothing on sale right now"
// was 200, indexable and at priority 0.8 in the sitemap. The same count gates
// the sitemap entry, so the two cannot disagree; see lib/listing-gates.ts.
// Both reads answer "empty" when they fail — listPublicEvents() with [],
// getContent() with its defaults — so neither may noindex the page on its own
// say-so: see knownPublicEventCount and contentWasRead.
export async function generateMetadata(): Promise<Metadata> {
  const [all, content] = await loadEvents();
  const events = await knownPublicEventCount(await createClient(), all.length);
  const notices = contentWasRead(content) ? content.events : null;
  return {
    title: "What's On in Rodrigues | Events & Tickets | Roule Rodrigues",
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/events` },
    ...robotsWhileEmpty(eventsPageItemCount(events, notices)),
    openGraph: {
      title: "What's On in Rodrigues — Events & Tickets",
      description: DESCRIPTION,
      url: `${SITE_URL}/events`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function EventsPage() {
  const [all, content] = await loadEvents();
  const { upcoming, past } = splitByTime(all);
  // The owner's free-text noticeboard, which used to be a second page called
  // Events. A blank title is a half-created row, not a listing.
  const notices = content.events.filter((e) => e.title?.trim());

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <EventsBackBar backHref="/" label="home" />

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

      {/* The server's clock, handed down: the countdown badge is rendered by a
          client component, and a phone with a wrong clock must not hydrate a
          different day from the one that was sent. */}
      <EventsListing upcoming={upcoming} past={past} notices={notices} now={new Date().getTime()} />
    </main>
  );
}
