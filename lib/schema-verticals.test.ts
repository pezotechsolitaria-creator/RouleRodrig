import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rentalCategoryLd, experienceLd } from "./schema";

// ── THE VERTICALS THAT SELL NOTHING HAD NOTHING TO SELL WITH (M134) ─────────
//
// The owner: scooters bring roughly ten customers; cars and experiences bring
// none. The obvious causes were all ruled out first — the pages exist, they are
// in the live sitemap, they carry real prose, they are not duplicates.
//
// What they did NOT carry was a price a machine could read.
// /fr/location-voiture-rodrigues emitted an FAQ and a breadcrumb. The
// experiences pages emitted a list of names. Both RENDER prices to a human, and
// said nothing about them in structured data — so Google had no price for a
// rich result, and an assistant asked "how much is a car on Rodrigues" had
// prose to guess from instead of a fact to quote.

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("rentalCategoryLd — a category priced 'from'", () => {
  const ld = rentalCategoryLd({
    name: "Location de voiture à Rodrigues",
    category: "car",
    fromPrice: 1500,
    offerCount: 2,
    url: "https://roulerodrig.com/fr/location-voiture-rodrigues",
  });

  it("types a car as a Car, not a generic Product", () => {
    expect(ld["@type"]).toBe("Car");
    expect(rentalCategoryLd({ name: "x", category: "scooter", fromPrice: 699, url: "u" })["@type"]).toBe("Motorcycle");
  });

  it("uses lowPrice, because the page says FROM", () => {
    // A flat Offer.price would assert THE price. The page says "dès Rs 1 500".
    // Claiming a precision the business does not offer is how a customer meets
    // a different number on arrival — the Rs 599/699 bug, one page over.
    const offers = ld.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe(1500);
    expect(offers.price).toBeUndefined();
  });

  it("prices in rupees and says where it is available", () => {
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.priceCurrency).toBe("MUR");
    expect(JSON.stringify(offers.areaServed)).toMatch(/Rodrigues/);
  });

  it("never invents a rating", () => {
    // Fake stars are the fastest way to lose rich results — and losing them
    // would take the scooter traffic that currently earns money.
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|ratingValue|reviewCount/);
  });
});

describe("experienceLd — a bookable thing, not a name in a list", () => {
  const ld = experienceLd({
    name: "Pêche Traditionelle",
    price: 700,
    url: "https://roulerodrig.com/experiences/fishing",
    providerName: "Capitaine Arnaud",
    durationMinutes: 90,
  });

  it("is a Service — nobody takes a fishing trip home", () => {
    expect(ld["@type"]).toBe("Service");
  });

  it("names the captain, because on this island the name is the credential", () => {
    expect(JSON.stringify(ld.provider)).toMatch(/Capitaine Arnaud/);
  });

  it("states the price in rupees", () => {
    const offers = ld.offers as Record<string, unknown>;
    expect(offers.price).toBe(700);
    expect(offers.priceCurrency).toBe("MUR");
  });

  it("expresses duration the way a machine reads it back", () => {
    expect(ld.timeRequired).toBe("PT90M");
  });

  it("emits NO offer for an unpriced listing, rather than a zero", () => {
    // Free and "we have not set a price" are different claims, and a zero
    // published to Google is the first one.
    const unpriced = experienceLd({ name: "x", price: null, url: "u" });
    expect(unpriced.offers).toBeUndefined();
    expect(JSON.stringify(unpriced)).not.toMatch(/"price":\s*0/);
  });

  it("falls back to the business when no individual is named", () => {
    const anon = experienceLd({ name: "x", url: "u" });
    expect(JSON.stringify(anon.provider)).toMatch(/#business/);
  });
});

describe("the pages actually emit it", () => {
  it("the French car page carries a priced offer", () => {
    const src = stripComments(read("app/fr/location-voiture-rodrigues/page.tsx"));
    expect(src).toMatch(/rentalCategoryLd\(/);
    // The price must be the one the page renders, not a literal typed twice.
    expect(src).toMatch(/fromPrice: from/);
  });

  it("the car count is read from the fleet, not asserted", () => {
    // offerCount is a claim about inventory. Inventing one tells a customer
    // "available" about a car that is not there.
    const src = stripComments(read("app/fr/location-voiture-rodrigues/page.tsx"));
    expect(src).toMatch(/fleet\.filter\(/);
    expect(src).not.toMatch(/offerCount: \d/);
  });

  it("every experience page prices each experience", () => {
    const src = stripComments(read("app/experiences/[type]/page.tsx"));
    expect(src).toMatch(/experienceLd\(/);
    expect(src).toMatch(/places\.map\(/);
  });

  it("leaves the scooter page's working formula alone", () => {
    // It produces roughly ten customers. Learn from it; do not improve it.
    const src = read("app/fr/location-scooter-rodrigues/page.tsx");
    expect(src).toMatch(/FAQPage/);
    expect(src).toMatch(/breadcrumbLd/);
  });
});
