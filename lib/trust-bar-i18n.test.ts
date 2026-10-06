import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RENT_COPY } from "@/lib/rentals/copy";

const SRC = readFileSync(join(process.cwd(), "components", "TrustBar.tsx"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── TWELVE ENGLISH PROMISES UNDER A FRENCH HEADING ─────────────────────────
//
// TrustBar was a server component with its copy hardcoded in English, so the
// "Why book with us" bar sat directly beneath a French h1 telling a French
// reader "Air conditioning / Automatic, insured, ready to drive". It renders
// no data and fetches nothing, so reading the language costs it nothing — and
// it still server-renders, exactly like the header and the footer do.
//
// Since the owner brief of 6 Oct 2026 the bar is four short lines from the
// rentals copy (RENT_COPY.trust), the same file the booking sheet speaks from.
describe("the trust bar speaks the reader's language", () => {
  it("reads the language", () => {
    expect(CODE).toContain('"use client"');
    expect(CODE).toContain("useLanguage()");
    expect(CODE).toContain("RENT_COPY[rentLang(language)].trust");
  });

  it("gives every line all three languages", () => {
    // One missing line would fall back to nothing, or to English, which is
    // precisely the failure this component already shipped.
    for (const lang of ["en", "fr", "cr"] as const) {
      const lines = RENT_COPY[lang].trust;
      expect(lines).toHaveLength(4);
      for (const l of lines) expect(l.trim().length, `${lang}: "${l}"`).toBeGreaterThan(0);
    }
    // Translated, not copied: every French and Kreol line differs from the
    // English one beside it.
    RENT_COPY.en.trust.forEach((en, i) => {
      expect(RENT_COPY.fr.trust[i]).not.toBe(en);
      expect(RENT_COPY.cr.trust[i]).not.toBe(en);
    });
  });

  it("has no bare English line left in the component", () => {
    expect(CODE).not.toMatch(/title:\s*"/);
    expect(CODE).not.toMatch(/>\s*(Insured|No mileage cap|Delivered to your stay)\s*</);
  });

  it("keys the list on a stable value, not the translated one", () => {
    // Keying on the rendered text remounts every row on a language change.
    expect(CODE).toContain("key={i}");
  });

  it("makes no promise a car or a kayak cannot keep, in any language", () => {
    // These are promises, so they have to be true of the page they are on: a
    // helmet is not included with a car, and nothing here is a "free" slogan.
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(RENT_COPY[lang].trust.join(" ")).not.toMatch(/helmet|casque|kask|free|gratuit|gratis/i);
    }
  });
});
