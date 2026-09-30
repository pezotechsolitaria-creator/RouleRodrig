import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "@/app/taxi/book/BookRide";
import BookingHeading from "@/app/taxi/book/BookingHeading";
import JsonLd from "@/components/JsonLd";
import { readTransferFares } from "@/lib/rides/fares";
import type { ZonedPlace } from "@/lib/rides/transfer";
import { sellerLd } from "@/lib/schema";
import { FR_PAGES } from "@/lib/nav/hubs";
import {
  money,
  passengersCovered,
  returnSentence,
  timeSentences,
  transferFaq,
  zoneRange,
} from "@/lib/transfers-faq";

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
// So this page keeps its URL and its metadata, which it earns on search, and
// everything between the header and the form is gone: nothing may sit between
// the visitor and the first field. What a crawler and an assistant need — the
// prices, the zones, the answers — lives BELOW the form.
//
// One old reassurance was also untrue: "Vehicle sized to your luggage".
// taxi_drivers.luggage_capacity is stored and never gates anything — only seats
// and the handles_* booleans do. It is not a promise the data can keep.
//
// ── AND THE DIRECTION ───────────────────────────────────────────────────────
// `initialDirection="from"` starts this page where its own visitors start: at
// Plaine Corail, needing to get somewhere.
//
// ── M220 · PRICED BY ZONE ───────────────────────────────────────────────────
// The owner's model: zones by ROAD distance from the airport, one way or a
// return package priced per direction, plus a fee per extra passenger, and a
// night rule he chooses. Every number below comes from transfer_price_sheet()
// — the same price list and the same zone function that charge the booking —
// so the page cannot quote Port Mathurin in a zone the booking disagrees with.
//
// The sentences that say those numbers (money, zoneRange, the evening/night
// bands, the return package, the FAQ) live in lib/transfers-faq.ts since the
// SEO audit of 2026-09-29 (C2): /taxi, /fr/taxi-rodrigues and /llms.txt state
// the same fares, and they must say them the way this page does.

export const revalidate = 600;

// Where somebody who has sorted their arrival goes next (C5). The French twin
// of /taxi is the French page that answers the same arrival.
//
// It is labelled with what it IS, not a bare "En français" (C13): under
// "Related", that reads as this page in French, and /fr/taxi-rodrigues is the
// hreflang twin of /taxi, not of /transfers — the rule already applied on
// /browse/getting-around. The title is the one the /fr hub gives it, so the
// two cannot name one page differently; the anchor also carries its subject.
const FR_TAXI_TITLE =
  FR_PAGES.find((p) => p.href === "/fr/taxi-rodrigues")?.title ?? "Taxi et transfert aéroport";
const RELATED: { href: string; label: string; lang?: string }[] = [
  { href: "/taxi", label: "Taxis on Rodrigues" },
  { href: "/browse/car", label: "Car delivered to the airport" },
  { href: "/fr/taxi-rodrigues", label: `${FR_TAXI_TITLE}, en français`, lang: "fr" },
  { href: "/blog/how-to-get-around-rodrigues", label: "How to get around Rodrigues" },
];

const FALLBACK_DESCRIPTION =
  "Rodrigues airport transfers at fixed zone fares: Plaine Corail to Port Mathurin or your guest house, one way or return. A driver meets your flight.";

export async function generateMetadata(): Promise<Metadata> {
  const { airport } = await readTransferFares();
  // The lowest one-way fare, read — never typed here.
  const description = airport
    ? `Rodrigues airport transfers from ${money(Math.min(...airport.oneWay))}: fixed zone fares, Plaine Corail to Port Mathurin or your guest house, one way or return.`
    : FALLBACK_DESCRIPTION;
  return {
    title: "Airport transfers in Rodrigues | Roule Rodrigues",
    description,
    alternates: { canonical: `${SITE_URL}/transfers` },
    openGraph: {
      title: "Airport transfers in Rodrigues | Roule Rodrigues",
      description,
      url: `${SITE_URL}/transfers`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function TransfersPage() {
  // Null when the read is unavailable (no service-role key locally) or the
  // owner has switched airport transfers off: the page then says nothing about
  // price rather than inventing one.
  const fares = await readTransferFares();
  const airport = fares.airport;
  const ferry = fares.ferry != null ? money(fares.ferry) : null;

  const byZone = (z: 1 | 2 | 3): ZonedPlace[] => (airport?.places ?? []).filter((p) => p.zone === z);
  const bands = airport ? timeSentences(airport) : [];

  // ONE list: the visible <dl> below, the FAQPage markup and /llms-full.txt
  // all read what transferFaq() returns (lib/transfers-faq.ts).
  const airportFaq = transferFaq(fares);

  const oneWayLow = airport ? Math.min(...airport.oneWay) : null;
  const oneWayHigh = airport ? Math.max(...airport.oneWay) : null;

  return (
    <>
      {/* Was the marketing <Navbar>: fixed, 78px, and on a phone it carried no
          back control at all — only a saved-hearts icon and a burger. */}
      <AppPageHeader showBack backHref="/" />

      {/* ── STRUCTURED DATA ──────────────────────────────────────────────
          Service, with the zone fares as an AggregateOffer: low and high
          one-way price plus one Offer per zone, each saying what it covers.
          That is the shape an assistant asked "how much is a transfer from
          Rodrigues airport" needs to answer with numbers instead of a
          paraphrase.

          Priced only when the price list was actually read. An Offer with no
          price, or with a guessed one, is worse than no Offer.

          The seller node rides along (SEO audit 2026-09-29 T9): the provider
          is an @id pointer, and a pointer to a node the page never defines
          is one a crawler cannot resolve. Same @id as the homepage graph, so
          the two are one entity. */}
      <JsonLd
        data={[
          { "@context": "https://schema.org", ...sellerLd() },
          {
            "@context": "https://schema.org",
            "@type": "Service",
            "@id": `${SITE_URL}/transfers#service`,
            name: "Airport transfer in Rodrigues",
            serviceType: "Airport transfer",
            description: FALLBACK_DESCRIPTION,
            url: `${SITE_URL}/transfers`,
            areaServed: {
              "@type": "Place",
              name: "Rodrigues Island, Mauritius",
            },
            provider: { "@id": `${SITE_URL}/#business` },
            ...(airport != null && oneWayLow != null && oneWayHigh != null
              ? {
                  offers: {
                    "@type": "AggregateOffer",
                    priceCurrency: "MUR",
                    lowPrice: (oneWayLow / 100).toFixed(2),
                    highPrice: (oneWayHigh / 100).toFixed(2),
                    offerCount: 3,
                    availability: "https://schema.org/InStock",
                    url: `${SITE_URL}/transfers`,
                    offers: ([1, 2, 3] as const).map((z) => ({
                      "@type": "Offer",
                      name: `Zone ${z} airport transfer, one way`,
                      priceCurrency: "MUR",
                      price: (airport.oneWay[z - 1] / 100).toFixed(2),
                      availability: "https://schema.org/InStock",
                      url: `${SITE_URL}/transfers`,
                      // The passenger count is the sheet's, not typed (C2).
                      description: `Plaine Corail airport to anywhere ${zoneRange(airport, z)} by road, ${passengersCovered(airport)}, daytime. Each extra passenger ${money(airport.extraPassengerFee)}. Return package ${money(airport.returnEach[z - 1])} each way.${bands.length ? ` ${bands.join(" ")}` : ""}`,
                    })),
                  },
                }
              : {}),
          },
        ]}
      />

      {/* FAQPage, from the SAME airportFaq array the <dl> below renders — so
          the markup can only ever describe questions a visitor can read. That
          is Google's requirement and it is the fault this site has already been
          bitten by: /browse/stays and /browse/tours once published eight
          driving-licence questions that appeared nowhere in their text. */}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${SITE_URL}/transfers#faq`,
          mainEntity: airportFaq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-10 pt-3 text-offwhite">
        <div className="mx-auto max-w-lg">
          <BookingHeading variant="transfer" />

          <div className="mt-3">
            <BookRide initialService="airport" initialDirection="from" />
          </div>

          {/* BELOW the form, on purpose: nothing may sit between the header
              and the first field. One paragraph that claims only what the ride
              engine actually supports (flight_ref, meet_greet, passengers,
              luggage, scheduled_at, return packages). */}
          <p className="mt-8 font-dm text-sm leading-relaxed text-muted">
            Airport transfers in Rodrigues, arranged before you land: tell us
            your flight, passengers and luggage, and a local driver meets you
            at Plaine Corail airport &mdash; officially Plaine Corail
            (RRG), still called Sir Ga&eacute;tan Duval by the operator, and
            you will hear both &mdash; and takes you to Port Mathurin, your
            guest house or anywhere on the island. Book the ride back for your
            flight home at the same time as a return package.
          </p>

          {/* ── THE PRICES, BY ZONE ─────────────────────────────────────────
              Rendered only when the price list was read. A page with no price
              is worse than one with a price; a page with an INVENTED price is
              worse than both. */}
          {airport ? (
            <section className="mt-5 rounded-2xl border border-yellow/35 bg-yellow/[0.07] px-4 py-4">
              <h2 className="font-syne text-base font-bold text-offwhite">
                Airport transfer prices
              </h2>
              <table className="mt-3 w-full font-dm text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="pb-1.5 pr-2 font-normal">By road from the airport</th>
                    <th className="pb-1.5 pr-2 text-right font-normal">One way</th>
                    <th className="pb-1.5 text-right font-normal">Return, each way</th>
                  </tr>
                </thead>
                <tbody>
                  {([1, 2, 3] as const).map((z) => (
                    <tr key={z} className="border-t border-white/10">
                      <td className="py-2 pr-2 text-offwhite/90">
                        <span className="font-semibold text-offwhite">Zone {z}</span>
                        <span className="block text-xs text-muted">{zoneRange(airport, z)}</span>
                      </td>
                      <td className="py-2 pr-2 text-right font-semibold text-offwhite">
                        {money(airport.oneWay[z - 1])}
                      </td>
                      <td className="py-2 text-right text-offwhite/90">
                        {money(airport.returnEach[z - 1])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-dm text-sm leading-relaxed text-muted">
                Fares include {passengersCovered(airport)}; each extra passenger adds{" "}
                {money(airport.extraPassengerFee)} per trip. The fare is fixed before
                you book &mdash; not a meter &mdash; and you pay the driver.
                {ferry ? ` The ferry terminal at Port Mathurin is ${ferry}.` : ""}
              </p>
              {/* One line per rule, so each can be read on its own: the return
                  package (and where it actually saves money — the owner's
                  decision is that it does in Zone 3 only), then the evening
                  and night bands. */}
              <ul className="mt-2 list-disc space-y-1 pl-5 font-dm text-sm leading-relaxed text-muted">
                <li>
                  Return package: the arrival and the ride back booked together,
                  priced per direction. {returnSentence(airport)}
                </li>
                {bands.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── WHICH ZONE AM I IN? ─────────────────────────────────────────
              The question the table raises, answered with the island's own
              place names and their measured road distances — straight from the
              database, zoned by the function that charges. */}
          {airport && airport.places.length > 0 ? (
            <section className="mt-9">
              <h2 className="font-syne text-lg font-bold text-offwhite">
                Which zone is my hotel in?
              </h2>
              <div className="mt-4 space-y-4">
                {([1, 2, 3] as const).map((z) =>
                  byZone(z).length ? (
                    <div key={z}>
                      <h3 className="font-dm text-sm font-bold text-offwhite">
                        Zone {z} &middot; {money(airport.oneWay[z - 1])} one way
                      </h3>
                      <p className="mt-1 font-dm text-sm leading-relaxed text-muted">
                        {byZone(z).map((p) => `${p.label} (${p.roadKm} km)`).join(", ")}
                      </p>
                    </div>
                  ) : null,
                )}
              </div>
              <p className="mt-3 font-dm text-xs text-muted">
                Somewhere else? Choose it on the map in the form above and the
                fare is worked out from the road distance.
              </p>
            </section>
          ) : null}

          {/* ── THE QUESTIONS SOMEBODY LANDING AT PLAINE CORAIL ACTUALLY ASKS ──
              Every answer is a fact this page establishes — the zone fares
              from the price list, the meet-and-greet and flight reference the
              ride engine supports, and the airport's two names. The price
              questions are omitted entirely when the price list could not be
              read, exactly as the price table is. */}
          <section className="mt-9">
            <h2 className="font-syne text-lg font-bold text-offwhite">
              Airport transfers, answered
            </h2>
            <dl className="mt-4 space-y-5">
              {airportFaq.map((f) => (
                <div key={f.q}>
                  <dt className="font-dm text-sm font-bold text-offwhite">{f.q}</dt>
                  <dd className="mt-1.5 font-dm text-sm leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── RELATED (SEO audit 2026-09-29 C5) ───────────────────────────
              The SSR HTML of this page had exactly two links, Back and
              Account: the site's most citable price page passed no authority
              on and led nowhere. One line, at the very foot, so nothing moves
              between the header and the first field and the nav-scope
              decision to hide the chrome here stands. min-h-11: each link is
              a separate target, not a word in a sentence. */}
          <nav aria-label="Related" className="mt-9 border-t border-white/10 pt-4">
            <p className="font-dm text-xs uppercase tracking-wide text-muted">Related</p>
            <ul className="mt-1 flex flex-wrap gap-x-5 font-dm text-sm">
              {RELATED.map((l) => (
                <li key={l.href} lang={l.lang}>
                  <Link
                    href={l.href}
                    hrefLang={l.lang}
                    className="inline-flex min-h-11 items-center text-yellow/80 transition-colors hover:text-yellow"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
