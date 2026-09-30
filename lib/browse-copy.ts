import type { CategoryNote } from "@/components/browse/CategoryNotes";
import type { TransferPricing } from "@/lib/rides/transfer";
import { deliveryFee, type DeliveryPricedCategory } from "@/lib/booking-pricing";
import { IN_PERSON_SENTENCE } from "@/lib/experiences";
import { fleetFromPrice, isSellableFleetItem } from "@/lib/site-data";
import { metaDescription } from "@/lib/meta-description";
import { fitTitle } from "@/lib/fit-title";
import { SITE_NAME } from "@/lib/site";
import { zoneFaresSentence, zoneFaresSentenceFr } from "@/lib/transfers-faq";

// ── THE SENTENCES /browse PRINTS, BUILT FROM WHAT IT READS ──────────────────
//
// SEO audit 2026-09-29. /browse/getting-around said "A car is from Rs 1,999"
// while /browse/car said Rs 1,899: a price typed into a note on 9 Sept and
// wrong the next morning. Same shape as the Rs 599/699 scooter drift recorded
// in lib/site-data.ts. Every figure here is a parameter, and the tests fail on
// any Rs amount that is not one of them.
//
// Pure and string-only, so the tests can read exactly what the page prints.

const rsEn = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
/** French grouping, "Rs 1 899", as the /fr pages write it. */
const rsFr = (n: number) => `Rs ${n.toLocaleString("fr-FR")}`;

type FleetRow = { price: string; category?: string | null };
type CategoryRow = { id: string; enabled?: boolean };

/**
 * The cheapest daily rate in one vehicle category, or null.
 *
 * fleetFromPrice() — the helper the /fr pages price themselves with — falls
 * back to Rs 699 when a category has nothing sellable, which is right for a
 * scooter title and wrong for a sentence about cars. Null here means "say no
 * number". A category the owner has switched off is null too: /browse/car then
 * says cars are unavailable, and a note quoting their price would disagree.
 */
export function categoryFrom(
  fleet: FleetRow[],
  category: string,
  categories?: CategoryRow[],
): number | null {
  if (categories && !categories.find((c) => c.id === category)?.enabled) return null;
  const sellable = fleet.some(
    (f) => (f.category ?? "scooter") === category && isSellableFleetItem(f),
  );
  return sellable ? fleetFromPrice(fleet, category) : null;
}

type AirportFares = Pick<
  TransferPricing,
  "oneWay" | "zone1MaxKm" | "zone2MaxKm" | "includedPassengers"
>;

/**
 * The three notes under /browse/getting-around.
 *
 * "Taking a taxi" said there is no fixed price list on Rodrigues, while
 * /transfers publishes one (C2). The honest answer has two parts, and this is
 * both: airport transfers have fixed zone fares — read from the price list
 * /transfers and the booking use, or not stated at all — and any other ride is
 * quoted by the driver and accepted before it is booked. Payment follows
 * /legal/refunds §10 and /transfers: you pay the driver.
 *
 * The zone line is lib/transfers-faq.ts's, the words /transfers and /taxi say
 * it in: one price list, one sentence. Extra passengers, return trips and the
 * evening and night bands are left to /transfers, which states them from the
 * same sheet — "any", because a sheet can have no evening band at all.
 */
export function gettingAroundNotes(o: {
  carFrom: number | null;
  scooterFrom: number | null;
  airport: AirportFares | null;
}): CategoryNote[] {
  const { carFrom: car, scooterFrom: scooter, airport } = o;

  const onTheLeft = "On Rodrigues you drive on the left, the same as Mauritius.";
  const onTheLeftFr = "À Rodrigues, on roule à gauche, comme à Maurice.";
  const driving =
    car && scooter
      ? `A car is from ${rsEn(car)} a day and a scooter from ${rsEn(scooter)}, both booked direct with local owners. ${onTheLeft}`
      : car
        ? `A car is from ${rsEn(car)} a day, booked direct with local owners. ${onTheLeft}`
        : scooter
          ? `A scooter is from ${rsEn(scooter)} a day, booked direct with local owners. ${onTheLeft}`
          : `Cars and scooters are booked direct with local owners. ${onTheLeft}`;
  const drivingFr =
    car && scooter
      ? `Une voiture à partir de ${rsFr(car)} par jour, un scooter à partir de ${rsFr(scooter)}, réservés directement auprès de propriétaires de l’île. ${onTheLeftFr}`
      : car
        ? `Une voiture à partir de ${rsFr(car)} par jour, réservée directement auprès de propriétaires de l’île. ${onTheLeftFr}`
        : scooter
          ? `Un scooter à partir de ${rsFr(scooter)} par jour, réservé directement auprès de propriétaires de l’île. ${onTheLeftFr}`
          : `Voitures et scooters se réservent directement auprès de propriétaires de l’île. ${onTheLeftFr}`;

  const otherRides =
    "For any other ride, a driver quotes a fare and you accept it before anything is booked. Either way, you pay the driver.";
  const otherRidesFr =
    "Pour tout autre trajet, un chauffeur vous propose un prix, que vous acceptez avant toute réservation. Dans les deux cas, vous payez le chauffeur.";
  // The sheet says how many people the fare covers; this does not assume one.
  const n = airport?.includedPassengers ?? 1;
  const covers = n > 1 ? `up to ${n} passengers` : "one passenger";
  const coversFr = n > 1 ? `jusqu’à ${n} passagers` : "un passager";
  const taxi = airport
    ? `Airport transfers from Plaine Corail have fixed fares by zone, measured by road: ${zoneFaresSentence(airport)}, one way for ${covers} in the daytime. Extra passengers, return trips and any evening or night rule are on the airport transfers page. ${otherRides}`
    : `Airport transfers from Plaine Corail have fixed fares by zone, measured by road, listed on the airport transfers page. ${otherRides}`;
  const taxiFr = airport
    ? `Les transferts depuis l’aéroport de Plaine Corail ont un tarif fixe par zone, selon la distance par la route : ${zoneFaresSentenceFr(airport)}, en aller simple pour ${coversFr} en journée. Passagers supplémentaires, allers-retours et éventuels tarifs du soir ou de nuit : tout est sur la page des transferts aéroport. ${otherRidesFr}`
    : `Les transferts depuis l’aéroport de Plaine Corail ont un tarif fixe par zone, selon la distance par la route, indiqué sur la page des transferts aéroport. ${otherRidesFr}`;

  return [
    { h2: "Driving yourself", h2Fr: "Conduire vous-même", body: driving, bodyFr: drivingFr },
    { h2: "Taking a taxi", h2Fr: "Prendre un taxi", body: taxi, bodyFr: taxiFr },
    {
      h2: "Which one suits your trip",
      h2Fr: "Lequel choisir",
      body:
        "A scooter is the cheapest way to cover the island in dry weather. A car earns its cost with a family, a longer stay or the rainy season. A taxi suits an airport run or an evening out.",
      bodyFr:
        "Le scooter est le moyen le moins cher de parcourir l’île par beau temps. La voiture se justifie en famille, pour un long séjour ou en saison des pluies. Le taxi convient pour un transfert à l’aéroport ou une sortie le soir.",
    },
  ];
}

// ── THE PRICE RANGE ON /browse/stays AND /browse/tours ──────────────────────
//
// Both first notes were typed: "Rs 1,000 to about Rs 7,000" a night and "from
// about Rs 700 to Rs 1,000 per person" a trip. True on the day they were
// written; then Île aux Cocos went up on /browse/tours at Rs 1,999 and the
// tours sentence was wrong beside its own card — the drift SEO audit
// 2026-09-29 C1 found on /browse/getting-around. The range is now read from
// the same placePrice() the cards and the markup use, and a page with nothing
// priced says where the price is instead of naming one.

/** The lowest and highest listed price, or null when nothing is priced. */
function spanOf(prices: readonly (number | null | undefined)[]): { lo: number; hi: number } | null {
  const p = prices.filter((n): n is number => typeof n === "number" && n > 0);
  return p.length ? { lo: Math.min(...p), hi: Math.max(...p) } : null;
}

export function stayCostNote(prices: readonly (number | null | undefined)[]): CategoryNote {
  const s = spanOf(prices);
  const perPerson =
    "A few places quote self-catering per person instead of per room — the card tells you which.";
  const perPersonFr =
    "Certaines adresses affichent un tarif par personne en formule cuisine plutôt qu’un prix par chambre : c’est indiqué sur la fiche.";
  return {
    h2: "What a room costs on Rodrigues",
    h2Fr: "Combien coûte une chambre à Rodrigues",
    body: !s
      ? `The nightly price is on each card. ${perPerson}`
      : s.lo === s.hi
        ? `Nightly prices on this page are around ${rsEn(s.lo)}. ${perPerson}`
        : `Nightly prices on this page start around ${rsEn(s.lo)} and run to about ${rsEn(s.hi)}, depending on whether you want a room or a whole house to yourself. ${perPerson}`,
    bodyFr: !s
      ? `Le prix par nuit est indiqué sur chaque fiche. ${perPersonFr}`
      : s.lo === s.hi
        ? `Les prix par nuit sur cette page tournent autour de ${rsFr(s.lo)}. ${perPersonFr}`
        : `Les prix par nuit sur cette page vont d’environ ${rsFr(s.lo)} à ${rsFr(s.hi)}, selon que vous cherchez une chambre ou une maison entière. ${perPersonFr}`,
  };
}

export function tripCostNote(prices: readonly (number | null | undefined)[]): CategoryNote {
  const s = spanOf(prices);
  const card = "The price and, where the skipper has set one, the duration are on each card.";
  const cardFr = "Le prix et, lorsqu’elle est indiquée, la durée figurent sur chaque fiche.";
  return {
    h2: "What a boat trip costs",
    h2Fr: "Combien coûte une sortie en mer",
    body: !s
      ? `Trips on this page are priced per person, and most last around an hour. ${card}`
      : s.lo === s.hi
        ? `Trips on this page are about ${rsEn(s.lo)} per person, and most last around an hour. ${card}`
        : `Trips on this page run from about ${rsEn(s.lo)} to ${rsEn(s.hi)} per person, and most last around an hour. ${card}`,
    bodyFr: !s
      ? `Les sorties de cette page sont tarifées par personne, et durent le plus souvent une heure. ${cardFr}`
      : s.lo === s.hi
        ? `Les sorties de cette page coûtent environ ${rsFr(s.lo)} par personne, et durent le plus souvent une heure. ${cardFr}`
        : `Les sorties de cette page vont d’environ ${rsFr(s.lo)} à ${rsFr(s.hi)} par personne, et durent le plus souvent une heure. ${cardFr}`,
  };
}

/**
 * The village from the owner's contact line, or null.
 *
 * content.contact.location is free text — "Baie Aux Huîtres,Rodrigues" live,
 * "Rodrigues Island, Mauritius" in the defaults. The first part is the village
 * (the homepage's addressLocality reads it the same way); a first part that is
 * just the island names no village, so none is claimed.
 */
export function villageOf(location: string | null | undefined): string | null {
  const first = (location ?? "").split(",")[0].trim();
  return first && !/rodrigues/i.test(first) ? first : null;
}

// ── MAY A PAGE CALL DELIVERY FREE? ONE ANSWER FOR EVERY SURFACE ─────────────
//
// The price-note labels that promise free delivery with no condition: the
// scooters' "(free delivery)" and the cars' "(Free delivery fee)".
const UNCONDITIONAL_FREE_DELIVERY = /\(\s*free\s+delivery(?:\s+fee)?\s*\)/gi;

/**
 * True only when checkout charges this category nothing for delivery AND no
 * sellable unit's own price note still says something about delivery once
 * those unconditional labels are taken out.
 *
 * The fee alone was not enough. Live, the car fee is 0 while the Swift — the
 * cheapest car, the source of "From Rs 1,899" — reads "Rs 1899(Book for more
 * than 2 days to get free delivery!!)", printed verbatim on its card. With the
 * fee as the only test, /browse/car said "Delivery is free either way" beside
 * that card, the car meta and the /fr car FAQ said free, and llms.txt held it
 * back: two answers to one question (SEO audit 2026-09-29 C20, which is the
 * owner's to settle). Every "free" on /browse/car, /browse/scooter, their
 * metadata and /fr/location-voiture-rodrigues now reads this, so when the
 * owner settles the note in /admin they flip together. The note itself is
 * the owner's words and is never reworded.
 *
 * Nothing sellable in the category: no claim either way.
 */
export function deliveryIsFree(
  fleet: readonly FleetRow[],
  category: string,
  categories: DeliveryPricedCategory[] | undefined,
): boolean {
  const units = fleet.filter(
    (f) => (f.category ?? "scooter") === category && isSellableFleetItem(f),
  );
  if (units.length === 0) return false;
  // deliveryFee() is what checkout charges, fallback and clamping included.
  if (deliveryFee({ price: "", category }, categories) !== 0) return false;
  return !units.some((f) =>
    /deliver/i.test((f.price ?? "").replace(UNCONDITIONAL_FREE_DELIVERY, "")),
  );
}

const RENTAL_NOUN: Record<string, string> = { scooter: "scooters", car: "cars" };

/**
 * WHO rents, WHERE from, and HOW to pay, in one sentence an engine can lift
 * (SEO audit 2026-09-29 C4). /browse/scooter and /browse/car had zero
 * occurrences of the brand, the village or the word cash.
 *
 * Payment as it stands since M220: the owner confirms the dates, then the
 * customer pays online — bank transfer, MCB Juice or PayPal (cards go through
 * PayPal), the methods the manage-booking page offers and lib/home-description
 * names in the same order — or in cash in person when the owner agrees it: a
 * request, never a promise (lib/bookings/payment-preference.ts).
 *
 * No delivery clause and no price: it sits inside the intro, which has just
 * said both. It used to repeat "delivered free to where you are staying" one
 * sentence after the intro's "delivered free to your guest house", after the
 * call to action, pushing the cards down on a phone (review of C4).
 */
export function rentalWhoWherePay(o: {
  category: string;
  location?: string | null;
}): string | null {
  const noun = RENTAL_NOUN[o.category];
  if (!noun) return null;
  const village = villageOf(o.location);
  const where = village ? `from ${village} on Rodrigues` : "on Rodrigues";
  return `${SITE_NAME} rents ${noun} ${where}: once we confirm your dates, you pay online by bank transfer, MCB Juice or PayPal, or in cash in person when we agree it.`;
}

// ── HOW A STAY IS PAID (SEO audit 2026-09-29 C4) ────────────────────────────
//
// C4 counted "/browse/stays has 0 'pay'", and its French twin's "Paie-t-on…"
// answer never offered cash. The flow is PlaceBookingModal's: nothing is
// charged when the request is sent ("nothing has been charged"); once the
// owner confirms, the booking's pay block offers PayPal and the MCB Juice /
// bank-transfer details (app/manage-booking); the price online is the whole
// price, so no "deposit". Cash is the M220 request, in the words the
// experiences pages already use (IN_PERSON_SENTENCE). A listing with no price
// the form can charge takes a request only, and we reply with how to pay —
// worded without "no price shown", because a card can show a price read from
// its note while the form has nothing to charge.

/** The French of IN_PERSON_SENTENCE, as lib/experiences-faq.ts words it. */
export const IN_PERSON_SENTENCE_FR =
  "Vous pouvez aussi demander à payer sur place, en espèces : nous vous disons si c'est possible ou s'il faut payer en ligne.";

export const STAY_PAY = {
  en: `Nothing is charged when you send a request: once the owner confirms your dates, you pay online by bank transfer, MCB Juice or PayPal. ${IN_PERSON_SENTENCE} Where a place takes requests only, we reply with how to pay.`,
  fr: `Rien n’est débité à l’envoi de la demande : une fois vos dates confirmées par le propriétaire, vous payez en ligne, par virement, MCB Juice ou PayPal. ${IN_PERSON_SENTENCE_FR} Pour une adresse sur simple demande, nous vous indiquons comment régler.`,
} as const;

/**
 * The /browse/car airport passage (SEO audit 2026-09-29 C18), from claims the
 * site already makes: the car intro's "meet you at Plaine Corail airport",
 * the /fr car page's transfer-then-next-day delivery, and the category's own
 * delivery fee — one flat charge per category (lib/booking-pricing.ts
 * deliveryFee), so the airport costs what the guest house does.
 * AIRPORT_TRANSFER_PHRASE is the words the page links to /transfers (C5).
 *
 * The intro above it already says the hand-over and which side of the road;
 * this says only what is particular to the airport.
 */
export const AIRPORT_TRANSFER_PHRASE = "airport transfer";

export function carAirportPassage(o: {
  location?: string | null;
  deliveryFee?: number;
  /** deliveryIsFree(): a fee of 0 is not enough while a unit's own note puts
   *  a condition on delivery (C20). Then no fee sentence at all. */
  freeDelivery?: boolean;
}): { body: string; transfer: string; mainland: string } {
  const fee = o.deliveryFee;
  const feeSentence =
    typeof fee === "number" && fee > 0
      ? ` Delivery is ${rsEn(fee)} either way.`
      : o.freeDelivery
        ? " Delivery is free either way."
        : "";
  const village = villageOf(o.location);
  return {
    body: `We bring the car to Plaine Corail airport when you land, the same way we deliver it to a guest house.${feeSentence}`,
    // The intro already asks "Rather not drive on arrival?"; this is the
    // answer's second half, as /fr/location-voiture-rodrigues gives it.
    transfer: `If you take an ${AIRPORT_TRANSFER_PHRASE} on the day you land, we deliver the car to where you are staying the next day.`,
    mainland: `Booking from Mauritius? ${SITE_NAME} is on Rodrigues itself${
      village ? `, in ${village},` : ""
    } and delivers to Plaine Corail airport.`,
  };
}

// ── META ────────────────────────────────────────────────────────────────────

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/**
 * A category <title> with its from-price, inside 60 characters.
 *
 * The price is the lever (M138), so it is the last thing to go: the brand
 * suffix yields first, then the price, never the words that name the page.
 */
export function categoryTitle(base: string, from: number | null): string {
  const price = from ? ` from ${rsEn(from)}` : "";
  for (const t of [`${base}${price}${BRAND_SUFFIX}`, `${base}${price}`, `${base}${BRAND_SUFFIX}`]) {
    if (t.length <= MAX_TITLE) return t;
  }
  return base;
}

/**
 * A category description with its from-price INSIDE the snippet.
 *
 * SEO audit 2026-09-29 T7: "{description} From Rs X." ran 162–208 characters,
 * so the price — the reason it is there — was the part Google cut. The base is
 * fitted to leave room for the price rather than the price trailing off.
 */
export function categoryMetaDescription(base: string, from: number | null): string {
  if (!from) return metaDescription(base) || base;
  const suffix = `From ${rsEn(from)}.`;
  const room = MAX_DESCRIPTION - suffix.length - 1;
  const head = Array.from(base).length <= room ? base : metaDescription(base, room);
  return `${head} ${suffix}`;
}

/**
 * "delivered free to your guest house" only when deliveryIsFree() says so.
 * The META literals say "delivered to your guest house"; this inserts "free"
 * on the same answer the page body gives (rule: never "free" unless the charge
 * is zero and no owner's note says otherwise — C20).
 */
export function withFreeDelivery(description: string, freeDelivery: boolean): string {
  return freeDelivery
    ? description.replace("delivered to your guest house", "delivered free to your guest house")
    : description;
}

const KIND: Record<string, string> = { car: "car", scooter: "scooter" };

/**
 * A vehicle page <title> (SEO audit 2026-09-29 T5): the model, the head term
 * ("car rental"), the grouped price and the island — in that order of
 * sacrifice from the end: the "car"/"scooter" word goes first, then the name
 * is trimmed. The price and "rental … Rodrigues" always stay.
 */
export function vehicleMetaTitle(name: string, category: string, from: number | null): string {
  const kind = KIND[category] ? ` ${KIND[category]}` : "";
  const tail = from ? ` rental — ${rsEn(from)}/day, Rodrigues` : " rental in Rodrigues";
  for (const t of [`${name}${kind}${tail}`, `${name}${tail}`]) {
    if (t.length <= MAX_TITLE) return t;
  }
  return `${fitTitle(name, MAX_TITLE - tail.length)}${tail}`;
}
