import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── THE SEVEN PAGES WHERE SOMEBODY DECIDES TO RENT ──────────────────────────
//
// A crawl of all 77 sitemap URLs on 24 Sep 2026 found the vehicle detail pages
// carrying 264-305 words and ZERO h2 between them:
//
//   /browse/car/suzuki-swift-latest-gen      305w   0 h2
//   /browse/scooter/suzuki-burgman-125cc     287w   0 h2
//   /browse/car/toyota-rush-7-seater         275w   0 h2
//   ...and four more
//
// The content was never missing. Four real sections were already on the page —
// the multi-day rate table, what is included, the rental conditions, and where
// people take it — and every one of them was labelled with a styled <p> eyebrow
// instead of a heading. So the pages with the highest commercial intent on the
// site offered a crawler, and an AI engine, no structure to quote.
//
// They also carried Car / Motorcycle / Product schema but no FAQPage, while
// rendering nine rental questions visibly. That is the compliant case and the
// markup was simply absent — the opposite of the fault fixed on the category
// pages, where FAQPage was published for questions that appeared nowhere.

const PAGE = readFileSync(
  join(process.cwd(), "app/browse/[category]/[vehicle]/page.tsx"),
  "utf8",
);
const CONDITIONS = readFileSync(
  join(process.cwd(), "components/RentalConditions.tsx"),
  "utf8",
);

describe("the sections are headings, not styled paragraphs", () => {
  it("the rate table is an h2", () => {
    expect(PAGE).toMatch(/<h2[^>]*>\s*\n?\s*What it costs to hire/);
  });

  it("what is included is an h2", () => {
    expect(PAGE).toMatch(/<h2[^>]*>\s*\n?\s*What is included/);
  });

  it("the internal-links block is an h2", () => {
    expect(PAGE).toMatch(/<h2[^>]*>\s*\n?\s*Where people take it/);
  });

  it("the rental-conditions panel is an h2", () => {
    expect(CONDITIONS).toMatch(/<h2 className="font-bebas[^"]*">\s*\n?\s*<ShieldCheck/);
  });

  it("none of the four reverted to a styled <p>", () => {
    // The exact strings that were there before. If one comes back, the page
    // silently loses a quarter of its outline again.
    expect(PAGE).not.toMatch(/<p className="mb-4 font-bebas[^"]*">RATES<\/p>/);
    expect(PAGE).not.toMatch(/<p className="mb-4 font-bebas[^"]*">INCLUDED<\/p>/);
    expect(PAGE).not.toMatch(/WHERE PEOPLE TAKE IT\s*\n?\s*<\/p>/);
  });
});

describe("FAQPage points only at questions the page shows", () => {
  it("emits FAQPage from the conditions array", () => {
    expect(PAGE).toMatch(/"@type": "FAQPage"/);
    expect(PAGE).toMatch(/mainEntity: conditions\.map/);
  });

  it("uses the SAME array the visible panel renders", () => {
    // One source, so the structured data and the readable panel cannot drift.
    // Two lists maintained separately is exactly how a page ends up publishing
    // a question nobody can read.
    expect(PAGE).toMatch(/const conditions = pickConditions\(/);
    expect(PAGE).toMatch(/<RentalConditions items=\{conditions\} \/>/);
  });

  it("omits the markup entirely when there are no conditions", () => {
    // An empty FAQPage is worse than none: it claims a rich result the page
    // cannot support.
    expect(PAGE).toMatch(/\.\.\.\(conditions\.length/);
  });

  it("anchors the node to this vehicle's own URL", () => {
    // Every vehicle used to point its Offer at the category page. Same mistake,
    // different node, if the FAQ id is not per-page.
    expect(PAGE).toMatch(/"@id": `\$\{url\}#faq`/);
  });
});
