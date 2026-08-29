import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ── THE THIRD FRENCH COMMERCIAL PAGE (M138) ─────────────────────────────────
//
// The only two pages on this site that produce customers are hand-written
// French landing pages, server-rendered. /browse/stays answered "où dormir à
// Rodrigues" in English, to an audience that searches in French.
//
// This is the French EQUIVALENT of an existing English page, paired by hreflang
// both ways — which is what hreflang is for. What would be a doorway is
// /hebergement-pas-cher-rodrigues and /villa-luxe-rodrigues splitting the same
// content across near-duplicates, and these tests exist partly to make that
// distinction explicit for whoever reads them next.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const PAGE = "app/fr/hebergement-rodrigues/page.tsx";
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("the French stays page exists and prices itself", () => {
  const src = stripComments(read(PAGE));

  it("is a real route", () => {
    expect(existsSync(join(ROOT, PAGE))).toBe(true);
  });

  it("puts the nightly price in the title, like the pages that convert", () => {
    expect(src).toMatch(/dès Rs \$\{rs\(from\)\}\/nuit/);
  });

  it("reads that price from the listings, never types it", () => {
    // A hardcoded rate becomes a promise the booking does not honour the first
    // time the owner edits a listing.
    expect(src).toMatch(/fromPriceOf\(stays\)/);
    expect(src).toMatch(/p\.category === "hotel"/);
    expect(src).not.toMatch(/Rs 1 ?000\b(?!.*rs\()/);
  });

  it("keeps a working page when nothing is priced, without inventing a rate", () => {
    expect(src).toMatch(/from\s*\?\s*TITLE\(from\)\s*:/);
    expect(src).toMatch(/const faq = from \? FAQ\(from, stays\.length\) : \[\]/);
  });

  it("counts the properties rather than asserting a number", () => {
    expect(src).toMatch(/FAQ\(from, stays\.length\)/);
  });
});

describe("what it deliberately does not claim", () => {
  const src = stripComments(read(PAGE));

  it("invents no amenities", () => {
    // None of this is written down anywhere in the listings, and an
    // accommodation page that invents them is how a guest arrives expecting a
    // pool. If the owner adds the fields, the page can say it then.
    for (const claim of [/petit-déjeuner/i, /piscine/i, /\bwifi\b/i, /climatis/i, /étoiles/i]) {
      expect(src, `claims something unsourced: ${claim}`).not.toMatch(claim);
    }
  });

  it("invents no rating", () => {
    expect(src).not.toMatch(/aggregateRating|avis vérifiés|noté/i);
  });
});

describe("it is paired, not orphaned", () => {
  it("declares hreflang to the English page", () => {
    const src = read(PAGE);
    // Generic "en"/"fr", not "en-US"/"fr-FR": the audience is largely
    // fr-RE (Réunion) and fr-MU (Mauritius), and region-narrow codes
    // under-target exactly those visitors.
    expect(src).toMatch(/"en": `\$\{SITE_URL\}\/browse\/stays`/);
    expect(src).toMatch(/"fr": `\$\{SITE_URL\}\/fr\/hebergement-rodrigues`/);
  });

  it("and /browse/stays declares it back", () => {
    // A one-way hreflang is silently ignored — this half is not optional.
    const browse = read("app/browse/[category]/page.tsx");
    expect(browse).toMatch(/fr: "\/fr\/hebergement-rodrigues"/);
  });

  it("is in the sitemap at the commercial tier", () => {
    const sitemap = read("app/sitemap.ts");
    expect(sitemap).toMatch(/fr\/hebergement-rodrigues/);
    const block = sitemap.slice(sitemap.indexOf("fr/hebergement-rodrigues"));
    expect(block.slice(0, 220)).toMatch(/priority: 0\.9/);
  });

  it("sends the reader on to a way of getting there", () => {
    // Somebody booking a room needs to reach it, and the two pages that
    // already convert are the answer.
    const src = read(PAGE);
    expect(src).toMatch(/location-voiture-rodrigues/);
    expect(src).toMatch(/location-scooter-rodrigues/);
  });
});

describe("the English stays page prices itself too", () => {
  const src = stripComments(read("app/browse/[category]/page.tsx"));

  it("appends a real from-price to place-category titles", () => {
    expect(src).toMatch(/from Rs \$\{from\.toLocaleString/);
  });

  it("falls back to the plain title when the listings cannot be read", () => {
    // A content read that half-failed must not produce a priceless promise or
    // a wrong one.
    expect(src).toMatch(/listings !== null/);
  });
});
