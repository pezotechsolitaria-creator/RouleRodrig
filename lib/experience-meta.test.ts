import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { experienceMetaDescription } from "./experience-meta";
import { vehicleMetaDescription } from "./vehicle-meta";
import { EXPERIENCES } from "./experiences";
import { SERVICE_TYPES } from "./defaults";

const len = (s: string) => Array.from(s).length;

// The live rows as they stood on 29 Sep 2026, copied field for field from
// site_content. The operator text is deliberately messy — that is the point.
const COCOS = {
  name: "Île aux Cocos Excursion with Les Inséparables",
  isTour: true,
  priceNote: "Rs 1999/Person ",
  capacity: 36,
  bookable: true,
};
const BALADE = {
  name: "Balade en mer",
  serviceType: "boat" as const,
  isTour: true,
  priceNote: "Rs 700 per person",
  depositAmount: 700,
  providerName: "Skipper Arnaud",
  maxGuests: 8,
  capacity: 8,
  bookable: true,
};
const PLONGEE = {
  name: "Plongée en apnée/Aquarium Rivière Banane",
  serviceType: "boat" as const,
  isTour: true,
  priceNote: "Rs 1000 per person",
  depositAmount: 1000,
  providerName: "Captain Arnaud",
  maxGuests: 10,
  capacity: 10,
  bookable: true,
};
const PECHE = {
  name: "Pêche Traditionelle",
  serviceType: "fishing" as const,
  isTour: true,
  priceNote: "Rs 700 per person",
  depositAmount: 700,
  providerName: "Capitaine Arnaud",
  maxGuests: 8,
  capacity: 8,
  bookable: true,
};
const RITUEL = {
  name: "Rituel Signature Harmony Spa (1 h 30)",
  serviceType: "massage" as const,
  priceNote: "Rs 1999 per person",
  providerName: "Therapist Maryanne",
  durationMinutes: 90,
  capacity: 4,
  bookable: true,
};
const SUNRISE = {
  name: "Sunrise hike from Anse aux Anglais",
  serviceType: "hiking" as const,
  priceNote: "Rs 2,500 per person(Free transfer to starting point)",
  providerName: "Filine",
  durationMinutes: 240,
  maxGuests: 8,
  capacity: 1,
  bookable: true,
};

describe("an experience page's own meta description", () => {
  const all = { COCOS, BALADE, PLONGEE, PECHE, RITUEL, SUNRISE };

  it.each(Object.entries(all))("%s fits a search result and is a clean sentence", (_, p) => {
    const d = experienceMetaDescription(p);
    expect(len(d)).toBeLessThanOrEqual(155);
    expect(len(d)).toBeGreaterThanOrEqual(110);
    // No emoji, bullets or line breaks from the operator's own text.
    expect(d).not.toMatch(/[\n*•📍🏝]/u);
    expect(d).toMatch(/\.$/);
  });

  it("says snorkelling in English for the French-named snorkelling trip", () => {
    expect(experienceMetaDescription(PLONGEE)).toContain("a snorkelling trip in Rodrigues");
  });

  it("carries the real price with the site's number format", () => {
    expect(experienceMetaDescription(SUNRISE)).toContain("Rs 2,500 per person for 4h");
    expect(experienceMetaDescription(COCOS)).toContain("Rs 1,999 per person");
  });

  it("does not repeat the kind when the name already says it", () => {
    expect(experienceMetaDescription(SUNRISE)).not.toContain("a guided hike");
    expect(experienceMetaDescription(SUNRISE)).toMatch(/^Sunrise hike from Anse aux Anglais in Rodrigues with Filine\./);
  });

  it("drops the duration in brackets from the name and says it once", () => {
    const d = experienceMetaDescription(RITUEL);
    expect(d).not.toContain("(1 h 30)");
    expect(d).toContain("for 1h 30");
  });

  it("never reads a therapist's daily capacity as a group size", () => {
    expect(experienceMetaDescription(RITUEL)).not.toContain("up to");
  });

  it("reads a tour's capacity as its group size", () => {
    expect(experienceMetaDescription(COCOS)).toContain("up to 36 people");
  });

  it("leaves the price out rather than inventing one", () => {
    const d = experienceMetaDescription({ ...BALADE, priceNote: undefined, depositAmount: undefined });
    expect(d).not.toMatch(/Rs/);
    expect(d).toContain("Balade en mer, a boat trip in Rodrigues with Skipper Arnaud.");
  });

  it("keeps the price when a very long name has to be cut", () => {
    const d = experienceMetaDescription({
      ...BALADE,
      name: "A very long operator name ".repeat(8).trim(),
    });
    expect(len(d)).toBeLessThanOrEqual(155);
    expect(d).toContain("Rs 700 per person");
  });

  it("is what the page route uses", () => {
    const page = readFileSync("app/experiences/[type]/page.tsx", "utf8");
    expect(page).toMatch(/import \{ experienceMetaDescription \} from "@\/lib\/experience-meta"/);
    expect(page).not.toMatch(/place\.description \|\| ""\)\.trim\(\)\.slice\(0, 155\)/);
  });
});

describe("the five service listings' descriptions", () => {
  it.each(SERVICE_TYPES)("%s fits with and without a price", (type) => {
    const base = EXPERIENCES[type].description;
    expect(len(base)).toBeGreaterThanOrEqual(120);
    // The template appends " From Rs {price} per person." — five digits must still fit.
    expect(len(`${base} From Rs 12,500 per person.`)).toBeLessThanOrEqual(155);
  });
});

describe("a vehicle page's meta description", () => {
  const HILUX = {
    name: "Toyota Hilux",
    from: 2899,
    specs: ["Air conditioning", "Automatic", "5 Seats", "4 Doors"],
    included: ["Full tank of fuel", "Insurance", "Free delivery", "24/7 support"],
  };
  const SWIFT = {
    name: "Suzuki Swift (Latest Gen) ",
    from: 1899,
    specs: ["Air conditioning", "Automatic", "5 Seats", "4 Doors"],
    included: [
      "Fast pickup & drop-off",
      "Daily, weekly & long-term rentals",
      "Insurance & roadside assistance",
      "Easy booking by phone, WhatsApp or email",
      "Well-maintained, clean vehicles",
      "24/7 customer support",
    ],
  };
  const BURGMAN = {
    name: "Suzuki Burgman 125cc",
    from: 699,
    specs: ["125cc Engine", "Automatic", "2 Riders", "Helmet Included"],
    included: ["2 helmets", "Full tank", "Local support 7/7"],
  };

  it.each([HILUX, SWIFT, BURGMAN])("$name fits and names the rental and the price", (v) => {
    const d = vehicleMetaDescription(v);
    expect(len(d)).toBeLessThanOrEqual(155);
    expect(len(d)).toBeGreaterThanOrEqual(120);
    expect(d).toMatch(/ rental in Rodrigues, Rs [\d,]+\/day/);
  });

  it("reads like a sentence", () => {
    expect(vehicleMetaDescription(HILUX)).toBe(
      "Toyota Hilux rental in Rodrigues, Rs 2,899/day: air conditioning, automatic, 5 seats. Full tank of fuel, insurance and free delivery included.",
    );
  });

  it("skips selling lines that are not things in the box", () => {
    const d = vehicleMetaDescription(SWIFT);
    expect(d).not.toContain("Daily, weekly");
    expect(d).not.toContain("Well-maintained");
  });

  it("sentence-cases chips without flattening brand capitals", () => {
    const d = vehicleMetaDescription({
      name: "AVENIS 125cc",
      from: 699,
      specs: ["125cc Engine", "Automatic", "2 Riders"],
      included: ["2 helmets", "2 Reflective Vests", "WhatsApp support"],
    });
    expect(d).toContain("125cc engine, automatic, 2 riders.");
    expect(d).toContain("2 reflective vests");
    expect(d).toContain("WhatsApp support");
  });

  it("does not say the helmet twice", () => {
    expect(vehicleMetaDescription(BURGMAN)).not.toMatch(/helmet included/i);
    expect(vehicleMetaDescription(BURGMAN)).toContain("2 helmets");
  });

  it("gives way to the owner's copy when there is no price", () => {
    expect(vehicleMetaDescription({ ...HILUX, from: null })).toBe("");
    const page = readFileSync("app/browse/[category]/[vehicle]/page.tsx", "utf8");
    expect(page).toMatch(/^import \{ vehicleMetaDescription \} from "@\/lib\/vehicle-meta";/m);
    // Tried first; the owner's cleaned copy is what it falls back to.
    expect(page.indexOf("vehicleMetaDescription({")).toBeGreaterThan(-1);
    expect(page.indexOf("vehicleMetaDescription({")).toBeLessThan(
      page.indexOf("metaDescription(realCopy("),
    );
  });
});
