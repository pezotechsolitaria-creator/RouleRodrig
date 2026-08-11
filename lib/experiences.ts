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
