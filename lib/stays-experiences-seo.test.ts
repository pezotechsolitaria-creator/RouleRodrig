import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stayLd } from "./schema";
import { experienceFaq, EXPERIENCES } from "./experiences";

// ── THE SAME TREATMENT CARS GOT, FOR EXPERIENCES AND STAYS (M137) ───────────
//
// Measured against the two pages that actually produce customers. Both carry a
// visible FAQ wired to FAQPage schema, and both state a price a machine can
// read. Experiences carried neither. Stays emitted a breadcrumb and a list of
// names while the page's own description promised "See photos and prices".

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const LISTINGS = [
  { name: "Balade en mer", depositAmount: 700, providerName: "Skipper Arnaud", durationMinutes: null },
  { name: "Plongée en apnée", depositAmount: 1000, providerName: "Captain Arnaud", durationMinutes: null },
];

describe("experienceFaq is built from the listings, never written out", () => {
  const faq = experienceFaq(EXPERIENCES.boat, LISTINGS);

  it("quotes the cheapest real price", () => {
    const priced = faq.find((f) => /how much/i.test(f.q));
    expect(priced).toBeTruthy();
    expect(priced!.a).toContain("Rs 700");
    expect(priced!.a).not.toContain("Rs 1,000"); // the dearer one is not "from"
  });

  it("names the real operators, because on this island the name is the credential", () => {
    const who = faq.find((f) => /who runs/i.test(f.q));
    expect(who!.a).toContain("Skipper Arnaud");
    expect(who!.a).toContain("Captain Arnaud");
  });

  it("omits the operator question entirely when nobody is named", () => {
    // Better silent than vague. "Local operators" with no names is filler an
    // assistant will not quote and a reader does not trust.
    const anon = experienceFaq(EXPERIENCES.boat, [{ name: "x", depositAmount: 700 }]);
    expect(anon.some((f) => /who runs/i.test(f.q))).toBe(false);
  });

  it("omits the price question when nothing is priced, rather than saying Rs 0", () => {
    const unpriced = experienceFaq(EXPERIENCES.boat, [{ name: "x" }]);
    expect(unpriced.some((f) => /how much/i.test(f.q))).toBe(false);
    expect(JSON.stringify(unpriced)).not.toMatch(/Rs 0\b/);
  });

  it("explains the availability-first flow, which is a real differentiator", () => {
    // M127: request, we confirm with the operator, then you pay. It is also the
    // exact worry that precedes booking anything abroad.
    const pay = faq.find((f) => /before it is confirmed/i.test(f.q));
    expect(pay!.a).toMatch(/only once it is confirmed/i);
  });

  it("writes answers that survive being quoted out of context", () => {
    // An assistant lifts one answer with no page around it. Every answer must
    // restate its own subject and carry a concrete fact.
    for (const f of faq) {
      expect(f.a.length, `too short to stand alone: ${f.q}`).toBeGreaterThan(80);
    }
  });
});

describe("the experiences page shows the FAQ it claims in schema", () => {
  const src = stripComments(read("app/experiences/[type]/page.tsx"));

  it("builds it once and reads it twice", () => {
    // Schema describing text a human cannot see is a Google violation. One
    // array makes that impossible by construction.
    expect(src).toMatch(/const faq = experienceFaq\(copy, places\)/);
    expect(src).toMatch(/"@type": "FAQPage"/);
    expect(src).toMatch(/faq\.map\(\(f\) => \(/);
  });

  it("renders the questions visibly", () => {
    expect(src).toMatch(/Questions fréquentes/);
  });
});

describe("stayLd", () => {
  const ld = stayLd({ name: "Villa Paradise", price: 2500, url: "u" });

  it("is a LodgingBusiness — somebody sleeps in it", () => {
    expect(ld["@type"]).toBe("LodgingBusiness");
  });

  it("uses priceRange, because the total depends how long they stay", () => {
    // A hard total would be a number the booking does not charge.
    expect(ld.priceRange).toMatch(/From Rs 2,500/);
  });

  it("says it is on Rodrigues", () => {
    expect(JSON.stringify(ld.address)).toMatch(/Rodrigues/);
  });

  it("carries no price at all when none is set", () => {
    const free = stayLd({ name: "x", price: null, url: "u" });
    expect(free.priceRange).toBeUndefined();
    expect(JSON.stringify(free)).not.toMatch(/"price":\s*0/);
  });

  it("never invents a rating", () => {
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating/);
  });
});

describe("the browse page prices stays and activities", () => {
  const src = stripComments(read("app/browse/[category]/page.tsx"));

  it("types a guesthouse and a boat trip differently", () => {
    expect(src).toMatch(/i\.category === "hotel"/);
    expect(src).toMatch(/stayLd\(/);
    expect(src).toMatch(/experienceLd\(/);
  });

  it("reads the price off the listing", () => {
    expect(src).toMatch(/i\.depositAmount/);
  });
});

describe("the French activities page points at the bookable activities", () => {
  it("links to /experiences", () => {
    // It described what to do on Rodrigues and linked to guides, scooters and
    // cars — everywhere except the thing it was about.
    const src = read("app/fr/que-faire-a-rodrigues/page.tsx");
    expect(src).toMatch(/href: "\/experiences"/);
  });
});
