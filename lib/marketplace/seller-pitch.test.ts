import { describe, it, expect } from "vitest";
import { sellerPitch, type MonetizationModel } from "./fees";

// /shop makes a promise to prospective merchants about what they will be
// charged. It used to be a hardcoded sentence, which was true only for the
// model that happened to be configured the day it was typed. These tests exist
// so that switching the model can never leave a false promise on a public
// recruitment page.

describe("sellerPitch", () => {
  it("says 'no commission' ONLY when nothing is actually charged per sale", () => {
    expect(sellerPitch("subscription", 0)).toContain("no commission");

    // The dangerous case: still 'subscription', but a rate has been set.
    // Claiming "no commission" here would be a lie about money.
    expect(sellerPitch("subscription", 0.1)).not.toContain("no commission");
    expect(sellerPitch("subscription", 0.1)).toContain("10%");
  });

  it("states the real rate for every model that charges one", () => {
    expect(sellerPitch("commission", 0.15)).toContain("15%");
    expect(sellerPitch("hybrid", 0.075)).toContain("7.5%");
    for (const m of ["commission", "hybrid"] as MonetizationModel[]) {
      expect(sellerPitch(m, 0.2), m).not.toContain("no commission");
    }
  });

  it("mentions the monthly fee exactly when one is billed", () => {
    expect(sellerPitch("subscription", 0)).toMatch(/subscription/i);
    expect(sellerPitch("hybrid", 0.1)).toMatch(/monthly|subscription/i);
    expect(sellerPitch("commission", 0.1)).toMatch(/no monthly fee/i);
    expect(sellerPitch("free", 0)).toMatch(/no monthly fee/i);
  });

  it("is honest about the free launch model", () => {
    const pitch = sellerPitch("free", 0);
    expect(pitch).toContain("no monthly fee");
    expect(pitch).toContain("no commission");
  });

  it("never returns an empty or trailing-punctuation string", () => {
    // The page renders `— {pitch}.` so a blank or pre-punctuated value would
    // produce "— ." or a double full stop.
    for (const m of ["free", "commission", "subscription", "hybrid"] as MonetizationModel[]) {
      const pitch = sellerPitch(m, 0.1);
      expect(pitch.trim().length, m).toBeGreaterThan(10);
      expect(pitch.trim().endsWith("."), m).toBe(false);
    }
  });
});

describe("sellerPitch speaks the reader's language", () => {
  const LANGS = ["en", "fr", "cr"] as const;
  const MODELS: MonetizationModel[] = ["free", "commission", "subscription", "hybrid"];

  it("says something real in all three, for every model", () => {
    for (const m of MODELS) {
      for (const lang of LANGS) {
        const out = sellerPitch(m, 0.1, lang);
        expect(out.trim(), `${m}/${lang}`).not.toBe("");
      }
    }
  });

  it("quotes the SAME percentage whatever the language", () => {
    // The reason this function exists at all is that a claim about what a
    // merchant will be charged must come from the thing that charges them.
    // A translation that promised a different number would be worse than an
    // untranslated sentence.
    for (const m of ["commission", "hybrid"] as const) {
      for (const lang of LANGS) {
        expect(sellerPitch(m, 0.15, lang), `${m}/${lang}`).toContain("15%");
      }
    }
  });

  it("never leaves the English clause inside a translated sentence", () => {
    // The actual bug: /shop was translated while this sentence was not, so the
    // French recruitment paragraph ended "...— no commission on your sales".
    for (const lang of ["fr", "cr"] as const) {
      for (const m of MODELS) {
        expect(sellerPitch(m, 0, lang), `${m}/${lang}`).not.toContain(
          "no commission on your sales",
        );
        expect(sellerPitch(m, 0.1, lang), `${m}/${lang}`).not.toContain(
          "monthly subscription",
        );
      }
    }
  });

  it("still defaults to English when no language is given", () => {
    expect(sellerPitch("subscription", 0)).toBe(
      sellerPitch("subscription", 0, "en"),
    );
  });
});
