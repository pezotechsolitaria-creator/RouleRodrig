import type { RecommendedPlace, ServiceType } from "@/lib/defaults";
import { placePrice, type Priced } from "./place-detail";

// ── ONE ENGINE, THREE MARKETPLACES ─────────────────────────────────────────
//
// Massage, fishing and sea trips are not three products. They are three
// DISCOVERY SURFACES over one booking engine that has existed for months:
// `place_bookings` + the RecommendedPlace content model, which already does
// per-date capacity, time slots, deposit-to-confirm, photo galleries and the
// hold/release logic in lib/holds.ts.
//
// Building them as three bespoke marketplaces — the obvious reading of the
// brief — would have meant three availability engines, three deposit flows and
// three independent sets of double-booking bugs, for a catalogue that today
// holds three items in total. The whole difference between "a massage" and "a
// fishing charter" is the words on the card and which filters make sense.
//
// So this file holds the WORDS and the FILTERS, and everything else is shared.
// A fourth vertical (diving, quad tours, kitesurf) is a new entry here.

export type ExperienceCopy = {
  slug: ServiceType;
  /** Browser title / H1. */
  title: string;
  titleFr: string;
  /** One line under the H1 — what the customer is choosing between. */
  subtitle: string;
  subtitleFr: string;
  /** Meta description. */
  description: string;
  emoji: string;
  /** Filter chips. Matched against the place's `highlights`, case-insensitively. */
  filters: { key: string; label: string; labelFr: string }[];
  /** Shown when the owner has not published a provider yet. */
  emptyTitle: string;
  emptyBody: string;
  /** The verb on the card. */
  cta: string;
  ctaFr: string;
  /** Unit the price is quoted in, when the provider gives one. */
  priceUnit: string;
};

export const EXPERIENCES: Record<ServiceType, ExperienceCopy> = {
  massage: {
    slug: "massage",
    title: "Massage & wellness in Rodrigues",
    titleFr: "Massage & bien-être à Rodrigues",
    subtitle: "Book a therapist — at your hotel, or theirs.",
    subtitleFr: "Réservez un massage — à votre hôtel ou chez le praticien.",
    description:
      "Book a massage or spa treatment in Rodrigues with a local therapist. See the price, the duration and the next free slot.",
    emoji: "💆",
    filters: [
      { key: "relaxation", label: "Relaxation", labelFr: "Relaxation" },
      { key: "deep tissue", label: "Deep tissue", labelFr: "Deep tissue" },
      { key: "home visit", label: "Comes to you", labelFr: "À domicile" },
      { key: "couple", label: "For two", labelFr: "En duo" },
    ],
    emptyTitle: "No therapists listed yet",
    emptyBody:
      "Rodrigues therapists are joining one by one. When the first is listed you will be able to see their prices and book a slot right here.",
    cta: "See availability",
    ctaFr: "Voir les disponibilités",
    priceUnit: "per session",
  },
  fishing: {
    slug: "fishing",
    title: "Fishing trips in Rodrigues",
    titleFr: "Sorties de pêche à Rodrigues",
    subtitle: "Find your next trip — big game, coastal or traditional.",
    subtitleFr: "Trouvez votre prochaine sortie — au gros, côtière ou traditionnelle.",
    description:
      "Book a fishing trip in Rodrigues with a local captain: traditional fishing in the lagoon. Compare the group size and price.",
    emoji: "🎣",
    filters: [
      { key: "big game", label: "Big game", labelFr: "Au gros" },
      { key: "coastal", label: "Coastal", labelFr: "Côtière" },
      { key: "half day", label: "Half day", labelFr: "Demi-journée" },
      { key: "full day", label: "Full day", labelFr: "Journée" },
      { key: "beginner", label: "Beginners welcome", labelFr: "Débutants" },
    ],
    emptyTitle: "No charters listed yet",
    emptyBody:
      "Rodrigues captains are joining one by one. When the first boat is listed you will be able to compare trips and reserve a date right here.",
    cta: "See the trip",
    ctaFr: "Voir la sortie",
    priceUnit: "per person",
  },
  boat: {
    slug: "boat",
    title: "Sea trips in Rodrigues",
    titleFr: "Sorties en mer à Rodrigues",
    subtitle: "Lagoon, islets and sunsets — by boat.",
    subtitleFr: "Lagon, îlots et couchers de soleil — en bateau.",
    description:
      "Book a boat trip in Rodrigues with a local skipper: lagoon outings and snorkelling. See group size and price, pick a date.",
    emoji: "⛵",
    filters: [
      { key: "snorkel", label: "Snorkelling", labelFr: "Snorkeling" },
      { key: "sunset", label: "Sunset", labelFr: "Coucher de soleil" },
      { key: "island", label: "Islets", labelFr: "Îlots" },
      { key: "private", label: "Private boat", labelFr: "Bateau privé" },
      { key: "family", label: "Family", labelFr: "Famille" },
    ],
    emptyTitle: "No sea trips listed yet",
    emptyBody:
      "Boat operators are joining one by one. When the first trip is listed you will be able to see what it includes and book a date right here.",
    cta: "See the trip",
    ctaFr: "Voir la sortie",
    priceUnit: "per person",
  },
  // The fourth vertical, and the one where the PERSON is the product. Nobody
  // books "a trail" — the trail is public and free to walk. You book someone
  // who knows where the path goes when the grass is high after the rains, so
  // the filters here describe the GUIDE and what they specialise in, not a
  // vessel or a treatment.
  hiking: {
    slug: "hiking",
    title: "Hiking guides in Rodrigues",
    titleFr: "Guides de randonnée à Rodrigues",
    subtitle: "Walk the island with someone who grew up on it.",
    subtitleFr: "Parcourez l'île avec quelqu'un qui y a grandi.",
    // Short enough that "From Rs … per person." still lands inside the 155 a
    // snippet shows; at 185 the price was the part Google cut (SEO audit
    // 2026-09-29 T7).
    description:
      "Hike Rodrigues with a local guide: coastal paths, ridges and sunrise walks. See who leads it and what it costs, then book.",
    emoji: "🥾",
    filters: [
      { key: "coastal", label: "Coastal", labelFr: "Littoral" },
      { key: "mountain", label: "Mountain", labelFr: "Montagne" },
      { key: "nature", label: "Nature & birds", labelFr: "Nature & oiseaux" },
      { key: "sunrise", label: "Sunrise", labelFr: "Lever du soleil" },
      { key: "family", label: "Family-friendly", labelFr: "En famille" },
    ],
    emptyTitle: "No guides listed yet",
    emptyBody:
      "Local guides are being added one by one. Until then, every trail on the island is written up in the hiking guide — distance, climb, terrain and what to carry.",
    cta: "Meet the guide",
    ctaFr: "Voir le guide",
    priceUnit: "per walk",
  },
  // The fifth, and the one most easily confused with something the site already
  // has. A taxi is a fare between two points; this is a car and a driver for a
  // day, which is why the filters describe the SHAPE OF THE DAY rather than a
  // destination. Nobody books a chauffeur to get somewhere — they book one so
  // that where they go stops being a decision they have to make in advance.
  chauffeur: {
    slug: "chauffeur",
    title: "Private chauffeur in Rodrigues",
    titleFr: "Chauffeur privé à Rodrigues",
    subtitle: "A car, a driver, and a day that is entirely yours.",
    subtitleFr: "Une voiture, un chauffeur, et une journée entièrement à vous.",
    // Was 217 characters (SEO audit 2026-09-29 T7/T15). Short enough that a
    // "From Rs … per person." still fits whole once a driver is listed.
    description:
      "Hire a private driver and car in Rodrigues by the half-day or the day, and stop wherever you like, with a local at the wheel.",
    emoji: "🚘",
    filters: [
      { key: "halfday", label: "Half day", labelFr: "Demi-journée" },
      { key: "fullday", label: "Full day", labelFr: "Journée" },
      { key: "airport", label: "With airport pick-up", labelFr: "Avec transfert aéroport" },
      { key: "tour", label: "Island tour", labelFr: "Tour de l'île" },
      { key: "evening", label: "Evening & dinner", labelFr: "Soirée & dîner" },
    ],
    emptyTitle: "No chauffeurs listed yet",
    // "A taxi ... for a fixed fare" was one of three contradictory taxi-price
    // stories on the site (SEO audit 2026-09-29 C2). The truth has two parts:
    // airport transfers are priced by zone (/transfers), every other ride is
    // quoted by the driver and accepted before it is booked (/taxi).
    emptyBody:
      "Drivers are being added one at a time. In the meantime, airport transfers have fixed fares by zone, and for any other ride a taxi driver quotes a fare that you accept before anything is booked.",
    cta: "See the day",
    ctaFr: "Voir la journée",
    priceUnit: "per day",
  },
};

/**
 * Every published provider for a vertical, featured first.
 *
 * Reads the SAME content the Stay·Eat·Do section reads — there is no second
 * catalogue. A place qualifies when the owner has tagged it with the matching
 * serviceType; nothing is inferred from its name, because guessing would put a
 * restaurant called "The Boat House" in the sea-trip marketplace.
 */
export function experiencesOfType(
  items: RecommendedPlace[],
  type: ServiceType,
): RecommendedPlace[] {
  return items
    .filter((p) => p.serviceType === type)
    // Two guards, both learned from live data.
    //
    // A place is only a service while it is still an ACTIVITY. serviceType
    // lives in a JSON blob, so switching an item's category to Hotel used to
    // leave the tag behind and the listing stayed on /experiences/boat with no
    // way to reach the control that set it.
    //
    // And a listing with no name is not a listing. One nameless, priceless
    // sea trip was rendering as a real product card — empty heading, "Price on
    // request", a live "See the trip" button — because the page only shows its
    // empty state when the array is empty, not when its contents are.
    .filter((p) => p.category === "activity" && p.name.trim().length > 0)
    .sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false));
}

/** "1h 30" / "45 min" / "5h" — never "90 minutes", which nobody says. */
export function formatDuration(minutes: number | undefined | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}`;
}

/**
 * Does this place match a filter chip?
 *
 * Matched against `highlights`, which the owner already fills in per place, so
 * a new filter is a new word in admin rather than a new column. Substring and
 * case-insensitive on purpose: "Half-day trip" should match "half day".
 */
export function matchesFilter(place: RecommendedPlace, filterKey: string): boolean {
  const needle = filterKey.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = [...(place.highlights ?? []), place.name, place.description]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  return haystack.includes(needle);
}


/**
 * The cheapest real price across a set of listings, or null when none is set.
 *
 * Used for the "from Rs …" in a page title. Returns null rather than 0 for an
 * unpriced vertical, because "from Rs 0" in a search result is worse than no
 * price at all — it reads as either free or broken, and both cost the click.
 *
 * Reads placePrice(), which is the owner's own priceNote first and
 * depositAmount only as a fallback.
 *
 * It read depositAmount alone, and lib/place-detail.ts was written to stop
 * exactly that: on Île aux Cocos the deposit is Rs 1,000 against a note of
 * Rs 2,000, so the site's most-searched product published HALF its real price
 * as a schema.org Offer while the page beside it showed the full one. That fix
 * shipped to PlaceDetail.tsx and to nothing else, so every title, FAQ and
 * Offer generated here kept the old number.
 *
 * It also silently dropped whole verticals: massage and hiking set a priceNote
 * and no depositAmount, so they published no "from Rs …" in their title, no
 * "How much does it cost?" — the highest-intent question on the page — and no
 * Offer node at all, while their own cards showed Rs 1,999 and Rs 2,500.
 */
export function fromPriceOf(places: Priced[]): number | null {
  const prices = places
    .map((p) => placePrice(p))
    .filter((n): n is number => n !== null && n > 0);
  return prices.length ? Math.min(...prices) : null;
}


/** One question and its answer, the shape both the page and the schema read. */
export type ExperienceFaq = { q: string; a: string };

// ── ASKING TO PAY IN PERSON (M220) ──────────────────────────────────────────
// The booking form now lets a customer ask to pay in cash, and the owner then
// either confirms it or asks for the price online. So it is a request, never a
// promise — the same wording as the form's own note (placeBooking.inPersonNote).
// One sentence, read by the FAQ below and by each experience page's "How
// booking works", so the two cannot describe different flows (SEO audit
// 2026-09-29 C4, C6).
export const IN_PERSON_SENTENCE =
  "You can also ask to pay in person, in cash: we tell you whether you can, or whether it needs paying online.";

/**
 * The request-first flow in the order it happens, for one listing's page.
 *
 * `paysOnline` is whether the listing has an amount to charge — the booking
 * form offers a way to pay (online, or asking for cash) only then. Without
 * one, nothing is taken on the site, and step three says only what is true.
 */
export function howBookingWorks(who: string, paysOnline: boolean): string[] {
  return [
    "You send a request for your date. Nothing is charged when you send it.",
    `We check the date with ${who}. If it is not free that day, we say so and suggest an alternative.`,
    paysOnline
      ? `Once it is confirmed, you pay online to secure it. ${IN_PERSON_SENTENCE}`
      : "Once it is confirmed, we tell you by email or on WhatsApp.",
  ];
}

/**
 * The five questions somebody actually has before booking an experience.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The two pages on this site that produce customers — the French scooter and
 * car landing pages — both carry a visible FAQ wired to FAQPage schema. The
 * experience pages carried none. A search engine had no questions to match a
 * query against, and an assistant asked "how much is a boat trip in Rodrigues"
 * had a list of names to work from.
 *
 * ── WHY IT IS BUILT FROM THE LISTINGS, NOT WRITTEN OUT ─────────────────────
 *
 * Hardcoded answers rot. The moment the owner changes a price in admin, a
 * hand-written "from Rs 700" becomes a promise the booking does not honour —
 * which is the Rs 599/699 bug this codebase already fixed once. Every number
 * below is read from the listings, and a question with no data to answer it is
 * omitted rather than answered vaguely.
 *
 * Each answer is written to survive being quoted with no context: it restates
 * its own subject and ends on a concrete fact. "Yes, it's included" is true and
 * worthless once an assistant lifts it out of the page.
 */
export function experienceFaq(
  copy: ExperienceCopy,
  places: {
    name: string;
    depositAmount?: number | null;
    providerName?: string | null;
    durationMinutes?: number | null;
  }[],
): ExperienceFaq[] {
  const faq: ExperienceFaq[] = [];
  const rs = (n: number) => `Rs ${n.toLocaleString("en-US")}`;
  const thing = copy.title.toLowerCase().replace(/ in rodrigues$/, "");
  const from = fromPriceOf(places);

  if (from !== null) {
    // Matched on the SAME function the figure came from, or the name beside
    // the price belongs to a different listing.
    const cheapest = places.find((p) => placePrice(p) === from);
    faq.push({
      q: `How much does ${thing} cost in Rodrigues?`,
      a: `${copy.title} starts at ${rs(from)} per person${
        cheapest ? ` — that is ${cheapest.name}` : ""
      }. The price you see is the price you pay: no booking fee and no commission on top.`,
    });
  }

  // The availability-first flow (M127) is a real differentiator and a real
  // answer to the worry that precedes every online booking abroad.
  faq.push({
    q: "Do I pay before it is confirmed?",
    a: `No. You send a request, we check the date with the ${
      copy.slug === "massage" ? "therapist" : "operator"
    }, and only once it is confirmed do you pay to secure it.${
      // The cash option exists only where the form has an amount to charge.
      places.some((p) => Number(p.depositAmount) > 0) ? ` ${IN_PERSON_SENTENCE}` : ""
    } If it is not free that day we say so and suggest an alternative — you are never charged for something we cannot provide.`,
  });

  const named = places.filter((p) => p.providerName);
  if (named.length > 0) {
    const who = Array.from(new Set(named.map((p) => p.providerName as string)));
    faq.push({
      q: `Who runs the ${thing} in Rodrigues?`,
      a: `Local operators we know personally — ${who.join(", ")}. Rodrigues is an island of about 43,000 people; you are booking a named person, not a call centre, and you deal with them directly on the day.`,
    });
  }

  const timed = places.filter((p) => typeof p.durationMinutes === "number" && p.durationMinutes! > 0);
  if (timed.length > 0) {
    const mins = timed.map((p) => p.durationMinutes as number);
    const lo = Math.min(...mins);
    const hi = Math.max(...mins);
    const fmt = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${m} min`);
    faq.push({
      q: `How long does it take?`,
      a: lo === hi
        ? `About ${fmt(lo)}. The exact time is shown on each listing before you book, so you can plan the rest of the day around it.`
        : `Between ${fmt(lo)} and ${fmt(hi)}, depending which you choose. The exact duration is on each listing before you book.`,
    });
  }

  faq.push({
    q: "Can I book from abroad before I arrive?",
    a: `Yes. Book online before you travel and it is arranged for the date you choose. You can also message us on WhatsApp if you would rather ask first — we answer in English, French and Kreol.`,
  });

  return faq;
}

// ── WHAT AN EXPERIENCE PAGE STATES ABOUT ITSELF (SEO audit 2026-09-29 C6) ────
//
// The detail pages rendered 800–1,100 characters because PlaceDetail ignored
// fields every listing already holds: who runs it, where to meet, how long it
// lasts, how many can go, which languages. Each line below is one field the
// owner filled in, worded as a label and nothing more — no field, no line.

type FactSource = Pick<
  RecommendedPlace,
  "providerName" | "meetingPoint" | "durationMinutes" | "maxGuests" | "capacity" | "languages"
> & { serviceType?: RecommendedPlace["serviceType"] };

/** Admin placeholder text typed into the field rather than left empty. */
function isPlaceholder(value: string): boolean {
  return /^(optional|n\/?a|none|tbc|tbd|-+|x+|\?+)$/i.test(value.replace(/[.\s]+$/, "").trim());
}

/** The operator's name as the owner typed it, or null when there is none. */
export function providerOf(p: { providerName?: string | null }): string | null {
  const name = p.providerName?.trim();
  return name && !isPlaceholder(name) ? name : null;
}

/** "English", "English and French", "English, French and Kreol". */
function listWords(words: string[]): string {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

// ── GETTING THERE (architecture review 2026-09-30, item 3) ──────────────────
//
// An experience page said where to meet and never how to get there, while the
// site rents the scooters and cars that answer it and books the airport run.
// Built only from the owner's meetingPoint, and offered only where it is
// true: no line without a real meeting point, none when the operator already
// brings you (a transfer or pick-up in what is included or in the price note —
// the sunrise hike's "Free transfer to starting point"), none when the meeting
// point is the customer's own place, and never on a chauffeur, who IS the car.

/** A rental category a visitor can actually book today: href + the noun. */
export type Wheels = { href: string; noun: string };

export type GettingThere = { meet: string; wheels: Wheels[] };

/** The operator comes to you, or takes you from where you are staying. */
const BRINGS_YOU = /\btransfers?\b|pick[\s-]?up|\bcollect(?:ed|ion)?\b|\bdrop[\s-]?off\b/i;
/** A meeting point that is wherever the customer is. */
const YOUR_PLACE = /\byour\b|comes to you|home visit|à domicile|a domicile/i;

export function gettingThere(
  p: Pick<RecommendedPlace, "meetingPoint" | "included" | "priceNote"> & {
    serviceType?: RecommendedPlace["serviceType"];
  },
  wheels: Wheels[],
): GettingThere | null {
  if (p.serviceType === "chauffeur") return null;
  const meet = p.meetingPoint?.trim();
  if (!meet || isPlaceholder(meet) || YOUR_PLACE.test(meet)) return null;
  if ([...(p.included ?? []), p.priceNote ?? ""].some((s) => BRINGS_YOU.test(s))) return null;
  return { meet, wheels };
}

export function placeFacts(p: FactSource): string[] {
  const facts: string[] = [];
  const provider = providerOf(p);
  if (provider) facts.push(`With ${provider}`);

  const meet = p.meetingPoint?.trim();
  if (meet && !isPlaceholder(meet)) facts.push(`Meet at ${meet}`);

  const duration = formatDuration(p.durationMinutes);
  if (duration) facts.push(`Duration ${duration}`);

  // maxGuests is the group size; capacity (spots per date) is the fallback the
  // page already printed as "Up to N people" before maxGuests existed.
  const people = [p.maxGuests, p.capacity].find((n) => typeof n === "number" && n > 0);
  if (people) facts.push(people === 1 ? "For one person" : `Up to ${people} people`);

  const langs = (p.languages ?? []).map((l) => l.trim()).filter(Boolean);
  // "Guided in" is right for a walk or a boat and wrong for a massage.
  if (langs.length) {
    facts.push(`${p.serviceType === "massage" ? "Speaks" : "Guided in"} ${listWords(langs)}`);
  }
  return facts;
}
