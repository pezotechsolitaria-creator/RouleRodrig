import { describe, it, expect } from "vitest";
import { fitTitle } from "./fit-title";

// ── 29 TITLES OVER 60 CHARACTERS, THE WORST AT 83 ───────────────────────────
//
// Found by crawling all 87 sitemap URLs. Most were hand-written and were simply
// rewritten shorter. Three could not be: the experience pages build their title
// from the operator's own name, and one of those names is 45 characters before
// any template is added.
//
// Google truncates around 60 and cuts mid-word, so the real choice is "trimmed
// where we choose" or "cut where Google chooses". This trims at a word boundary
// and lets the caller keep the price and the island, which are the parts a
// searcher is actually matching on.

describe("fitTitle", () => {
  it("leaves a name that already fits completely alone", () => {
    // The common case. No ellipsis where none is needed.
    expect(fitTitle("Balade en mer", 36)).toBe("Balade en mer");
  });

  it("does not add an ellipsis at exactly the limit", () => {
    const name = "a".repeat(20);
    expect(fitTitle(name, 20)).toBe(name);
  });

  it("cuts at a word boundary, never mid-word", () => {
    const name = "Île aux Cocos Excursion with Les Inséparables";
    const out = fitTitle(name, 36);
    expect(out.length).toBeLessThanOrEqual(36);
    expect(out.endsWith("…")).toBe(true);

    // The real property, which an "ends in a letter" check cannot express:
    // what survives must be a PREFIX of the original, and the original must
    // continue with a space. That is what "the word was not split" means —
    // ending in a letter is normal and correct ("…with Les…").
    const body = out.slice(0, -1);
    expect(name.startsWith(body)).toBe(true);
    expect(name[body.length]).toBe(" ");
  });

  it("keeps the whole title inside 60 for the real offender", () => {
    const suffix = " — Rs 1,999 in Rodrigues";
    const title = fitTitle("Île aux Cocos Excursion with Les Inséparables", 60 - suffix.length) + suffix;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toContain("Rs 1,999");
    expect(title).toContain("in Rodrigues");
  });

  it("never leaves dangling punctuation before the ellipsis", () => {
    expect(fitTitle("Rituel Signature Harmony Spa — long tail here", 32)).not.toMatch(/[\s,–—-]…$/);
  });

  it("falls back to a hard cut for one very long word", () => {
    const out = fitTitle("Supercalifragilisticexpialidocious", 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives an empty or absent name rather than throwing", () => {
    expect(fitTitle("", 30)).toBe("");
    expect(fitTitle(undefined as unknown as string, 30)).toBe("");
  });

  it("returns nothing when there is no room at all", () => {
    expect(fitTitle("anything", 0)).toBe("");
  });
});
