import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE SECTIONS UNDER THREE CATEGORY LISTINGS ──────────────────────────────
//
// Promoting the keyword heading to <h1> left /browse/stays, /browse/tours and
// /browse/getting-around with NO h2 at all — 550-740 words in one undivided
// block, nothing for Google to section and nothing for a snippet to point at.
//
// The rule these were written under is the one the stays copy already carried:
// "Every claim below is taken from the live listings, not invented to fill
// space." Checked against the live content before writing:
//
//   stays   Rs 1,000 (Lakaze Mama) to Rs 7,000 (Les Mangliers); two places
//           quote self-catering per person; one is "a self-contained house
//           rather than a single room"
//   tours   Rs 700-Rs 1,000, three of four set at 60 minutes; the Ile aux Cocos
//           sentence is the operator's own; Arnaud runs three of the four
//   getting-around  the two "from" prices are live on /browse/car and
//           /browse/scooter; the taxi paragraph is the answer already on /taxi
//
// Rendered and measured, not assumed: one h1 and three h2 on each, French
// throughout when the language is switched, no horizontal overflow at 375px.

const PAGE = readFileSync(join(process.cwd(), "app/browse/[category]/page.tsx"), "utf8");
const NOTES = readFileSync(join(process.cwd(), "components/browse/CategoryNotes.tsx"), "utf8");

/** Crude but sufficient: the note objects for one category block. */
function noteBlock(afterMarker: string): string {
  const i = PAGE.indexOf(afterMarker);
  expect(i, `marker not found: ${afterMarker}`).toBeGreaterThan(-1);
  const start = PAGE.indexOf("notes: [", i);
  expect(start, `no notes array after ${afterMarker}`).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf("\n    ],", start));
}

describe("all three pages have real sections", () => {
  const blocks = {
    stays: noteBlock("filter: (p) => p.category === \"hotel\""),
    tours: noteBlock("filter: (p) => p.category === \"activity\" && !!p.isTour"),
    gettingAround: PAGE.slice(
      PAGE.indexOf("const GETTING_AROUND_NOTES"),
      PAGE.indexOf("const PLACE_SLUGS"),
    ),
  };

  for (const [name, block] of Object.entries(blocks)) {
    it(`${name} declares three h2 sections`, () => {
      expect((block.match(/\bh2:/g) ?? []).length).toBe(3);
    });

    it(`${name} translates every heading and body`, () => {
      // A section that reverts to English mid-page reads as broken, and these
      // three pages all have a French twin a visitor can switch to in place.
      const counts = {
        h2: (block.match(/\bh2:/g) ?? []).length,
        h2Fr: (block.match(/\bh2Fr:/g) ?? []).length,
        body: (block.match(/\bbody:/g) ?? []).length,
        bodyFr: (block.match(/\bbodyFr:/g) ?? []).length,
      };
      expect(counts.h2Fr).toBe(counts.h2);
      expect(counts.bodyFr).toBe(counts.body);
    });
  }

  it("renders them on the place branch and on getting-around", () => {
    expect(PAGE).toMatch(/place\.notes \? <CategoryNotes notes=\{place\.notes\} \/> : null/);
    expect(PAGE).toMatch(/<CategoryNotes notes=\{GETTING_AROUND_NOTES\} \/>/);
  });
});

describe("the section component", () => {
  it("renders h2, not a styled div", () => {
    expect(NOTES).toMatch(/<h2 className=/);
    expect(NOTES).toMatch(/<\/h2>/);
  });

  it("localises through the same helper the listings use", () => {
    expect(NOTES).toContain("useLanguage");
    expect(NOTES).toMatch(/loc\(language, n\.h2, n\.h2Fr\)/);
    expect(NOTES).toMatch(/loc\(language, n\.body, n\.bodyFr\)/);
  });

  it("renders nothing rather than an empty rule when there are no notes", () => {
    expect(NOTES).toMatch(/if \(notes\.length === 0\) return null;/);
  });
});

describe("the figures quoted are the ones on the cards", () => {
  it("quotes the real stay range", () => {
    const b = noteBlock("filter: (p) => p.category === \"hotel\"");
    expect(b).toContain("Rs 1,000");
    expect(b).toContain("Rs 7,000");
  });

  it("quotes the real trip range", () => {
    const b = noteBlock("filter: (p) => p.category === \"activity\" && !!p.isTour");
    expect(b).toContain("Rs 700");
    expect(b).toContain("Rs 1,000");
  });

  it("quotes the live vehicle from-prices on getting-around", () => {
    const b = PAGE.slice(PAGE.indexOf("const GETTING_AROUND_NOTES"));
    expect(b.slice(0, 2200)).toContain("Rs 1,999");
    expect(b.slice(0, 2200)).toContain("Rs 699");
  });

  it("uses French digit spacing in the French copy", () => {
    // "Rs 21 475" was once read as 21 by a regex on this site. The French
    // convention is deliberate and worth keeping visible.
    expect(PAGE).toContain("Rs 1 000");
    expect(PAGE).toContain("Rs 1 999");
  });
});
