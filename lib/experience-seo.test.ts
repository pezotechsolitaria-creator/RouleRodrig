import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromPriceOf } from "./experiences";

// ── WHY THE SCOOTER PAGE SELLS AND THIS ONE DID NOT (M135) ──────────────────
//
// The owner's own comparison: scooters bring roughly ten customers, cars and
// experiences bring none. Put the two titles side by side and one difference
// is doing a lot of work:
//
//   works    "Location scooter Rodrigues dès Rs 699/jour"
//   did not  "Sea trips in Rodrigues"
//
// A price in the title pre-qualifies the click. Someone who sees Rs 700 and
// taps is a customer; someone who taps a priceless title, meets Rs 2,000 and
// leaves teaches the ranking that this result did not answer the question. It
// is also the number an assistant repeats when asked what a boat trip costs.

const ROOT = join(__dirname, "..");
const page = () =>
  readFileSync(join(ROOT, "app/experiences/[type]/page.tsx"), "utf8");
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("fromPriceOf", () => {
  it("takes the cheapest, which is what 'from' means", () => {
    expect(fromPriceOf([{ depositAmount: 1000 }, { depositAmount: 700 }])).toBe(700);
  });

  it("returns null when nothing is priced, never 0", () => {
    // "From Rs 0" in a search result reads as either free or broken, and both
    // cost the click. No price is better than a wrong one.
    expect(fromPriceOf([])).toBeNull();
    expect(fromPriceOf([{ depositAmount: undefined }, { depositAmount: null }])).toBeNull();
  });

  it("ignores a zero rather than treating it as the cheapest", () => {
    expect(fromPriceOf([{ depositAmount: 0 }, { depositAmount: 700 }])).toBe(700);
  });

  it("survives a listing with a nonsense price", () => {
    expect(fromPriceOf([{ depositAmount: -5 }, { depositAmount: 700 }])).toBe(700);
  });

  it("matches the real catalogue: boat 700, massage 2000", () => {
    // The live listings as the owner priced them. If these change, the titles
    // change with them — which is the point of reading rather than hardcoding.
    expect(fromPriceOf([{ depositAmount: 700 }, { depositAmount: 1000 }])).toBe(700);
    expect(fromPriceOf([{ depositAmount: 2000 }])).toBe(2000);
  });
});

describe("the experiences page metadata", () => {
  const src = stripComments(page());

  it("puts a real price in the title, the way the page that works does", () => {
    expect(src).toMatch(/from Rs \$\{from\.toLocaleString/);
  });

  it("keeps the plain title when nothing is priced", () => {
    // A vertical with no prices must not invent a figure to look consistent.
    expect(src).toMatch(/from\s*\?[\s\S]{0,200}:\s*`\$\{copy\.title\} \| Roulé Rodrigues`/);
  });

  it("shares the real photograph, not the generic site card", () => {
    // The same picture for a massage and a fishing trip tells whoever sees the
    // link that nobody looked.
    expect(src).toMatch(/places\.find\(\(p\) => p\.image\)/);
    expect(src).toMatch(/og-image\.jpg/); // still the fallback, deliberately
  });

  it("reads the price from the listings rather than restating it", () => {
    expect(src).toMatch(/fromPriceOf\(places\)/);
    // A literal price in the metadata is the Rs 599/699 bug waiting to happen.
    expect(src).not.toMatch(/from Rs 700|from Rs 2000|from Rs 1500/);
  });

  it("emits a Service and an Offer for each experience", () => {
    expect(src).toMatch(/experienceLd\(/);
  });
});
