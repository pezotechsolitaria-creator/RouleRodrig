import type { TransferFares } from "@/lib/rides/fares";
import {
  effectiveEveningLabel,
  nightWindowLabel,
  returnDifference,
  type TransferPricing,
  type ZonedPlace,
} from "@/lib/rides/transfer";
import { centsToShortString } from "@/lib/money";

// ── ONE SET OF WORDS FOR THE AIRPORT PRICE LIST (SEO audit 2026-09-29 C2) ───
//
// These sentences lived inside app/transfers/page.tsx, so the one page that
// published the zone fares was the only page that could say them. Meanwhile
// /taxi told Google "there is no fixed price list", /fr/taxi-rodrigues said
// "il n'existe pas de grille de prix", and llms.txt said nothing at all -- three
// descriptions of one price list, and the strongest page had the wrong one.
//
// So they moved here, unchanged, and every surface that mentions an airport
// fare builds its sentence from this file: /transfers, /taxi (EN and FR),
// /fr/taxi-rodrigues, /llms.txt and /llms-full.txt. Nothing below holds a fare,
// a zone line or an hour: every number is read from the sheet that
// transfer_price_sheet() publishes, the same one that charges the booking.
//
// Pure, and free of server-only imports, because /taxi's directory
// (app/taxi/TaxiDirectory.tsx) is a client component that builds its FAQ.

export type TransferFaqItem = { q: string; a: string };

/** What the zone sentences read: the three fares and the two lines. Narrower
 *  than a whole sheet so a caller holding only those can use them. */
type ZoneLines = Pick<TransferPricing, "oneWay" | "zone1MaxKm" | "zone2MaxKm">;

// Grouped, because the rest of the site writes "Rs 1,499". centsToShortString
// already drops a trailing .00, so this only adds the separator to the whole
// part and leaves real cents alone.
export function money(cents: number): string {
  const [whole, frac] = centsToShortString(cents).split(".");
  return `Rs ${Number(whole).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** The same, grouped the way the French pages write money (toLocaleString("fr-FR")). */
export function moneyFr(cents: number): string {
  const [whole, frac] = centsToShortString(cents).split(".");
  return `Rs ${Number(whole).toLocaleString("fr-FR")}${frac ? `,${frac}` : ""}`;
}

/** "up to 7 km" / "over 7 and under 15 km" / "15 km and over", from the sheet. */
export function zoneRange(p: ZoneLines, zone: 1 | 2 | 3): string {
  if (zone === 1) return `up to ${p.zone1MaxKm} km`;
  if (zone === 2) return `over ${p.zone1MaxKm} and under ${p.zone2MaxKm} km`;
  return `${p.zone2MaxKm} km and over`;
}

/** The same three lines in French, phrased to follow a price. */
export function zoneRangeFr(p: ZoneLines, zone: 1 | 2 | 3): string {
  if (zone === 1) return `jusqu'à ${p.zone1MaxKm} km`;
  // "entre", not "de plus de … à moins de …": straight after a price, "Rs … de
  // plus" reads as "Rs … more", a surcharge on zone 1 — and bandSentenceFr uses
  // "de plus" in exactly that sense in the same answer (audit C2). The zone 1
  // and zone 3 phrases already fix both edges, so nothing is lost.
  if (zone === 2) return `entre ${p.zone1MaxKm} et ${p.zone2MaxKm} km`;
  return `à partir de ${p.zone2MaxKm} km`;
}

// ── HOW MANY PASSENGERS THE FARE COVERS (SEO audit 2026-09-29 C2) ────────────
// included_passengers is an owner-editable column of the sheet (M220, 1–20),
// and price_transfer_leg charges extras above it. /transfers typed "one
// passenger" in three places while /taxi and llms.txt read the column, so a
// sheet that raised it would have had the source page contradict them — and
// promise a surcharge the booking never takes. One phrase, read from the sheet.
type Covers = Pick<TransferPricing, "includedPassengers">;

/** "one passenger" / "2 passengers", from the sheet. */
export function passengersCovered(p: Covers): string {
  return p.includedPassengers === 1 ? "one passenger" : `${p.includedPassengers} passengers`;
}

/** "un passager" / "2 passagers", from the sheet. */
export function passengersCoveredFr(p: Covers): string {
  return p.includedPassengers === 1 ? "un passager" : `${p.includedPassengers} passagers`;
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

/** The same rule in French. The "manual" wording is the booking form's own
 *  (RIDES_COPY.fr.book.transfer.nightManual), not imported so that /taxi does
 *  not ship the whole ride dictionary for one sentence. */
function bandSentenceFr(
  band: "evening" | "night",
  mode: TransferPricing["nightMode"] | undefined,
  w: string | null,
  surcharge: number | undefined,
  multiplier: number | undefined,
): string | null {
  if (!mode || mode === "none" || !w) return null;
  const which = band === "evening" ? "du soir" : "de nuit";
  switch (mode) {
    case "manual":
      return `Les transferts ${which} (${w}) sont tarifés au cas par cas : le prix est convenu avec vous, il n’est pas fixé à l’avance.`;
    case "fixed":
      return `Les transferts ${which} (${w}) coûtent ${moneyFr(surcharge ?? 0)} de plus par trajet, compris dans le prix affiché.`;
    case "multiplier":
      return `Les transferts ${which} (${w}) sont facturés ${multiplier} fois le tarif de jour.`;
    default:
      return null;
  }
}

/** The evening window as it really applies: minus any hours the night band
 *  also claims, because night wins those in the engine. Null when night covers
 *  it entirely -- then the evening rule is never used and is not advertised. */
function eveningWindow(p: TransferPricing): string | null {
  return p.eveningFromHour != null && p.eveningToHour != null
    ? effectiveEveningLabel(
        { from: p.eveningFromHour, to: p.eveningToHour },
        { from: p.nightFromHour, to: p.nightToHour, mode: p.nightMode },
      )
    : null;
}

/**
 * M221 · the evening band, then the night band, each in its own sentence.
 * "Evening and night transfers (17:00–04:59)" was one clumsy line for what are
 * now two different rules.
 */
export function timeSentences(p: TransferPricing): string[] {
  return [
    bandSentence("Evening", p.eveningMode, eveningWindow(p), p.eveningSurcharge, p.eveningMultiplier),
    bandSentence("Night", p.nightMode, nightWindowLabel(p.nightFromHour, p.nightToHour), p.nightSurcharge, p.nightMultiplier),
  ].filter((s): s is string => !!s);
}

export function timeSentencesFr(p: TransferPricing): string[] {
  return [
    bandSentenceFr("evening", p.eveningMode, eveningWindow(p), p.eveningSurcharge, p.eveningMultiplier),
    bandSentenceFr("night", p.nightMode, nightWindowLabel(p.nightFromHour, p.nightToHour), p.nightSurcharge, p.nightMultiplier),
  ].filter((s): s is string => !!s);
}

/**
 * The owner's decision on the return package, said plainly: it saves money
 * only where the price list makes it cheaper per trip (Zone 3 at launch) and
 * is otherwise the convenience of booking both trips at once. Computed from
 * the sheet, so it stays true if the fares change.
 */
export function returnSentence(p: TransferPricing): string {
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

/** A named place from the sheet, zoned by the database, or null. */
export function transferPlace(p: TransferPricing | null, id: string): ZonedPlace | null {
  return p?.places.find((pl) => pl.id === id) ?? null;
}

/** Port Mathurin, the destination people type -- when the sheet names it. */
export function portMathurin(p: TransferPricing | null): ZonedPlace | null {
  return transferPlace(p, "port-mathurin");
}

/** Up to three landmark names that sit in a zone, for "which includes …". */
export function famousIn(p: TransferPricing, z: 1 | 2 | 3): string[] {
  return LANDMARKS.map((id) => transferPlace(p, id))
    .filter((pl): pl is ZonedPlace => !!pl && pl.zone === z)
    .slice(0, 3)
    .map((pl) => pl.label);
}

/**
 * The three one-way fares, each with its zone line, in the order a reader
 * scans them: zone 1, zone 2, and "for" zone 3.
 */
export function zoneFaresSentence(p: ZoneLines): string {
  return `${money(p.oneWay[0])} ${zoneRange(p, 1)}, ${money(p.oneWay[1])} ${zoneRange(p, 2)}, and ${money(p.oneWay[2])} for ${zoneRange(p, 3)}`;
}

export function zoneFaresSentenceFr(p: ZoneLines): string {
  return `${moneyFr(p.oneWay[0])} ${zoneRangeFr(p, 1)}, ${moneyFr(p.oneWay[1])} ${zoneRangeFr(p, 2)} et ${moneyFr(p.oneWay[2])} ${zoneRangeFr(p, 3)}`;
}

/**
 * The /transfers FAQ: built once, rendered by the page as a <dl>, emitted as
 * its FAQPage, and concatenated into /llms-full.txt. Two lists maintained
 * separately is how a site ends up publishing a question nobody can read — the
 * exact fault the category pages were fixed for.
 *
 * The price questions exist only when the price list was read (`airport` is
 * null with no service-role key, on a failed read, or with transfers switched
 * off), exactly as the price table is. An invented fare is worse than none.
 */
export function transferFaq(fares: TransferFares): TransferFaqItem[] {
  const airport = fares.airport;
  const ferry = fares.ferry != null ? money(fares.ferry) : null;
  const pm = portMathurin(airport);
  const bands = airport ? timeSentences(airport) : [];
  const night = bands.length ? bands.join(" ") : null;
  return [
    ...(airport
      ? [
          {
            q: "How much is a transfer from Plaine Corail airport?",
            a: `It depends on how far you are going by road from the airport, in three zones. One way: ${money(airport.oneWay[0])} ${zoneRange(airport, 1)}, ${money(airport.oneWay[1])} ${zoneRange(airport, 2)}, and ${money(airport.oneWay[2])} ${zoneRange(airport, 3)}${famousIn(airport, 3).length ? ` — which includes ${famousIn(airport, 3).join(", ")}` : ""}. The fare covers ${passengersCovered(airport)} and is fixed before you book rather than a meter.${ferry ? ` The ferry terminal at Port Mathurin is ${ferry}.` : ""}`,
          },
          ...(pm
            ? [
                {
                  q: "How much is a taxi from Rodrigues airport to Port Mathurin?",
                  a: `${money(airport.oneWay[pm.zone - 1])} one way. Port Mathurin is ${pm.roadKm} km from Plaine Corail by road, which puts it in Zone ${pm.zone}. Booked as a return package, it is ${money(airport.returnEach[pm.zone - 1])} each way.`,
                },
              ]
            : []),
          {
            q: "Is there a return package?",
            a: `Yes. Book the arrival and the ride back for your flight home together, and each trip is priced per direction: ${money(airport.returnEach[0])} each way in Zone 1, ${money(airport.returnEach[1])} in Zone 2 and ${money(airport.returnEach[2])} in Zone 3. ${returnSentence(airport)} Each trip is sent to a driver on its own day.`,
          },
          {
            q: "Do more passengers cost more?",
            a: `The fare includes ${passengersCovered(airport)}. Each additional passenger adds ${money(airport.extraPassengerFee)} per trip, one way or return. For a group of more than ${airport.maxPricedPassengers} the fare is agreed with you, not fixed in advance.`,
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
}
