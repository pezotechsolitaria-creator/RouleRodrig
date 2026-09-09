import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "@/app/taxi/book/BookRide";
import BookingHeading from "@/app/taxi/book/BookingHeading";
import JsonLd from "@/components/JsonLd";
import { readFlatFares } from "@/lib/rides/fares";
import { centsToShortString } from "@/lib/money";

// /transfers — the "planning ahead" half of getting around.
//
// It exists because /taxi could not do this job. That page is a DIRECTORY of
// drivers to ring right now; this one is a journey you arrange before you
// arrive.
//
// ── WHAT THIS PAGE USED TO BE, AND WHY NONE OF IT IS LEFT ───────────────────
//
// It was a WhatsApp form that touched none of the ride engine. It collected
// from/to as FREE TEXT with no coordinates, so it could never be priced —
// quote_ride() refuses with `need_locations` unless both ends carry lat/lng. It
// captured no phone number, produced no reference, could not be dispatched and
// could not be tracked. Its only real output was a wa.me link.
//
// It also recorded nothing at all: it POSTed `target` where /api/leads reads
// `target_name`, so every enquiry since June was refused with a 400 that
// nothing ever looked at. On production the day it was found — taxi 11 leads,
// food_concierge 8, stay_eat_do 6, tiroule_miss 2, transfer ZERO.
//
// Meanwhile `ride_requests` already modelled every field a transfer needs:
// service, scheduled_at, both ends with coordinates, passengers, luggage,
// flight_ref, meet_greet, name, phone, email — and ride_pricing already carried
// a seeded flat fare for `airport`. There was a working engine, and a parallel
// form beside it that ignored the whole thing.
//
// So this page keeps its URL and its metadata, which it earns on search, and
// everything between the header and the form is gone: a 126px h1 that wrapped
// to four lines, a 29px eyebrow, a 48px subtitle restating the h1, a 136px
// reassurance grid sitting between the visitor and the first field, and a 118px
// cross-sell offering a way out of a form already started. 457px of chrome
// around a form that could not work.
//
// One of those reassurances was also untrue: "Vehicle sized to your luggage".
// taxi_drivers.luggage_capacity is stored and never gates anything — only seats
// and the handles_* booleans do. It is not a promise the data can keep.
//
// ── AND THE DIRECTION ───────────────────────────────────────────────────────
// The old page said "Plan your journey before you land" and "Met at arrivals"
// above a form that could not express an arrival. BookRide hardcoded the
// airport as the DROP-OFF, so the only journey either surface could describe
// was one LEAVING the island. `initialDirection="from"` starts this page where
// its own visitors start: at Plaine Corail, needing to get somewhere.

export const revalidate = 600;

// 152 characters. The old one was 188 and truncated mid-clause in the SERP,
// and led with "Book an" rather than with the thing a searcher is comparing.
const DESCRIPTION =
  "Airport transfer in Rodrigues — Plaine Corail to Port Mathurin or your guest house, at a flat fare. Give us your flight number and a driver meets you.";

export const metadata: Metadata = {
  title: "Airport transfers in Rodrigues | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/transfers` },
  openGraph: {
    title: "Airport transfers in Rodrigues | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/transfers`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function TransfersPage() {
  // The fares this platform guarantees, read from ride_pricing. Null when the
  // read is unavailable (no service-role key locally), in which case the page
  // simply says nothing about price rather than inventing one.
  const fares = await readFlatFares();
  const airport = fares.airport != null ? `Rs ${centsToShortString(fares.airport)}` : null;
  const ferry = fares.ferry != null ? `Rs ${centsToShortString(fares.ferry)}` : null;

  return (
    <>
      {/* Was the marketing <Navbar>: fixed, 78px, and on a phone it carried no
          back control at all — only a saved-hearts icon and a burger. The 96px
          of pt-24 underneath existed solely to clear it. */}
      <AppPageHeader showBack backHref="/" />

      {/* ── STRUCTURED DATA, WHICH THIS PAGE HAD NONE OF ──────────────────
          Not one JSON-LD block on the page that owns "airport transfer
          Rodrigues", while /taxi beside it carries Service, Organization and
          Place. The Offer is the point: a flat fare is exactly the shape
          schema.org can state precisely, and it is what an assistant asked
          "how much is a transfer from Rodrigues airport" needs in order to
          answer with a number instead of a paraphrase.

          Priced only when the fare was actually read. An Offer with no price,
          or with a guessed one, is worse than no Offer. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/transfers#service`,
          name: "Airport transfer in Rodrigues",
          serviceType: "Airport transfer",
          description: DESCRIPTION,
          url: `${SITE_URL}/transfers`,
          areaServed: {
            "@type": "Place",
            name: "Rodrigues Island, Mauritius",
          },
          provider: { "@id": `${SITE_URL}/#business` },
          ...(fares.airport != null
            ? {
                offers: {
                  "@type": "Offer",
                  priceCurrency: "MUR",
                  price: (fares.airport / 100).toFixed(2),
                  availability: "https://schema.org/InStock",
                  url: `${SITE_URL}/transfers`,
                  priceSpecification: {
                    "@type": "PriceSpecification",
                    priceCurrency: "MUR",
                    price: (fares.airport / 100).toFixed(2),
                    valueAddedTaxIncluded: true,
                    description:
                      "Flat fare, Plaine Corail airport to any address on Rodrigues",
                  },
                },
              }
            : {}),
        }}
      />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-10 pt-3 text-offwhite">
        <div className="mx-auto max-w-lg">
          <BookingHeading variant="transfer" />

          <div className="mt-3">
            <BookRide initialService="airport" initialDirection="from" />
          </div>

          {/* BELOW the form, on purpose. The note atop this file explains why
              nothing may sit between the header and the first field — that
              decision stands. But the page rendered ~180 characters of text
              total, which to a crawler is an empty page with a good title:
              nothing here matched "airport transfer rodrigues" beyond the
              metadata. One paragraph, after the form, claims only what the
              ride engine actually supports (flight_ref, meet_greet,
              passengers, luggage, scheduled_at) and prices the taxi way —
              confirmed with you, never invented here. */}
          <p className="mt-8 font-dm text-sm leading-relaxed text-muted">
            Airport transfers in Rodrigues, arranged before you land: tell us
            your flight, passengers and luggage, and a local driver meets you
            at Plaine Corail airport &mdash; officially Plaine Corail
            (RRG), still called Sir Ga&eacute;tan Duval by the operator, and
            you will hear both &mdash; and takes you to Port Mathurin, your
            guest house or anywhere on the island. Book the return trip to the
            airport the same way.
          </p>

          {/* ── THE PRICE, WHICH WAS NOWHERE ────────────────────────────────
              ride_pricing has held a flat_fare for `airport` and `ferry` since
              August. quote_ride() returns those unchanged, so they are what a
              customer is actually charged -- and they appeared in no indexable
              HTML anywhere on this site. A transfer page with no price is the
              one question a visitor came to answer, unanswered.

              Rendered only when the read succeeded. A page with no price is
              worse than one with a price; a page with an INVENTED price is
              worse than both. */}
          {airport ? (
            <div className="mt-5 rounded-2xl border border-yellow/35 bg-yellow/[0.07] px-4 py-3.5">
              <p className="font-syne text-base font-bold text-offwhite">
                {airport} flat, airport to anywhere on Rodrigues
              </p>
              <p className="mt-1.5 font-dm text-sm leading-relaxed text-muted">
                One fare, agreed before you book, for the whole journey from
                Plaine Corail to your address &mdash; not a meter.
                {ferry ? ` The ferry terminal at Port Mathurin is ${ferry}.` : ""}{" "}
                Rides that are not transfers are priced by distance instead.
              </p>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
