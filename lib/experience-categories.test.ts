import { describe, it, expect } from "vitest";
import {
  EXPERIENCE_CATEGORIES, availableCategories, categoriesOf, categoryLabel,
  inCategory, isCategoryKey,
} from "./experience-categories";
import type { RecommendedPlace } from "./defaults";

const place = (over: Partial<RecommendedPlace> = {}): RecommendedPlace =>
  ({ id: "p", category: "activity", name: "Trip", description: "", ...over }) as RecommendedPlace;

// The old behaviour, reproduced so the fallback can be tested honestly.
const textMatch = (p: RecommendedPlace, k: string) =>
  [...(p.highlights ?? []), p.name, p.description].join(" ").toLowerCase().includes(k);

describe("the vocabulary", () => {
  it("has no duplicate keys", () => {
    const keys = EXPERIENCE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("labels every category in both languages", () => {
    for (const c of EXPERIENCE_CATEGORIES) {
      expect(c.en.trim().length).toBeGreaterThan(0);
      expect(c.fr.trim().length).toBeGreaterThan(0);
    }
  });

  it("recognises its own keys and rejects anything else", () => {
    expect(isCategoryKey("romantic")).toBe(true);
    expect(isCategoryKey("Romantic")).toBe(false);
    expect(isCategoryKey("nonsense")).toBe(false);
  });

  it("falls back to the raw key rather than rendering blank", () => {
    expect(categoryLabel("romantic", "en")).toBe("Romantic");
    expect(categoryLabel("romantic", "fr")).toBe("Romantique");
    expect(categoryLabel("gone", "en")).toBe("gone");
  });
});

describe("categoriesOf", () => {
  it("drops keys that are no longer published", () => {
    // A retired category must not leave a bare slug on a card, and the owner's
    // saved data is not rewritten just because the list changed.
    const p = place({ categories: ["ocean", "retired-key", "romantic"] });
    expect(categoriesOf(p)).toEqual(["ocean", "romantic"]);
  });

  it("treats an untagged listing as having none", () => {
    expect(categoriesOf(place())).toEqual([]);
  });
});

describe("inCategory", () => {
  it("judges a TAGGED listing purely on its tags", () => {
    // The bug this fixes: a charter describing itself as a "family-run
    // business" was matching the Family filter.
    const p = place({ name: "Family-run charter", categories: ["ocean"] });
    expect(inCategory(p, "ocean", textMatch)).toBe(true);
    expect(inCategory(p, "family", textMatch)).toBe(false);
  });

  it("carries many categories at once, which is the whole point", () => {
    const sunset = place({ categories: ["ocean", "romantic", "photo"] });
    for (const k of ["ocean", "romantic", "photo"]) {
      expect(inCategory(sunset, k, textMatch)).toBe(true);
    }
    expect(inCategory(sunset, "fishing", textMatch)).toBe(false);
  });

  it("keeps the old text behaviour for an UNTAGGED listing", () => {
    // Every listing that predates this has no tags. If tagging were required
    // they would all vanish from every filter the day it shipped.
    const p = place({ name: "Romantic sunset cruise" });
    expect(inCategory(p, "romantic", textMatch)).toBe(true);
    expect(inCategory(p, "fishing", textMatch)).toBe(false);
  });
});

describe("availableCategories", () => {
  it("offers only categories something is actually in", () => {
    const places = [place({ categories: ["ocean"] }), place({ categories: ["romantic"] })];
    expect(availableCategories(places, textMatch)).toEqual(["ocean", "romantic"]);
  });

  it("returns them in vocabulary order, not catalogue order", () => {
    // Otherwise the chip row reshuffles every time the owner adds a listing.
    const places = [place({ categories: ["romantic"] }), place({ categories: ["ocean"] })];
    expect(availableCategories(places, textMatch)).toEqual(["ocean", "romantic"]);
  });

  it("offers nothing for an empty catalogue", () => {
    expect(availableCategories([], textMatch)).toEqual([]);
  });
});

describe("the untagged fallback uses real words", () => {
  it("finds a snorkelling trip under Ocean, though it never says 'ocean'", () => {
    // Matching the bare category key found nothing and every chip vanished —
    // worse than the imprecise filtering this replaces.
    const p = place({ name: "Snorkelling at Rivière Banane" });
    expect(inCategory(p, "ocean", textMatch)).toBe(true);
  });

  it("finds a sunset cruise under Romantic and Evening", () => {
    const p = place({ name: "Sunset cruise", description: "Sail into the sunset" });
    expect(inCategory(p, "romantic", textMatch)).toBe(true);
    expect(inCategory(p, "evening", textMatch)).toBe(true);
  });

  it("finds a massage under Wellness", () => {
    expect(inCategory(place({ name: "Massage relaxant" }), "wellness", textMatch)).toBe(true);
  });

  it("still offers chips for a wholly untagged catalogue", () => {
    // The regression: a real catalogue produced ZERO chips.
    const catalogue = [
      place({ name: "Snorkelling trip" }),
      place({ name: "Pêche traditionnelle" }),
      place({ name: "Massage aux huiles" }),
    ];
    const out = availableCategories(catalogue, textMatch);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("ocean");
    expect(out).toContain("fishing");
    expect(out).toContain("wellness");
  });

  it("a TAGGED listing ignores synonyms entirely", () => {
    // "Sunset cruise" would match romantic by synonym, but the owner has said
    // it is Ocean only, and the owner wins.
    const p = place({ name: "Sunset cruise", categories: ["ocean"] });
    expect(inCategory(p, "ocean", textMatch)).toBe(true);
    expect(inCategory(p, "romantic", textMatch)).toBe(false);
  });
});
