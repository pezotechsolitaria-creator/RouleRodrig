import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gettingAroundNotes, stayCostNote, tripCostNote } from "@/lib/browse-copy";

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
//   getting-around  built by lib/browse-copy.ts since 2026-09-29: the two
//           "from" prices from the fleet, the airport fares from the price
//           list /transfers reads (SEO audit C1, C2)
//
// Rendered and measured, not assumed: one h1 and three h2 on each, French
// throughout when the language is switched, no horizontal overflow at 375px.

const PAGE = readFileSync(join(process.cwd(), "app/browse/[category]/page.tsx"), "utf8");
const NOTES = readFileSync(join(process.cwd(), "components/browse/CategoryNotes.tsx"), "utf8");
// Every PRICE in these notes is built, not typed, since 2026-09-29: the
// getting-around notes from the fleet and the transfer price list (SEO audit
// C1, C2), and the first note on stays and tours from the prices on the cards
// under it — the tours range said Rs 700 to Rs 1,000 beside Île aux Cocos at
// Rs 1,999. What the pages render with them is pinned in
// app/browse/browse-pages-render.test.ts; the builders are called here.

/** Crude but sufficient: the typed note objects for one category block. */
function noteBlock(afterMarker: string): string {
  const i = PAGE.indexOf(afterMarker);
  expect(i, `marker not found: ${afterMarker}`).toBeGreaterThan(-1);
  const start = PAGE.indexOf("notes: [", i);
  expect(start, `no notes array after ${afterMarker}`).toBeGreaterThan(-1);
  return PAGE.slice(start, PAGE.indexOf("\n    ],", start));
}

// The live shapes, 29 Sept: stays Rs 1,000 (Lakaze Mama) to Rs 7,000 (Les
// Mangliers); trips Rs 700 (Balade en mer) to Rs 1,999 (Île aux Cocos).
const STAY = stayCostNote([1000, 2990, 7000]);
const TRIP = tripCostNote([1999, 1000, null, 700]);

describe("all three pages have real sections", () => {
  const blocks = {
    stays: noteBlock("filter: (p) => p.category === \"hotel\""),
    tours: noteBlock("filter: (p) => p.category === \"activity\" && !!p.isTour"),
  };

  for (const [name, block] of Object.entries(blocks)) {
    it(`${name} declares two typed h2 sections and a cost section read from its cards`, () => {
      expect((block.match(/\bh2:/g) ?? []).length).toBe(2);
      expect(PAGE).toContain(`costNote: ${name === "stays" ? "stayCostNote" : "tripCostNote"},`);
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

  it("builds every generated section in both languages", () => {
    const built = [
      STAY,
      TRIP,
      ...gettingAroundNotes({ carFrom: 1899, scooterFrom: 699, airport: null }),
    ];
    expect(built).toHaveLength(5);
    for (const n of built) {
      expect(n.h2 && n.h2Fr && n.body && n.bodyFr).toBeTruthy();
    }
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
  it("quotes the stay range the cards carry", () => {
    expect(STAY.body).toContain("start around Rs 1,000 and run to about Rs 7,000");
  });

  it("quotes the trip range the cards carry, Île aux Cocos included", () => {
    // Typed, this said "Rs 700 to Rs 1,000" beside a Rs 1,999 card.
    expect(TRIP.body).toContain("from about Rs 700 to Rs 1,999 per person");
  });

  it("names one price as one price, and none when nothing is priced", () => {
    expect(tripCostNote([700, 700]).body).toContain("about Rs 700 per person");
    for (const n of [stayCostNote([]), tripCostNote([null])]) {
      expect(`${n.body} ${n.bodyFr}`).not.toMatch(/Rs\s?\d/);
    }
  });

  it("types no price on the place blocks or getting-around", () => {
    // The getting-around test asserted the literal "Rs 1,999" — the stale
    // figure itself, a day after the owner repriced the Swift to Rs 1,899.
    for (const marker of ['filter: (p) => p.category === "hotel"', 'filter: (p) => p.category === "activity" && !!p.isTour']) {
      expect(noteBlock(marker)).not.toMatch(/Rs\s?\d/);
    }
    expect(PAGE).not.toContain("GETTING_AROUND_NOTES");
  });

  it("uses French digit spacing in the French copy", () => {
    // "Rs 21 475" was once read as 21 by a regex on this site. The French
    // convention is deliberate and worth keeping visible.
    expect(STAY.bodyFr).toContain(`Rs ${(1000).toLocaleString("fr-FR")} à Rs ${(7000).toLocaleString("fr-FR")}`);
    expect(TRIP.bodyFr).toContain(`Rs ${(1999).toLocaleString("fr-FR")}`);
  });
});
