import { describe, it, expect } from "vitest";
import type { MapLocation } from "@/lib/defaults";
import {
  THEME_GUIDES,
  frenchBeachesOnGuide,
  guideEntryHref,
  guideTrail,
  hasGuideWriting,
  mapEntryHref,
  placesOnGuide,
  readAboutHref,
  themeGuideOf,
} from "./places";
import { placeAnchors } from "./location-page-gate";

// ── ONE ANSWER TO "WHERE IS THIS PLACE WRITTEN UP?" (architecture review 2026-09-30) ──
//
// The beaches page, the viewpoints page, /explore, the homepage and the curated
// world each decided this for themselves, and /explore's copy dropped Trou
// d'Argent (description, no story). These pin the one rule they can all read.

const place = (over: Partial<MapLocation>): MapLocation => ({
  id: "p",
  name: "Somewhere",
  description: "",
  category: "beach",
  lat: -19.7,
  lng: 63.4,
  ...over,
});

const TROU = place({ id: "loc-trou", name: "Trou d'Argent", description: "A cove between cliffs." });
const TOMBEAU = place({ id: "loc-tomb", name: "Tombeau Maragon", category: "viewpoint", story: "A tomb on the ridge." });
const MARIE = place({ id: "loc-marie", name: "Marie Reine", category: "landmark", description: "A statue above the bay." });
const BARE_BEACH = place({ id: "loc-bare", name: "Anse Raffin", description: "Add a description." });
const KOT_PIVE = place({ id: "loc-shop", name: "Kot Pive", category: "shop" });
const PUMP = place({ id: "gas-1", name: "Petrol Station", category: "gas", description: "Open daily." });
const ALL = [TROU, TOMBEAU, MARIE, BARE_BEACH, KOT_PIVE, PUMP];

describe("which guide carries a place", () => {
  it("needs writing — a description alone is enough, the placeholder is not", () => {
    expect(hasGuideWriting(TROU)).toBe(true);
    expect(hasGuideWriting(TOMBEAU)).toBe(true);
    expect(hasGuideWriting(BARE_BEACH)).toBe(false);
  });

  it("puts beaches on beaches, viewpoints AND landmarks on viewpoints, every shop on shops", () => {
    expect(themeGuideOf(TROU)).toBe(THEME_GUIDES.beaches);
    expect(themeGuideOf(TOMBEAU)).toBe(THEME_GUIDES.viewpoints);
    expect(themeGuideOf(MARIE)).toBe(THEME_GUIDES.viewpoints);
    expect(themeGuideOf(KOT_PIVE)).toBe(THEME_GUIDES.shops);
    expect(themeGuideOf(BARE_BEACH)).toBeNull();
    expect(themeGuideOf(PUMP)).toBeNull();
  });

  it("lists a guide's places in the owner's order", () => {
    expect(placesOnGuide(ALL, THEME_GUIDES.viewpoints).map((p) => p.id)).toEqual(["loc-tomb", "loc-marie"]);
    expect(placesOnGuide(ALL, THEME_GUIDES.beaches).map((p) => p.id)).toEqual(["loc-trou"]);
  });

  it("counts French beaches by French writing only", () => {
    const fr = [
      { ...TROU, descriptionFr: "Une crique." },
      { ...BARE_BEACH, storyFr: "  " },
      { ...TOMBEAU, storyFr: "Un tombeau." },
    ];
    expect(frenchBeachesOnGuide(fr).map((p) => p.id)).toEqual(["loc-trou"]);
  });
});

describe("the link a card about a place carries", () => {
  const anchors = placeAnchors(ALL);

  it("is its anchor on the guide that renders it", () => {
    expect(guideEntryHref(TROU, anchors)).toBe("/guide/beaches#trou-d-argent");
    // A landmark card used to land on the bare /map (audit: landmarks → /map).
    expect(readAboutHref(MARIE, anchors)).toBe("/guide/viewpoints#marie-reine");
  });

  it("is its own page once it has one", () => {
    expect(guideEntryHref(TROU, anchors, { "loc-trou": "/guide/trou-d-argent" })).toBe("/guide/trou-d-argent");
  });

  it("is its row on the map when no guide covers it — never the bare /map", () => {
    expect(guideEntryHref(PUMP, anchors)).toBeNull();
    expect(readAboutHref(PUMP, anchors)).toBe("/map#petrol-station");
    expect(readAboutHref(BARE_BEACH, anchors)).toBe("/map#anse-raffin");
    expect(mapEntryHref(TOMBEAU, anchors)).toBe("/map#tombeau-maragon");
  });
});

describe("the guide breadcrumb", () => {
  it("goes Home › Island guide (/guide) › the page", () => {
    expect(guideTrail("https://x.test", { name: "Beaches", path: "/guide/beaches" })).toEqual([
      { name: "Home", url: "https://x.test" },
      { name: "Island guide", url: "https://x.test/guide" },
      { name: "Beaches", url: "https://x.test/guide/beaches" },
    ]);
    expect(guideTrail("https://x.test")).toHaveLength(2);
  });
});
