import { describe, it, expect } from "vitest";
import type { MapLocation } from "@/lib/defaults";
import {
  NO_SIGNALS,
  POPULAR_FLOOR,
  TIER_LABEL,
  dampedRating,
  isPopular,
  rankPlaces,
  recencyWeight,
  scorePlace,
  type PlaceSignals,
} from "./popularity";

const sig = (over: Partial<PlaceSignals> = {}): PlaceSignals => ({ ...NO_SIGNALS, ...over });

// ── The rule this whole module exists to enforce ────────────────────────────
//
// The brief asked for a score over views, bookings, ratings and recency. On the
// live database those are 0 rows, 0 rows, 1 row and no table. A weighted sum
// over that ranks all 42 places at zero and then prints "Popular" on whichever
// sorts first — a claim made to a tourist planning a morning, with nothing
// behind it.

describe("a place is never called popular on evidence we do not have", () => {
  it("refuses to label a place with no data at all", () => {
    const p = scorePlace({ signals: NO_SIGNALS, curated: false });
    expect(p.tier).toBe("none");
    expect(p.confident).toBe(false);
    expect(isPopular(p)).toBe(false);
  });

  it("says so in words, rather than showing a zero", () => {
    // "Not enough visits yet" is a different statement from "0 views", and it
    // is the true one — we started counting last week.
    expect(scorePlace({ signals: NO_SIGNALS, curated: false }).evidence).toEqual([
      "Not enough visits yet to say",
    ]);
  });

  it("still refuses just below the floor", () => {
    const justUnder = sig({
      viewsWindow: POPULAR_FLOOR.trendingViews - 1,
      viewsAll: POPULAR_FLOOR.popularViews - 1,
      directionsWindow: POPULAR_FLOOR.directions - 1,
    });
    expect(scorePlace({ signals: justUnder, curated: false, daysSinceLastSeen: 0 }).tier).toBe("none");
  });

  it("labels it the moment the floor is cleared", () => {
    const atFloor = sig({ viewsWindow: POPULAR_FLOOR.trendingViews });
    const p = scorePlace({ signals: atFloor, curated: false, daysSinceLastSeen: 0 });
    expect(p.tier).toBe("trending");
    expect(isPopular(p)).toBe(true);
  });
});

describe("the owner's own pick needs no data", () => {
  it("is curated on day one, before anything has been counted", () => {
    // This is what makes the feature work today. He has walked these beaches;
    // on a 42-place island that is better evidence than a fortnight of clicks.
    const p = scorePlace({ signals: NO_SIGNALS, curated: true });
    expect(p.tier).toBe("curated");
    expect(p.confident).toBe(true);
    expect(p.evidence[0]).toBe("Chosen by Roulé Rodrigues");
  });

  it("is never demoted by a quiet week", () => {
    const quiet = scorePlace({ signals: NO_SIGNALS, curated: true, daysSinceLastSeen: 400 });
    const busy = scorePlace({
      signals: sig({ viewsAll: 5000, viewsWindow: 900, directionsWindow: 300 }),
      curated: false,
      daysSinceLastSeen: 0,
    });
    expect(quiet.score).toBeGreaterThan(busy.score);
  });

  it("keeps the owner's own order among his picks", () => {
    const first = scorePlace({ signals: NO_SIGNALS, curated: true, curatedRank: 1 });
    const third = scorePlace({ signals: NO_SIGNALS, curated: true, curatedRank: 3 });
    expect(first.score).toBeGreaterThan(third.score);
  });
});

describe("one five-star review does not outrank forty good ones", () => {
  it("damps a thin sample towards the prior", () => {
    const thin = dampedRating(5, 1);
    const thick = dampedRating(4.5, 40);
    expect(thick).toBeGreaterThan(thin);
  });

  it("lets go as real ratings arrive", () => {
    expect(dampedRating(5, 200)).toBeGreaterThan(dampedRating(5, 5));
    expect(dampedRating(5, 200)).toBeLessThanOrEqual(5);
  });

  it("ignores a rating nobody has given", () => {
    expect(dampedRating(null, 0)).toBe(0);
    expect(dampedRating(4.9, 0)).toBe(0);
  });

  it("does not let one rating move the score at all", () => {
    // Below POPULAR_FLOOR.ratings the rating term is dropped entirely rather
    // than damped — two people cannot make a beach popular.
    const withOne = scorePlace({ signals: sig({ ratingAvg: 5, ratingCount: 1 }), curated: false });
    const withNone = scorePlace({ signals: NO_SIGNALS, curated: false });
    expect(withOne.score).toBe(withNone.score);
  });
});

describe("this week and ever are different questions", () => {
  it("decays by half every ten days", () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(10)).toBeCloseTo(0.5, 5);
    expect(recencyWeight(20)).toBeCloseTo(0.25, 5);
  });

  it("scores a place nobody has touched as stale, not fresh", () => {
    expect(recencyWeight(null)).toBe(0);
  });

  it("will not call a place trending on interest that has gone cold", () => {
    const busyOnceSignals = sig({ viewsWindow: 200, directionsWindow: 50 });
    const cold = scorePlace({ signals: busyOnceSignals, curated: false, daysSinceLastSeen: 60 });
    const warm = scorePlace({ signals: busyOnceSignals, curated: false, daysSinceLastSeen: 0 });
    expect(warm.tier).toBe("trending");
    expect(cold.tier).not.toBe("trending");
    expect(warm.score).toBeGreaterThan(cold.score);
  });
});

describe("intent counts for more than curiosity", () => {
  it("ranks asking for directions above looking", () => {
    // Pressing "get directions" is somebody deciding to GO.
    const looked = scorePlace({ signals: sig({ viewsWindow: 30 }), curated: false, daysSinceLastSeen: 0 });
    const went = scorePlace({ signals: sig({ directionsWindow: 30 }), curated: false, daysSinceLastSeen: 0 });
    expect(went.score).toBeGreaterThan(looked.score);
  });

  it("gives diminishing returns, so a runaway page cannot swamp the map", () => {
    // The property is about RATIOS, not differences: a hundred times the views
    // must not buy anything like a hundred times the score, or one blog post
    // about one beach flattens the rest of the island.
    //
    // Written first as `heaps - some < some`, which happened to compare 9 with
    // 9 — true of the curve but not of that arithmetic, because 150 is exactly
    // the half-saturation point. An assertion that only passes away from the
    // interesting value is not testing the interesting value.
    const some = scorePlace({ signals: sig({ viewsAll: 150 }), curated: false, daysSinceLastSeen: 0 });
    const heaps = scorePlace({ signals: sig({ viewsAll: 15000 }), curated: false, daysSinceLastSeen: 0 });
    expect(heaps.score).toBeGreaterThan(some.score);
    expect(heaps.score).toBeLessThan(some.score * 2.5);
  });

  it("never leaves the 0–100 range", () => {
    const absurd = scorePlace({
      signals: sig({ viewsAll: 1e9, viewsWindow: 1e9, directionsWindow: 1e9, savesAll: 1e9, bookings: 1e9, ratingAvg: 5, ratingCount: 1e6 }),
      curated: false,
      daysSinceLastSeen: 0,
    });
    expect(absurd.score).toBeLessThanOrEqual(100);
    expect(scorePlace({ signals: NO_SIGNALS, curated: false }).score).toBeGreaterThanOrEqual(0);
  });
});

describe("ranking a whole island", () => {
  const place = (id: string): MapLocation => ({
    id,
    name: id,
    description: "",
    category: "beach",
    lat: -19.7,
    lng: 63.4,
  });

  it("puts the owner's picks first, in his order, then the busy ones", () => {
    const places = [place("a"), place("b"), place("c"), place("d")];
    const ranked = rankPlaces(places, (p) => {
      if (p.id === "c") return { signals: NO_SIGNALS, curated: true, curatedRank: 2 };
      if (p.id === "d") return { signals: NO_SIGNALS, curated: true, curatedRank: 1 };
      if (p.id === "b")
        return { signals: sig({ viewsAll: 400, viewsWindow: 90 }), curated: false, daysSinceLastSeen: 0 };
      return { signals: NO_SIGNALS, curated: false };
    });
    expect(ranked.map((r) => r.place.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("keeps CMS order when nothing distinguishes two places", () => {
    // A scoring change must never silently scramble the owner's arrangement.
    const places = [place("x"), place("y"), place("z")];
    const ranked = rankPlaces(places, () => ({ signals: NO_SIGNALS, curated: false }));
    expect(ranked.map((r) => r.place.id)).toEqual(["x", "y", "z"]);
  });
});

describe("every tier that can be shown has a word in every language", () => {
  it("covers en, fr and cr", () => {
    for (const tier of ["curated", "trending", "popular"] as const) {
      for (const lang of ["en", "fr", "cr"] as const) {
        expect(TIER_LABEL[tier][lang], `${tier}/${lang}`).toBeTruthy();
      }
    }
  });
});
