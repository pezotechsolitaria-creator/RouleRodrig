import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { MapLocation } from "@/lib/defaults";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { RODRIGUES_BOUNDS } from "@/lib/tracking/model";
import {
  MAX_SLUG_LENGTH,
  MIN_LONG_READ_CHARS,
  MIN_PHOTOS,
  RESERVED_GUIDE_SLUGS,
  findLocationPage,
  locationGateRefusals,
  locationPageHrefs,
  locationPages,
  longReadChars,
  longReadParagraphs,
  passesLocationGate,
  photosOf,
  placeAnchors,
  placeIdForHash,
  placeSlug,
  storedSlug,
} from "./location-page-gate";

// ── THE LOCATION-PAGE GATE, AT ITS EDGES (architecture review 2026-09-30, item 1) ──
//
// A gate that is only tested well inside its limits is a gate nobody knows the
// shape of. Each condition is driven here one character, one photo or one
// metre either side of where it flips, against a place that passes everything
// else — so every failure names exactly one refusal.

/** One paragraph of prose, exactly `n` characters as a reader sees them. */
function prose(n: number, word = "lagoon"): string {
  const sentence = `The ${word} path runs along the cliff and down to the sand. `;
  let s = "";
  while (s.length < n) s += sentence;
  // Ends on a full stop, never a space the page would trim.
  return `${s.slice(0, n - 1)}.`;
}

const PASSING: MapLocation = {
  id: "loc-1786897115499",
  name: "Trou d'Argent",
  description: "A cove between cliffs, reached on foot.",
  category: "beach",
  lat: -19.7389,
  lng: 63.4967,
  image: "https://cdn.example/trou-1.jpg",
  images: ["https://cdn.example/trou-1.jpg", "https://cdn.example/trou-2.jpg", "https://cdn.example/trou-3.jpg"],
  slug: "trou-d-argent",
  pageEnabled: true,
  longRead: prose(MIN_LONG_READ_CHARS),
  longReadFr: prose(MIN_LONG_READ_CHARS, "lagon"),
};

const with_ = (over: Partial<MapLocation>): MapLocation => ({ ...PASSING, ...over });

describe("a place that meets every condition", () => {
  it("passes, with no refusal", () => {
    expect(locationGateRefusals(PASSING)).toEqual([]);
    expect(passesLocationGate(PASSING)).toBe(true);
  });
});

describe("the owner has to ask, with a slug a URL can carry", () => {
  it("refuses a place nobody asked a page for", () => {
    expect(locationGateRefusals(with_({ pageEnabled: undefined }))).toEqual(["not-requested"]);
    expect(locationGateRefusals(with_({ pageEnabled: false }))).toEqual(["not-requested"]);
  });

  it("refuses a missing slug instead of inventing one from the name", () => {
    expect(locationGateRefusals(with_({ slug: undefined }))).toEqual(["no-slug"]);
    expect(locationGateRefusals(with_({ slug: "   " }))).toEqual(["no-slug"]);
  });

  it("refuses a slug it would have to repair, rather than publish a different URL", () => {
    for (const bad of ["Trou-d-Argent", "trou d argent", "trou--d-argent", "-trou", "trou-", "trou_d_argent", "trou/d"]) {
      expect(storedSlug({ slug: bad }), bad).toBeNull();
      expect(locationGateRefusals(with_({ slug: bad })), bad).toEqual(["no-slug"]);
    }
    // Surrounding whitespace is not part of what the owner meant.
    expect(storedSlug({ slug: "  trou-d-argent " })).toBe("trou-d-argent");
  });

  it("allows a slug of exactly the maximum length, and not one character more", () => {
    const at = "a".repeat(MAX_SLUG_LENGTH);
    expect(storedSlug({ slug: at })).toBe(at);
    expect(passesLocationGate(with_({ slug: at }))).toBe(true);
    expect(locationGateRefusals(with_({ slug: `${at}b` }))).toEqual(["no-slug"]);
  });

  it("refuses every slug an existing /guide page already answers", () => {
    for (const slug of RESERVED_GUIDE_SLUGS) {
      expect(locationGateRefusals(with_({ slug })), slug).toEqual(["reserved-slug"]);
    }
  });

  it("reserves exactly the static guides that exist, so a new one cannot be shadowed", () => {
    // Next already routes /guide/beaches ahead of /guide/[place]; this keeps the
    // gate honest about it. A guide directory added next month fails HERE.
    const dir = join(process.cwd(), "app", "guide");
    const statics = readdirSync(dir)
      .filter((e) => statSync(join(dir, e)).isDirectory() && !e.startsWith("["))
      .filter((e) => existsSync(join(dir, e, "page.tsx")))
      .sort();
    expect([...RESERVED_GUIDE_SLUGS].sort()).toEqual(statics);
  });
});

describe("only places people go to look at, and only ones the guide already covers", () => {
  it("refuses a restaurant, a shop, an activity and a petrol station", () => {
    for (const category of ["restaurant", "shop", "activity", "gas"] as const) {
      expect(locationGateRefusals(with_({ category })), category).toEqual(["not-a-location"]);
    }
  });

  it("accepts a beach, a viewpoint and a landmark", () => {
    for (const category of ["beach", "viewpoint", "landmark"] as const) {
      expect(passesLocationGate(with_({ category })), category).toBe(true);
    }
  });

  it("refuses a place that is not yet an entry on its theme guide", () => {
    // No description or story: /guide/beaches does not render it, so a page
    // would deepen an anchor that does not exist.
    expect(locationGateRefusals(with_({ description: "", story: undefined }))).toEqual([
      "not-on-theme-guide",
    ]);
    // The admin placeholder is not writing either.
    expect(locationGateRefusals(with_({ description: "Add a description." }))).toEqual([
      "not-on-theme-guide",
    ]);
  });
});

describe("the long read, in English and in French", () => {
  it("flips at exactly MIN_LONG_READ_CHARS, in each language on its own", () => {
    expect(longReadChars(prose(MIN_LONG_READ_CHARS))).toBe(MIN_LONG_READ_CHARS);
    expect(locationGateRefusals(with_({ longRead: prose(MIN_LONG_READ_CHARS - 1) }))).toEqual([
      "short-english",
    ]);
    expect(locationGateRefusals(with_({ longReadFr: prose(MIN_LONG_READ_CHARS - 1, "lagon") }))).toEqual([
      "short-french",
    ]);
  });

  it("counts the story on top of the long read, as long as it is new writing", () => {
    const story = prose(200, "story");
    const longRead = prose(MIN_LONG_READ_CHARS - 200);
    expect(longReadChars(longRead, story)).toBe(MIN_LONG_READ_CHARS);
    expect(passesLocationGate(with_({ longRead, story }))).toBe(true);
    // The same story pasted into the long read is not counted twice.
    expect(longReadChars(`${longRead}\n${story}`, story)).toBe(MIN_LONG_READ_CHARS);
    // And FR counts storyFr the same way.
    expect(passesLocationGate(with_({ longReadFr: prose(1000, "lagon"), storyFr: prose(200, "histoire") }))).toBe(true);
  });

  it("gives no page to a story alone, however long", () => {
    // The story is already on the theme guide; a page of it is the thin copy.
    expect(longReadChars(undefined, prose(5000))).toBe(0);
    expect(locationGateRefusals(with_({ longRead: "", story: prose(5000) }))).toEqual(["short-english"]);
  });

  it("does not count boilerplate: placeholders, pasted links, repeats, runs of spaces", () => {
    const body = prose(MIN_LONG_READ_CHARS - 1);
    const padded = [
      body,
      "Add a description.",
      "Add a description. -19.7389, 63.4967",
      "https://www.google.com/maps/place/Trou+d'Argent/@-19.7389,63.4967,17z",
      "www.example.com/a-very-long-link-that-would-otherwise-count-as-writing",
      body, // pasted twice
      "   ",
    ].join("\n");
    expect(longReadChars(padded)).toBe(MIN_LONG_READ_CHARS - 1);
    expect(locationGateRefusals(with_({ longRead: padded }))).toEqual(["short-english"]);
    // Whitespace inside a paragraph counts once, as a reader sees it.
    expect(longReadChars("a    b\t\tc")).toBe(5);
  });

  it("renders exactly the paragraphs it counted", () => {
    expect(longReadParagraphs("First.\n\nAdd a description.\nSecond https://x.y/z here.", "Third.")).toEqual([
      "First.",
      "Second here.",
      "Third.",
    ]);
  });
});

describe("photos and coordinates", () => {
  it("needs MIN_PHOTOS distinct photos, the cover counted once", () => {
    expect(photosOf(PASSING)).toHaveLength(MIN_PHOTOS);
    const two = with_({ images: ["https://cdn.example/trou-1.jpg", "https://cdn.example/trou-2.jpg", " "] });
    expect(photosOf(two)).toHaveLength(2);
    expect(locationGateRefusals(two)).toEqual(["few-photos"]);
    expect(locationGateRefusals(with_({ image: undefined, images: undefined }))).toEqual(["few-photos"]);
  });

  it("needs a pin on Rodrigues: not missing, not 0,0, not swapped", () => {
    for (const [lat, lng] of [
      [0, 0],
      [63.4967, -19.7389],
      [Number.NaN, 63.4967],
      [-20.16, 57.5], // Mauritius
    ]) {
      expect(locationGateRefusals(with_({ lat, lng })), `${lat},${lng}`).toEqual(["no-coordinates"]);
    }
  });

  it("accepts the island's own bounds, edge included", () => {
    const { minLat, maxLng } = RODRIGUES_BOUNDS;
    expect(passesLocationGate(with_({ lat: minLat, lng: maxLng }))).toBe(true);
    expect(locationGateRefusals(with_({ lat: minLat - 0.001 }))).toEqual(["no-coordinates"]);
  });
});

describe("one page per slug and per name", () => {
  it("keeps the first, in the owner's order, and leaves the second a section", () => {
    const second = with_({ id: "loc-2", name: "Another cove" });
    const sameName = with_({ id: "loc-3", slug: "trou-d-argent-bis" });
    const other = with_({ id: "loc-4", name: "Anse Bouteille", slug: "anse-bouteille" });
    const pages = locationPages([PASSING, second, sameName, other]);
    expect(pages.map((p) => p.id)).toEqual([PASSING.id, other.id]);
    expect(locationPageHrefs([PASSING, second, sameName, other])).toEqual({
      [PASSING.id]: "/guide/trou-d-argent",
      [other.id]: "/guide/anse-bouteille",
    });
    expect(findLocationPage([PASSING, other], "anse-bouteille")?.id).toBe(other.id);
    expect(findLocationPage([PASSING, other], "nowhere")).toBeUndefined();
  });

  it("gives no page to anything in today's seed content", () => {
    // What getContent() answers on a failed read: no place has the fields.
    expect(locationPages(DEFAULT_CONTENT.mapLocations)).toEqual([]);
  });
});

describe("placeSlug and the anchors built from it", () => {
  it("is the stored slug, else the name with accents folded", () => {
    expect(placeSlug(PASSING)).toBe("trou-d-argent");
    expect(placeSlug({ name: "Rivière Banane  Main Beach " })).toBe("riviere-banane-main-beach");
    expect(placeSlug({ name: "Île aux Cocos Excursion " })).toBe("ile-aux-cocos-excursion");
    expect(placeSlug({ name: "Trou d'Argent", slug: "Not A Slug" })).toBe("trou-d-argent");
  });

  it("cuts a long name on a word, within the limit", () => {
    const s = placeSlug({ name: "The quite extraordinarily long name of a small beach somewhere on the east coast" });
    expect(s.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(s).not.toMatch(/-$/);
  });

  it("resolves a /map#fragment by anchor, then by the old admin id, else to nothing", () => {
    const places = [
      { id: "loc-1786897115499", name: "Trou d'Argent" },
      { id: "loc-2", name: "Île Michel Beach" },
    ];
    const anchors = placeAnchors(places);
    expect(placeIdForHash("#trou-d-argent", places, anchors)).toBe("loc-1786897115499");
    // Links written before anchors existed (/explore, the homepage) name the id.
    expect(placeIdForHash("#loc-1786897115499", places, anchors)).toBe("loc-1786897115499");
    expect(placeIdForHash("#ile-michel-beach", places, anchors)).toBe("loc-2");
    expect(placeIdForHash("#%C3%AEle", places, anchors)).toBeNull();
    expect(placeIdForHash("#%E0%A4%A", places, anchors)).toBeNull(); // malformed escape
    expect(placeIdForHash("", places, anchors)).toBeNull();
    expect(placeIdForHash("#map", places, anchors)).toBeNull();
  });

  it("is unique across the map: stored slugs first, then names, then the id", () => {
    const places = [
      { id: "a", name: "Pointe Coton" },
      { id: "b", name: "Pointe Coton" },
      { id: "c", name: "Somewhere else", slug: "pointe-coton" },
      { id: "d", name: "!!!" },
    ];
    const anchors = placeAnchors(places);
    // The owner's stored slug wins even though the place comes later.
    expect(anchors.c).toBe("pointe-coton");
    expect(anchors.a).toBe("a");
    expect(anchors.b).toBe("b");
    expect(anchors.d).toBe("d");
    expect(new Set(Object.values(anchors)).size).toBe(places.length);
  });
});
