import { describe, it, expect } from "vitest";
import {
  normalizeText, badgesFor, hasBadge, availableBadges, matchesQuery,
  photoCount, filterPlaces, PLACE_BADGES,
} from "./place-discovery";
import type { MapLocation } from "@/lib/defaults";

// The badges are DERIVED from prose the owner already wrote, so the risk is not
// a crash — it is quietly labelling a beach wrong, or a filter chip that hides
// places it should show.

const place = (over: Partial<MapLocation>): MapLocation => ({
  id: "1", name: "Test Beach", description: "", category: "beach",
  lat: -19.7, lng: 63.4, ...over,
});

describe("normalizeText", () => {
  it("strips accents so French content matches unaccented input", () => {
    expect(normalizeText("accès à pied")).toBe("acces a pied");
    expect(normalizeText("Côte sauvage")).toBe("cote sauvage");
  });

  it("collapses punctuation and whitespace", () => {
    expect(normalizeText("Calm,   sheltered — lagoon!")).toBe("calm sheltered lagoon");
  });

  it("handles an empty string without throwing", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("badgesFor", () => {
  it("reads badges out of an English description", () => {
    const keys = badgesFor(place({ description: "Great swimming and snorkelling on the reef." })).map((b) => b.key);
    expect(keys).toContain("swim");
    expect(keys).toContain("snorkel");
  });

  it("reads them out of FRENCH content too", () => {
    // Most of this owner's descriptions are French — badges that only worked in
    // English would leave most of the catalogue unlabelled.
    const keys = badgesFor(place({ description: "", descriptionFr: "Eaux calmes, idéal pour la baignade en famille." })).map((b) => b.key);
    expect(keys).toContain("calm");
    expect(keys).toContain("swim");
    expect(keys).toContain("family");
  });

  it("reads the STORY as well as the description", () => {
    const keys = badgesFor(place({ description: "", story: "The best sunset on the island." })).map((b) => b.key);
    expect(keys).toContain("sunset");
  });

  it("caps at four so cards stay comparable at a glance", () => {
    const busy = place({
      description: "swimming snorkelling calm wild family sunset walk surf",
    });
    expect(badgesFor(busy).length).toBe(4);
    expect(badgesFor(busy, 2).length).toBe(2);
  });

  it("returns nothing rather than guessing when the text says nothing", () => {
    expect(badgesFor(place({ description: "A place." }))).toEqual([]);
  });

  it("matches inside a longer word boundary-free phrase", () => {
    expect(badgesFor(place({ description: "Perfect for swimmers." })).map((b) => b.key)).toContain("swim");
  });
});

describe("hasBadge", () => {
  it("is NOT limited by the four-badge display cap", () => {
    // The bug this guards: filtering used to run through badgesFor(), so a
    // place whose fifth badge was the filtered one vanished from its own chip.
    const busy = place({ description: "swimming snorkelling calm wild family sunset walk surf" });
    expect(badgesFor(busy).map((b) => b.key)).not.toContain("surf");
    expect(hasBadge(busy, "surf")).toBe(true);
  });

  it("returns false for an unknown badge key", () => {
    expect(hasBadge(place({ description: "swimming" }), "nonsense")).toBe(false);
  });
});

describe("availableBadges", () => {
  it("only offers chips that would return something", () => {
    const places = [place({ description: "calm lagoon" })];
    const keys = availableBadges(places).map((b) => b.key);
    expect(keys).toContain("calm");
    expect(keys).not.toContain("surf");
  });

  it("returns nothing for an empty catalogue rather than every chip", () => {
    expect(availableBadges([])).toEqual([]);
  });

  it("never offers a chip that is not a real badge", () => {
    const keys = availableBadges([place({ description: "calm swim wild" })]).map((b) => b.key);
    for (const k of keys) expect(PLACE_BADGES.some((b) => b.key === k)).toBe(true);
  });
});

describe("matchesQuery", () => {
  it("matches on the name", () => {
    expect(matchesQuery(place({ name: "Trou d'Argent" }), "argent")).toBe(true);
  });

  it("ignores accents in both directions", () => {
    expect(matchesQuery(place({ name: "Rivière Cocos" }), "riviere")).toBe(true);
    expect(matchesQuery(place({ name: "Riviere Cocos" }), "rivière")).toBe(true);
  });

  it("requires EVERY word, so it narrows rather than widens", () => {
    const p = place({ name: "Wild Beach", description: "Rough water, no shade." });
    expect(matchesQuery(p, "wild beach")).toBe(true);
    // "calm" is absent, so this must not match just because "beach" does.
    expect(matchesQuery(p, "calm beach")).toBe(false);
  });

  it("treats an empty query as 'everything'", () => {
    expect(matchesQuery(place({}), "")).toBe(true);
    expect(matchesQuery(place({}), "   ")).toBe(true);
  });

  it("searches the description and story, not just the name", () => {
    expect(matchesQuery(place({ name: "X", story: "Home to a huge coral garden." }), "coral")).toBe(true);
  });
});

describe("photoCount", () => {
  it("does not count the cover twice when it is also in the gallery", () => {
    expect(photoCount(place({ image: "a.jpg", images: ["a.jpg", "b.jpg"] }))).toBe(2);
  });

  it("counts a cover with no gallery", () => {
    expect(photoCount(place({ image: "a.jpg" }))).toBe(1);
  });

  it("is zero when there are no photos", () => {
    expect(photoCount(place({}))).toBe(0);
  });
});

describe("filterPlaces", () => {
  const places = [
    place({ id: "calm", name: "Calm Bay", description: "Sheltered lagoon, great swimming." }),
    place({ id: "wild", name: "Wild Point", description: "Rough and remote, big waves." }),
  ];

  it("filters by badge", () => {
    expect(filterPlaces(places, { badge: "calm" }).map((p) => p.id)).toEqual(["calm"]);
    expect(filterPlaces(places, { badge: "surf" }).map((p) => p.id)).toEqual(["wild"]);
  });

  it("filters by query", () => {
    expect(filterPlaces(places, { query: "remote" }).map((p) => p.id)).toEqual(["wild"]);
  });

  it("applies badge AND query together", () => {
    expect(filterPlaces(places, { badge: "calm", query: "wild" })).toEqual([]);
  });

  it("returns everything when nothing is asked for", () => {
    expect(filterPlaces(places, {}).length).toBe(2);
  });

  it("preserves the owner's ordering", () => {
    expect(filterPlaces(places, {}).map((p) => p.id)).toEqual(["calm", "wild"]);
  });

  it("does not mutate the input", () => {
    const copy = [...places];
    filterPlaces(places, { badge: "calm" });
    expect(places).toEqual(copy);
  });
});
