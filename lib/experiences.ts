import type { RecommendedPlace, ServiceType } from "@/lib/defaults";

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
      "Book a massage in Rodrigues — relaxation, deep tissue and traditional treatments. See the price, the duration and the next free slot, and book in a few taps.",
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
      "Book a fishing trip in Rodrigues. Compare boats, captains, duration, group size and price, then reserve your date online.",
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
      "Book a boat trip in Rodrigues — lagoon cruises, islet excursions, snorkelling and sunset sailings. Duration, group size and price up front.",
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
    description:
      "Hike Rodrigues with a local guide — coastal paths, ridges and hidden valleys. See who they are, what they know and which languages they speak, then message them directly on WhatsApp.",
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
    description:
      "Hire a driver and a car by the half-day or the day in Rodrigues. No route to agree in advance and no fare to watch — stop where you like, stay as long as you like, and let somebody who knows the island do the driving.",
    emoji: "🚘",
    filters: [
      { key: "halfday", label: "Half day", labelFr: "Demi-journée" },
      { key: "fullday", label: "Full day", labelFr: "Journée" },
      { key: "airport", label: "With airport pick-up", labelFr: "Avec transfert aéroport" },
      { key: "tour", label: "Island tour", labelFr: "Tour de l'île" },
      { key: "evening", label: "Evening & dinner", labelFr: "Soirée & dîner" },
    ],
    emptyTitle: "No chauffeurs listed yet",
    emptyBody:
      "Drivers are being added one at a time. In the meantime a taxi will take you anywhere on the island for a fixed fare, and an airport transfer can be booked in advance.",
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
