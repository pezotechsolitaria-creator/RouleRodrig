import { describe, it, expect } from "vitest";
import { fitTitle, fitTitleWithTails } from "./fit-title";

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

// ── THE ISLAND YIELDS BEFORE THE NAME (SEO audit 2026-09-29 T6) ─────────────
//
// The live title was "Île aux Cocos Excursion with Les… — Rs 1,999 in
// Rodrigues": the name was clipped to keep " in Rodrigues", so the result no
// longer said whose trip it was.

describe("fitTitleWithTails", () => {
  const NAME = "Île aux Cocos Excursion with Les Inséparables";
  const PRICE = " — Rs 1,999";

  it("keeps everything when everything fits", () => {
    expect(fitTitleWithTails("Balade en mer", " — Rs 700", " in Rodrigues")).toBe(
      "Balade en mer — Rs 700 in Rodrigues",
    );
  });

  it("drops the optional tail before touching the name", () => {
    const title = fitTitleWithTails(NAME, PRICE, " in Rodrigues", 60);
    expect(title).toBe(`${NAME}${PRICE}`);
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("clips the name only when name and price alone overflow, and never the price", () => {
    const long = "Rituel Signature Harmony Spa with a very long operator name here";
    const title = fitTitleWithTails(long, PRICE, " in Rodrigues", 60);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(`…${PRICE}`)).toBe(true);
    expect(title).not.toContain("in Rodrigues");
  });

  it("works with no price at all", () => {
    expect(fitTitleWithTails("Balade en mer", "", " in Rodrigues")).toBe("Balade en mer in Rodrigues");
  });
});
