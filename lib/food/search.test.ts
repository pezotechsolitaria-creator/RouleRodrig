import { describe, it, expect } from "vitest";
import { parseFoodQuery, isEmptyFoodQuery } from "./search";

// The vocabulary layer is in TypeScript precisely so it can be tested. These
// are the queries a Rodrigues customer actually types — a visitor who knows
// the English word, a local who knows the Creole one, and the person who is
// describing a budget rather than a dish.

describe("parseFoodQuery", () => {
  it("returns nothing for an empty query", () => {
    expect(isEmptyFoodQuery(parseFoodQuery(""))).toBe(true);
    expect(isEmptyFoodQuery(parseFoodQuery(null))).toBe(true);
    expect(isEmptyFoodQuery(parseFoodQuery("   "))).toBe(true);
  });

  it("expands a term to every word for the same thing, whichever one was typed", () => {
    // The visitor's word must find the menu's word and vice versa — this is the
    // single most important thing this module does on an island whose signature
    // dish has three names.
    const fromEnglish = parseFoodQuery("octopus");
    const fromCreole = parseFoodQuery("ourit");
    expect(fromEnglish.q).toContain('"ourite"');
    expect(fromEnglish.q).toContain('"octopus"');
    expect(fromCreole.q).toContain('"octopus"');
    expect(fromCreole.q).toContain('"ourite"');
  });

  it("ORs the terms rather than ANDing them", () => {
    // websearch_to_tsquery treats a bare space as AND, so "grilled fish" would
    // require both words in one dish name and match almost nothing.
    const q = parseFoodQuery("fish");
    expect(q.q).toMatch(/ OR /);
  });

  it("strips accents so poulet grillé and poulet grille agree", () => {
    expect(parseFoodQuery("grillé").q).toEqual(parseFoodQuery("grille").q);
  });

  it("turns a meal word into a filter, not a search term", () => {
    // Left in the term list, "breakfast" matches no dish name and drags the
    // whole query to zero results.
    const q = parseFoodQuery("breakfast");
    expect(q.meal).toBe("breakfast");
  });

  it("reads tonight as dinner", () => {
    expect(parseFoodQuery("something for tonight").meal).toBe("dinner");
  });

  it("turns a dietary word into a filter", () => {
    expect(parseFoodQuery("vegetarian").dietary).toContain("vegetarian");
    expect(parseFoodQuery("veggie").dietary).toContain("vegetarian");
  });

  it("turns cheap into a price ceiling", () => {
    const q = parseFoodQuery("cheap lunch");
    expect(q.maxPrice).toBe(25_000);
    expect(q.meal).toBe("lunch");
  });

  it("reads an explicit budget in rupees, in minor units", () => {
    expect(parseFoodQuery("under 300").maxPrice).toBe(30_000);
    expect(parseFoodQuery("less than Rs 150").maxPrice).toBe(15_000);
  });

  it("prefers an explicit budget over the cheap default", () => {
    expect(parseFoodQuery("cheap food under 400").maxPrice).toBe(40_000);
  });

  it("drops the number so it is not searched as a word", () => {
    expect(parseFoodQuery("under 300").q).toBeNull();
  });

  it("drops filler words entirely", () => {
    expect(isEmptyFoodQuery(parseFoodQuery("I want something to eat"))).toBe(true);
  });

  it("drops fragments too short to be a dish name", () => {
    // "bo" would otherwise match half the menu through the ilike fallback.
    expect(parseFoodQuery("bo").q).toBeNull();
  });

  it("keeps an unknown word as itself rather than discarding it", () => {
    // A dish the vocabulary has never heard of must still be findable by name.
    expect(parseFoodQuery("mine frit").q).toContain('"frit"');
    // The menu now spells it "Mine Frite Légumes". `simple` does not fold
    // accents and does not stem, so without these expansions the dish would be
    // unreachable by either of the two words a customer actually types.
    expect(parseFoodQuery("mine frit").q).toContain('"frite"');
    expect(parseFoodQuery("legume").q).toContain('"légumes"');
    expect(parseFoodQuery("vegetables").q).toContain('"légumes"');
  });

  it("combines a dish, a meal and a budget from one sentence", () => {
    const q = parseFoodQuery("cheap chicken for dinner");
    expect(q.q).toContain('"poulet"');
    expect(q.meal).toBe("dinner");
    expect(q.maxPrice).toBe(25_000);
  });

  it("quotes each term so a hyphenated one is not re-split", () => {
    const q = parseFoodQuery("petit-dejeuner");
    expect(q.meal).toBe("breakfast");
  });

  it("ignores punctuation a customer types", () => {
    expect(parseFoodQuery("ourite!!!").q).toContain('"octopus"');
  });
});

// Halal was in the dietary vocabulary from the start and reachable by nobody:
// the tag existed, the filter chip did not, and a misspelling found nothing.
describe("halal is findable however it is written", () => {
  it("accepts the spellings people actually use", () => {
    for (const q of ["halal", "halaal", "hallal", "HALAL", "  Halal  "]) {
      expect(parseFoodQuery(q).dietary, q).toContain("halal");
    }
  });

  it("finds it inside a longer question", () => {
    expect(parseFoodQuery("halal chicken").dietary).toContain("halal");
  });

  it("does not invent it when nobody asked", () => {
    expect(parseFoodQuery("grilled fish").dietary).not.toContain("halal");
  });
});
