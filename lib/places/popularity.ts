import type { MapLocation } from "@/lib/defaults";

// ── WHAT MAKES A PLACE "POPULAR", AND WHEN WE ARE ALLOWED TO SAY SO ─────────
//
// The brief asked for a score blending page views, bookings, ratings, a curated
// flag and recency. Four of those five were checked against the live database
// before a line of this was written:
//
//   place_bookings   0 rows
//   reviews          1 row
//   page views       no table existed at all
//   the 42 map places live in a CMS blob and join to nothing transactional
//
// So the honest version of this module is not "a weighted sum of five signals".
// It is a weighted sum that KNOWS WHEN IT HAS NOTHING, and says so, because the
// output is a badge shown to a tourist deciding where to spend a morning. A
// "Popular" label derived from four zeroes is not a ranking — it is a claim we
// cannot support, and the visitor has no way to tell the difference.
//
// ── THE RULE THIS FILE EXISTS TO ENFORCE ───────────────────────────────────
//
//        A PLACE IS NEVER MARKED POPULAR ON EVIDENCE WE DO NOT HAVE.
//
// Below the thresholds, `tier` is "curated" (a human chose it) or "none". Only
// once a place clears a real floor of real interactions does it earn "popular",
// and only when that interest is RECENT does it earn "trending".
//
// That also means the feature works on day one — the owner's own picks carry
// the layer while the counters fill up — and gets better on its own without
// anybody changing code.
//
// ── WHY THE SCORE IS HERE AND NOT IN SQL ───────────────────────────────────
// lib/schedule.ts states the split this codebase uses: anything that decides
// whether something is ALLOWED lives in Postgres; presentation lives in TS.
// Nothing here gates money or access — it orders pins on a map — and the part
// worth testing is the arithmetic, which is far easier to pin down in vitest
// than in a migration.

/** Raw counters for one place. Every field is a real column or a real absence. */
export type PlaceSignals = {
  /** Views inside the window (default 7 days). */
  viewsWindow: number;
  /** Views since counting began. */
  viewsAll: number;
  /** "Get directions" presses in the window — intent, not just curiosity. */
  directionsWindow: number;
  /** Added to an itinerary, all time. */
  savesAll: number;
  /** Average rating, 0–5, or null when nobody has rated it. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Bookings attributed to this place, all time. */
  bookings: number;
};

export const NO_SIGNALS: PlaceSignals = {
  viewsWindow: 0,
  viewsAll: 0,
  directionsWindow: 0,
  savesAll: 0,
  ratingAvg: null,
  ratingCount: 0,
  bookings: 0,
};

export type PopularityTier =
  /** The owner chose it. The only tier that needs no data at all. */
  | "curated"
  /** Real, recent interest — this week rather than ever. */
  | "trending"
  /** Real interest, accumulated. */
  | "popular"
  /** Not enough evidence to say anything. Most places, most of the time. */
  | "none";

export type Popularity = {
  tier: PopularityTier;
  /** 0–100, for ORDERING only. Never rendered as a number to a visitor. */
  score: number;
  /**
   * Why this place scored what it did, in plain words. Shown to the OWNER in
   * admin so a ranking is never a black box he has to trust — and the fastest
   * way to notice the inputs have gone wrong.
   */
  evidence: string[];
  /** True once the evidence clears the floor below. */
  confident: boolean;
};

// ── THE FLOOR ──────────────────────────────────────────────────────────────
// Deliberately low enough to be reachable on an island with a few thousand
// visitors a month, and high enough that one curious afternoon does not crown a
// petrol station. Tuned to be raised, not lowered: a badge that appears too
// easily is the one that stops meaning anything.
export const POPULAR_FLOOR = {
  /** Views in the window before "trending" is even considered. */
  trendingViews: 25,
  /** All-time views before "popular" is considered. */
  popularViews: 80,
  /** A directions press is worth far more than a view; this many alone qualify. */
  directions: 8,
  /** Ratings needed before a rating moves the score at all. */
  ratings: 3,
} as const;

/**
 * Bayesian-damped rating.
 *
 * One five-star review must not outrank forty at 4.5. The prior pulls a thin
 * sample towards the middle and lets go as real ratings arrive — the standard
 * fix, and the reason `ratingCount` is in the signals at all rather than just
 * the average.
 */
export function dampedRating(avg: number | null, count: number, prior = 3.6, weight = 8): number {
  if (avg == null || count <= 0) return 0;
  return (avg * count + prior * weight) / (count + weight);
}

/**
 * Recency multiplier from a half-life in days.
 *
 * "Popular this week" and "popular ever" are different questions and the brief
 * asked for both, so the window signal is scored separately and then decayed
 * rather than being mixed into one undated total.
 */
export function recencyWeight(daysSinceLastSeen: number | null, halfLife = 10): number {
  if (daysSinceLastSeen == null) return 0;
  if (daysSinceLastSeen <= 0) return 1;
  return Math.pow(0.5, daysSinceLastSeen / halfLife);
}

/** Diminishing returns: the 400th view says much less than the 40th. */
function saturate(n: number, halfway: number): number {
  return n <= 0 ? 0 : n / (n + halfway);
}

export type ScoreInput = {
  signals: PlaceSignals;
  /** The owner's manual pick, from the CMS. */
  curated: boolean;
  /** Lower sorts first among curated places. */
  curatedRank?: number | null;
  /** Days since this place was last interacted with, or null if never. */
  daysSinceLastSeen?: number | null;
};

/**
 * The score, the tier, and the sentence explaining both.
 *
 * Order of the checks matters and is the whole design: curated is decided
 * FIRST and without reference to the data, because it is a human statement and
 * must not be silently overruled by a week of bad weather.
 */
export function scorePlace({
  signals,
  curated,
  curatedRank,
  daysSinceLastSeen = null,
}: ScoreInput): Popularity {
  const s = signals;
  const evidence: string[] = [];

  // Each component is 0–1, then weighted. Views are the cheapest signal and
  // carry the least; pressing "get directions" is somebody deciding to GO, and
  // is worth roughly three views.
  const vWindow = saturate(s.viewsWindow, 40);
  const vAll = saturate(s.viewsAll, 150);
  const dirs = saturate(s.directionsWindow, 12);
  const saves = saturate(s.savesAll, 15);
  const books = saturate(s.bookings, 6);

  const ratingPart =
    s.ratingCount >= POPULAR_FLOOR.ratings ? dampedRating(s.ratingAvg, s.ratingCount) / 5 : 0;

  const fresh = recencyWeight(daysSinceLastSeen);

  const raw =
    vAll * 18 +
    vWindow * 22 * (0.5 + 0.5 * fresh) +
    dirs * 26 +
    saves * 12 +
    books * 14 +
    ratingPart * 8;

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  if (s.viewsAll > 0) evidence.push(`${s.viewsAll} view${s.viewsAll === 1 ? "" : "s"}`);
  if (s.viewsWindow > 0) evidence.push(`${s.viewsWindow} this week`);
  if (s.directionsWindow > 0) evidence.push(`${s.directionsWindow} asked for directions`);
  if (s.savesAll > 0) evidence.push(`${s.savesAll} saved it`);
  if (s.bookings > 0) evidence.push(`${s.bookings} booked`);
  if (s.ratingCount >= POPULAR_FLOOR.ratings && s.ratingAvg != null) {
    evidence.push(`${s.ratingAvg.toFixed(1)}★ from ${s.ratingCount}`);
  }

  // ── Curated wins, and says so ────────────────────────────────────────
  // The owner has walked these beaches. On a 42-place island his judgement is
  // better evidence than a fortnight of click counts, and it is the only tier
  // that works before any data exists — which is today.
  if (curated) {
    // ── AN UNRANKED PICK IS STILL A PICK ──────────────────────────────
    // This defaulted a missing rank to 999, which made `1000 - rank` equal ONE
    // — below every ordinary place with a single view. A curated place the
    // owner had not bothered to number sorted last, which is the exact opposite
    // of what curating it means. Caught by the test that says a pick is never
    // demoted by a quiet week.
    //
    // Clamped so the arithmetic cannot invert however he numbers them: every
    // curated place scores at least 101, above any real score, which tops out
    // at 100. Numbered picks lead, in his order; unnumbered ones follow, still
    // ahead of everything uncurated.
    const rank = Math.min(Math.max(curatedRank ?? 500, 0), 899);
    return {
      tier: "curated",
      score: 1000 - rank + score / 1000,
      evidence: ["Chosen by Roulé Rodrigues", ...evidence],
      confident: true,
    };
  }

  const enoughForTrending =
    s.viewsWindow >= POPULAR_FLOOR.trendingViews || s.directionsWindow >= POPULAR_FLOOR.directions;
  const enoughForPopular =
    s.viewsAll >= POPULAR_FLOOR.popularViews ||
    s.savesAll >= POPULAR_FLOOR.directions ||
    s.bookings > 0;

  if (enoughForTrending && fresh > 0.35) {
    return { tier: "trending", score, evidence, confident: true };
  }
  if (enoughForPopular) {
    return { tier: "popular", score, evidence, confident: true };
  }

  // ── Nothing to say ───────────────────────────────────────────────────
  // Not "score 0 so it sorts last" — `tier: none` is a REFUSAL to label, and
  // the map draws these as ordinary pins. Most places sit here until the
  // counters fill, and that is the correct state, not a broken one.
  return {
    tier: "none",
    score,
    evidence: evidence.length ? evidence : ["Not enough visits yet to say"],
    confident: false,
  };
}

/** Everything the map needs about one place, in one object. */
export type RankedPlace = {
  place: MapLocation;
  popularity: Popularity;
};

/** True when this place should wear the badge and the bigger pin. */
export function isPopular(p: Popularity): boolean {
  return p.confident && p.tier !== "none";
}

/**
 * Rank a whole list. Stable: places that tie keep their CMS order, so the
 * owner's arrangement is never scrambled by a scoring change.
 */
export function rankPlaces(
  places: MapLocation[],
  signalsFor: (place: MapLocation) => ScoreInput,
): RankedPlace[] {
  return places
    .map((place, index) => ({ place, index, popularity: scorePlace(signalsFor(place)) }))
    .sort((a, b) => b.popularity.score - a.popularity.score || a.index - b.index)
    .map(({ place, popularity }) => ({ place, popularity }));
}

/** The badge word, per language. Kept beside the tiers so a new tier fails loudly. */
export const TIER_LABEL: Record<Exclude<PopularityTier, "none">, Record<"en" | "fr" | "cr", string>> =
  {
    curated: { en: "Our pick", fr: "Notre choix", cr: "Nou swazir" },
    trending: { en: "Popular now", fr: "En vogue", cr: "Popiler la" },
    popular: { en: "Popular", fr: "Populaire", cr: "Popiler" },
  };
