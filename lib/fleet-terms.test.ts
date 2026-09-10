import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fleetTerm, fleetTerms, fleetPrice } from "./fleet-terms";

// ── THE HALF OF A FLEET CARD loc() NEVER TOUCHED ───────────────────────────
//
// tagline and description have *Fr/*Cr siblings. specs, included, badge, unit
// and the price wrapper do not, and nothing translated them — so every French
// and Kreol fleet card read "NEW / Air conditioning / Automatic / 5 Seats /
// Full tank of fuel / Insurance / Free delivery / 24/7 support / From Rs 1,899
// (Free delivery) / day". Thirty-three English strings on the money page.
const REAL_SPECS = ["Air conditioning", "Automatic", "5 Seats", "4 Doors"];
const REAL_INCLUDED = [
  "Full tank of fuel",
  "Insurance",
  "Free delivery",
  "24/7 support",
];

describe("a fleet card speaks the reader's language", () => {
  it("translates the specs the owner actually typed", () => {
    expect(fleetTerms("fr", REAL_SPECS)).toEqual([
      "Climatisation",
      "Automatique",
      "5 places",
      "4 portes",
    ]);
    expect(fleetTerms("cr", REAL_SPECS)).toEqual([
      "Erkondisyone",
      "Otomatik",
      "5 plas",
      "4 laport",
    ]);
  });

  it("translates the included list", () => {
    expect(fleetTerms("fr", REAL_INCLUDED)).toEqual([
      "Plein de carburant",
      "Assurance",
      "Livraison gratuite",
      "Assistance 24/7",
    ]);
    for (const s of fleetTerms("cr", REAL_INCLUDED)) {
      expect(s).not.toMatch(/insurance|delivery|support|fuel/i);
    }
  });

  it("translates badges and the unit", () => {
    expect(fleetTerm("fr", "NEW")).toBe("NOUVEAU");
    expect(fleetTerm("cr", "POPULAR")).toBe("POPILER");
  });

  it("translates the unit beside the price", () => {
    // Every card on the site carries one. It was routed through fleetTerm()
    // but missing from the table, so "/ day" fell through unchanged and sat
    // next to a French price — the bug this file exists to remove.
    expect(fleetTerm("fr", "/ day")).toBe("/ jour");
    expect(fleetTerm("cr", "/ day")).toBe("/ zour");
    expect(fleetTerm("fr", "per night")).toBe("par nuit");
    expect(fleetTerm("cr", "per person")).toBe("par dimoun");
  });

  it("has no English left in the whole vocabulary's output", () => {
    // Sweep every real value the live fleet carries and assert none of it
    // comes back in English. This is the owner's actual complaint, as a test.
    const LIVE = [
      ...REAL_SPECS, ...REAL_INCLUDED,
      "7 Seats", "125cc Engine", "2 Riders", "Helmet Included", "2 helmets",
      "Lock & chain", "Local support 7/7", "2 Reflective Vests",
      "Fast pickup & drop-off", "Daily, weekly & long-term rentals",
      "Insurance & roadside assistance",
      "Easy booking by phone, WhatsApp or email",
      "Well-maintained, clean vehicles", "24/7 customer support",
      "NEW", "POPULAR", "PREMIUM", "/ day",
      "Scooters", "Motorbikes", "Cars", "E-Bikes", "Bicycles", "Kayaks",
    ];
    const ENGLISH =
      /(the|and|with|your|free|delivery|insurance|support|seats?|doors?|riders?|helmets?|engine|day|night|tank|fuel|lock|chain|clean|vehicles|booking|email|phone|new|popular|cars|bicycles|scooters|motorbikes)/i;
    for (const l of ["fr", "cr"] as const) {
      const leftovers = LIVE.map((s) => fleetTerm(l, s)).filter((s) =>
        ENGLISH.test(s),
      );
      expect({ lang: l, leftovers }).toEqual({ lang: l, leftovers: [] });
    }
  });

  it("keeps the owner's number in a counted spec", () => {
    // "7 Seats" on the Rush must not become "5 places" or lose the 7.
    expect(fleetTerm("fr", "7 Seats")).toBe("7 places");
    expect(fleetTerm("cr", "7 Seats")).toBe("7 plas");
    expect(fleetTerm("fr", "125cc Engine")).toBe("Moteur 125cc");
    expect(fleetTerm("cr", "2 Riders")).toBe("2 dimoun");
  });

  it("leaves English alone and never blanks an unknown term", () => {
    // A word the owner invents tomorrow still renders, in his own words.
    expect(fleetTerm("en", "Air conditioning")).toBe("Air conditioning");
    expect(fleetTerm("fr", "Surfboard rack")).toBe("Surfboard rack");
    expect(fleetTerm("fr", "")).toBe("");
    expect(fleetTerm("fr", null)).toBe("");
    expect(fleetTerms("fr", undefined)).toEqual([]);
  });

  it("is case- and whitespace-tolerant, because admin input is", () => {
    expect(fleetTerm("fr", "  air conditioning  ")).toBe("Climatisation");
    expect(fleetTerm("fr", "FREE DELIVERY")).toBe("Livraison gratuite");
  });

  it("returns 4x4 and SUV unchanged, which is the correct translation", () => {
    for (const l of ["fr", "cr"] as const) {
      expect(fleetTerm(l, "4x4")).toBe("4x4");
      expect(fleetTerm(l, "SUV")).toBe("SUV");
    }
    // "Compacte", not "Citadine" — the Swift's own live descriptionFr already
    // calls it a compacte, and "citadine" appears nowhere in the site's French.
    expect(fleetTerm("fr", "Hatchback")).toBe("Compacte");
  });
});

// ── MONEY ───────────────────────────────────────────────────────────────────
// This repo has shipped a money bug three times. A translation helper is not
// going to be the fourth.
describe("the price wrapper changes words, never figures", () => {
  const PRICES = [
    "From Rs 699(free delivery)",
    " Rs 1899(Free delivery)",
    "Rs 2,899(Free delivery)",
    "From Rs 1 200 / day",
    "Rs 11,900 per night",
  ];

  it("keeps every digit, in order, in all three languages", () => {
    for (const p of PRICES) {
      const digits = (s: string) => (s.match(/\d/g) ?? []).join("");
      for (const l of ["en", "fr", "cr"] as const) {
        expect(digits(fleetPrice(l, p))).toBe(digits(p));
      }
    }
  });

  it("translates only the two English words around the number", () => {
    expect(fleetPrice("fr", "From Rs 699(free delivery)")).toBe(
      "Dès Rs 699(livraison gratuite)",
    );
    expect(fleetPrice("cr", "From Rs 699(free delivery)")).toBe(
      "Apartir Rs 699(livrezon gratis)",
    );
  });

  it("leaves English and empty values untouched", () => {
    expect(fleetPrice("en", "From Rs 699(free delivery)")).toBe(
      "From Rs 699(free delivery)",
    );
    expect(fleetPrice("fr", "")).toBe("");
    expect(fleetPrice("fr", null)).toBe("");
  });

  it("does not maul a price with no English in it", () => {
    expect(fleetPrice("fr", "Rs 2,899")).toBe("Rs 2,899");
  });
});

describe("the card actually uses it", () => {
  const src = readFileSync(join(process.cwd(), "components", "Fleet.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("routes every previously-raw field through the vocabulary", () => {
    expect(src).toContain("fleetTerm(language, scooter.badge)");
    expect(src).toContain("fleetTerm(language, scooter.unit)");
    expect(src).toContain("fleetTerms(language, ownInc)");
    expect(src).toContain("fleetPrice(language, scooter.price)");
    expect(src).toContain("fleetTerm(language, c.label)");
    expect(src).toContain("fleetTerm(language, chip.label)");
  });

  it("picks the spec ICON from the English, not the translation", () => {
    // specIcon() matches on words like "seat" and "door". Translating first
    // would strip every icon off a French card.
    expect(src).toMatch(/icon: specIcon\(label\),\s*label: fleetTerm\(lang, label\)/);
  });
});
