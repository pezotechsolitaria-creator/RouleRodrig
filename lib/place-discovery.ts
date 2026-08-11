import type { MapLocation } from "@/lib/defaults";

// ── DISCOVERY FACTS, DERIVED FROM WHAT THE OWNER ALREADY WROTE ─────────────
//
// The problem, in the owner's words: "user clicks Plages and gets dumped into
// long paragraphs". He is right — the guide pages open with prose, and nobody
// reads three paragraphs to pick a beach.
//
// But those pages are ~1,300 words of genuinely local writing plus 60+ original
// photos, and they earn real search traffic. Deleting them to make room for
// cards would trade a working acquisition channel for a nicer first screen.
//
// So the cards go ON TOP and the prose stays underneath. This file is what
// makes that possible without asking the owner to re-enter everything he has
// already written: the badges are DERIVED from the existing description and
// story text, so 19 beaches and 10 viewpoints become filterable immediately,
// with no migration and no data entry.
//
// ── WHY KEYWORDS AND NOT A TAGS COLUMN ─────────────────────────────────────
// A tags column would be more precise and would be empty. Every one of these
// places already has 25–70 words of description written by someone who has
// been there; the words "calme", "snorkel" and "famille" are already in them.
// When the owner wants to override a badge, that is a future column — but the
// default has to work on the content that exists today.

export type PlaceBadge = {
  key: string;
  label: string;
  labelFr: string;
  emoji: string;
};

/**
 * Badge definitions, each with the words that imply it in EN / FR / Creole.
 *
 * Matching is accent-insensitive and substring-based, so "baignade" matches
 * "la baignade y est" and "calme" matches "eaux calmes".
 */
export const PLACE_BADGES: (PlaceBadge & { words: string[] })[] = [
  {
    key: "swim", label: "Swimming", labelFr: "Baignade", emoji: "🌊",
    words: ["swim", "swimming", "baignade", "baigner", "nage", "bathe", "bathing"],
  },
  {
    key: "snorkel", label: "Snorkelling", labelFr: "Snorkeling", emoji: "🤿",
    words: ["snorkel", "snorkelling", "snorkeling", "masque", "tuba", "coral", "corail", "reef", "recif"],
  },
  {
    key: "calm", label: "Calm", labelFr: "Calme", emoji: "🌴",
    words: ["calm", "calme", "sheltered", "abrite", "lagoon", "lagon", "quiet", "tranquille", "peaceful", "paisible"],
  },
  {
    key: "wild", label: "Wild", labelFr: "Sauvage", emoji: "🏝",
    words: ["wild", "sauvage", "remote", "isole", "deserted", "desert", "untouched", "secluded"],
  },
  {
    key: "family", label: "Family", labelFr: "Famille", emoji: "👨‍👩‍👧",
    words: ["family", "famille", "children", "enfants", "kids", "shallow", "peu profond"],
  },
  {
    key: "sunset", label: "Sunset", labelFr: "Coucher de soleil", emoji: "🌅",
    words: ["sunset", "coucher de soleil", "couche de soleil", "dusk", "golden hour", "soir"],
  },
  {
    key: "walk", label: "Walk to reach", labelFr: "Accès à pied", emoji: "🥾",
    words: ["walk", "hike", "marche", "randonnee", "sentier", "trail", "footpath", "à pied", "a pied"],
  },
  {
    key: "surf", label: "Waves", labelFr: "Vagues", emoji: "🏄",
    words: ["surf", "wave", "vague", "houle", "kite", "windsurf"],
  },
];

/** Strip accents and punctuation so "accès à pied" matches "acces a pied". */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Which badges this place earns, from everything the owner has written about
 * it in any of the three languages.
 *
 * Capped at four: a card carrying eight badges has told the customer nothing,
 * because they can no longer be compared at a glance.
 */
export function badgesFor(place: MapLocation, limit = 4): PlaceBadge[] {
  const haystack = normalizeText(
    [
      place.description, place.descriptionFr, place.descriptionCr,
      place.story, place.storyFr, place.storyCr,
      place.name,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const found: PlaceBadge[] = [];
  for (const b of PLACE_BADGES) {
    if (b.words.some((w) => haystack.includes(normalizeText(w)))) {
      found.push({ key: b.key, label: b.label, labelFr: b.labelFr, emoji: b.emoji });
    }
    if (found.length >= limit) break;
  }
  return found;
}

/** Does this place carry a given badge? Used by the filter chips. */
export function hasBadge(place: MapLocation, key: string): boolean {
  // Not `badgesFor(...).some(...)` — that is capped at four, so a place whose
  // fifth badge is the one being filtered on would silently disappear.
  const def = PLACE_BADGES.find((b) => b.key === key);
  if (!def) return false;
  const haystack = normalizeText(
    [
      place.description, place.descriptionFr, place.descriptionCr,
      place.story, place.storyFr, place.storyCr, place.name,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return def.words.some((w) => haystack.includes(normalizeText(w)));
}

/** Only the badges that would actually return something — never a dead chip. */
export function availableBadges(places: MapLocation[]): PlaceBadge[] {
  return PLACE_BADGES.filter((b) => places.some((p) => hasBadge(p, b.key))).map(
    ({ key, label, labelFr, emoji }) => ({ key, label, labelFr, emoji }),
  );
}

/** Free-text search across the name and everything written about the place. */
export function matchesQuery(place: MapLocation, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const haystack = normalizeText(
    [
      place.name, place.nameFr, place.nameCr,
      place.description, place.descriptionFr, place.descriptionCr,
      place.story, place.storyFr, place.storyCr,
    ]
      .filter(Boolean)
      .join(" "),
  );
  // Every word must appear — "calm beach" should not match a wild beach just
  // because the word "beach" is in it.
  return q.split(" ").every((w) => haystack.includes(w));
}

/** How many photos this place has, counting the cover only once. */
export function photoCount(place: MapLocation): number {
  const all = new Set<string>();
  if (place.image) all.add(place.image);
  for (const i of place.images ?? []) all.add(i);
  return all.size;
}

/** Filter + search in one pass, preserving the owner's ordering. */
export function filterPlaces(
  places: MapLocation[],
  opts: { query?: string; badge?: string | null },
): MapLocation[] {
  return places
    .filter((p) => (opts.badge ? hasBadge(p, opts.badge) : true))
    .filter((p) => matchesQuery(p, opts.query ?? ""));
}
