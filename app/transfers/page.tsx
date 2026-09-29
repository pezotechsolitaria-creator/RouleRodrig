import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import AppPageHeader from "@/components/AppPageHeader";
import BookRide from "@/app/taxi/book/BookRide";
import BookingHeading from "@/app/taxi/book/BookingHeading";
import JsonLd from "@/components/JsonLd";
import { readTransferFares } from "@/lib/rides/fares";
import {
  effectiveEveningLabel,
  nightWindowLabel,
  returnDifference,
  type TransferPricing,
  type ZonedPlace,
} from "@/lib/rides/transfer";
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

export const revalidate = 600;

// Grouped, because the rest of the site writes "Rs 1,499". centsToShortString
// already drops a trailing .00, so this only adds the separator to the whole
// part and leaves real cents alone.
function money(cents: number): string {
  const [whole, frac] = centsToShortString(cents).split(".");
  return `Rs ${Number(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** "up to 7 km" / "over 7 and under 15 km" / "15 km and over", from the sheet. */
function zoneRange(p: TransferPricing, zone: 1 | 2 | 3): string {
  if (zone === 1) return `up to ${p.zone1MaxKm} km`;
  if (zone === 2) return `over ${p.zone1MaxKm} and under ${p.zone2MaxKm} km`;
  return `${p.zone2MaxKm} km and over`;
}

/** One band's rule, in the sentence a visitor needs. Null when it has none. */
function bandSentence(
  name: "Evening" | "Night",
  mode: TransferPricing["nightMode"] | undefined,
  w: string | null,
  surcharge: number | undefined,
  multiplier: number | undefined,
): string | null {
  if (!mode || mode === "none" || !w) return null;
  switch (mode) {
    case "manual":
      return `${name} transfers (${w}) are priced by hand: the fare is agreed with you, not fixed in advance.`;
    case "fixed":
      return `${name} transfers (${w}) add ${money(surcharge ?? 0)} per trip, included in the fare you are shown.`;
    case "multiplier":
      return `${name} transfers (${w}) are charged at ${multiplier}× the day fare.`;
    default:
      return null;
  }
}

/**
 * M221 · the evening band, then the night band, each in its own sentence.
 * "Evening and night transfers (17:00–04:59)" was one clumsy line for what are
 * now two different rules.
 */
function timeSentences(p: TransferPricing): string[] {
  // The evening window as it really applies: minus any hours the night band
  // also claims, because night wins those in the engine. Null when night covers
  // it entirely — then the evening rule is never used and is not advertised.
  const evening =
    p.eveningFromHour != null && p.eveningToHour != null
      ? effectiveEveningLabel(
          { from: p.eveningFromHour, to: p.eveningToHour },
          { from: p.nightFromHour, to: p.nightToHour, mode: p.nightMode },
        )
      : null;
  return [
    bandSentence("Evening", p.eveningMode, evening, p.eveningSurcharge, p.eveningMultiplier),
    bandSentence("Night", p.nightMode, nightWindowLabel(p.nightFromHour, p.nightToHour), p.nightSurcharge, p.nightMultiplier),
  ].filter((s): s is string => !!s);
}

/**
 * The owner's decision on the return package, said plainly: it saves money
 * only where the price list makes it cheaper per trip (Zone 3 at launch) and
 * is otherwise the convenience of booking both trips at once. Computed from
 * the sheet, so it stays true if the fares change.
 */
function returnSentence(p: TransferPricing): string {
  // SIGNED: a return fare above the one-way fare must read as "more", never
  // as "the same" (refused at publish, but the page must not lie if it slips).
  const diff = returnDifference(p);
  const saving = ([1, 2, 3] as const).filter((z) => diff[z - 1] > 0);
  const same = ([1, 2, 3] as const).filter((z) => diff[z - 1] === 0);
  const more = ([1, 2, 3] as const).filter((z) => diff[z - 1] < 0);
  const list = (zs: readonly number[]) =>
    zs.length === 1 ? `Zone ${zs[0]}` : `Zones ${zs.slice(0, -1).join(", ")} and ${zs[zs.length - 1]}`;
  const parts: string[] = [];
  if (saving.length) {
    parts.push(
      `In ${list(saving)} it saves ${saving
        .map((z) => `${money(diff[z - 1])} per trip (${money(p.returnEach[z - 1])} instead of ${money(p.oneWay[z - 1])})`)
        .join("; ")}.`,
    );
  }
  if (same.length) {
    parts.push(
      `In ${list(same)} it costs the same as two one-way trips — the package simply books both at once.`,
    );
  }
  if (more.length) {
    parts.push(
      `In ${list(more)} it costs ${more.map((z) => `${money(-diff[z - 1])} more per trip`).join("; ")} than booking one way each time.`,
    );
  }
  return parts.join(" ");
}

// Places a visitor has heard of, used to illustrate the zones in words. Ids,
// not fares: which zone each lands in still comes from the database.
const LANDMARKS = [
  "port-mathurin", "mourouk", "graviers", "trou-dargent", "st-francois", "oyster-bay",
  "riviere-cocos", "mont-lubin", "baie-du-nord", "la-ferme", "anse-quitor", "francois-leguat",
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
  const landmark = (id: string) => airport?.places.find((p) => p.id === id) ?? null;
  const portMathurin = landmark("port-mathurin");
  const famous = (z: 1 | 2 | 3) =>
    LANDMARKS.map(landmark).filter((p): p is ZonedPlace => !!p && p.zone === z).slice(0, 3).map((p) => p.label);
  const bands = airport ? timeSentences(airport) : [];
  const night = bands.length ? bands.join(" ") : null;

  // Built here so the visible <dl> below and the FAQPage markup are ONE list.
  // Two lists maintained separately is how a site ends up publishing a question
  // nobody can read — the exact fault the category pages were fixed for.
  const airportFaq: { q: string; a: string }[] = [
    ...(airport
      ? [
          {
            q: "How much is a transfer from Plaine Corail airport?",
            a: `It depends on how far you are going by road from the airport, in three zones. One way: ${money(airport.oneWay[0])} ${zoneRange(airport, 1)}, ${money(airport.oneWay[1])} ${zoneRange(airport, 2)}, and ${money(airport.oneWay[2])} ${zoneRange(airport, 3)}${famous(3).length ? ` — which includes ${famous(3).join(", ")}` : ""}. The fare covers one passenger and is fixed before you book rather than a meter.${ferry ? ` The ferry terminal at Port Mathurin is ${ferry}.` : ""}`,
          },
          ...(portMathurin
            ? [
                {
                  q: "How much is a taxi from Rodrigues airport to Port Mathurin?",
                  a: `${money(airport.oneWay[portMathurin.zone - 1])} one way. Port Mathurin is ${portMathurin.roadKm} km from Plaine Corail by road, which puts it in Zone ${portMathurin.zone}. Booked as a return package, it is ${money(airport.returnEach[portMathurin.zone - 1])} each way.`,
                },
              ]
            : []),
          {
            q: "Is there a return package?",
            a: `Yes. Book the arrival and the ride back for your flight home together, and each trip is priced per direction: ${money(airport.returnEach[0])} each way in Zone 1, ${money(airport.returnEach[1])} in Zone 2 and ${money(airport.returnEach[2])} in Zone 3. ${returnSentence(airport)} Each trip is sent to a driver on its own day.`,
          },
          {
            q: "Do more passengers cost more?",
            a: `The fare includes ${airport.includedPassengers === 1 ? "one passenger" : `${airport.includedPassengers} passengers`}. Each additional passenger adds ${money(airport.extraPassengerFee)} per trip, one way or return. For a group of more than ${airport.maxPricedPassengers} the fare is agreed with you, not fixed in advance.`,
          },
          ...(night
            ? [{ q: "What about evening and night arrivals?", a: night }]
            : []),
        ]
      : []),
    {
      q: "Can I book an airport transfer before I arrive in Rodrigues?",
      a: "Yes, and it is the point of this page. Give us your flight, how many passengers and how much luggage, and the driver is arranged before you land rather than found in the arrivals hall.",
    },
    {
      q: "Will the driver meet me at arrivals?",
      a: "Ask for it when you book and the driver waits inside the terminal with your name. Otherwise they meet you at the pick-up area outside.",
    },
    {
      q: "What is the airport in Rodrigues called?",
      a: "Plaine Corail, code RRG. It is officially Sir Gaétan Duval Airport and the operator still uses that name, so you will hear both — they are the same place.",
    },
    {
      q: "Can I book the return trip to the airport as well?",
      a: "Yes — choose Return package on the form and give the date of your flight home, and both trips are booked together. Or book it later the same way once your plans firm up.",
    },
  ];

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
          price, or with a guessed one, is worse than no Offer. */}
      <JsonLd
        data={{
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
                    description: `Plaine Corail airport to anywhere ${zoneRange(airport, z)} by road, one passenger, daytime. Each extra passenger ${money(airport.extraPassengerFee)}. Return package ${money(airport.returnEach[z - 1])} each way.${bands.length ? ` ${bands.join(" ")}` : ""}`,
                  })),
                },
              }
            : {}),
        }}
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
                Fares include one passenger; each extra passenger adds{" "}
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
        </div>
      </main>
    </>
  );
}
