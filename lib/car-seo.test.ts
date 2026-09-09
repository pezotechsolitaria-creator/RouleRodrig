import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rentalCategoryLd } from "./schema";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const BROWSE = read("app", "browse", "[category]", "page.tsx");
// Comments stripped for the "does it still SAY this" assertions: the comment
// above the rewritten intro explains the removal by naming the phrase it
// removed, and a bare substring check fails on its own explanation.
const BROWSE_CODE = BROWSE.replace(/^\s*\/\/.*$/gm, "");
const TRUST = read("components", "TrustBar.tsx");
const FLEET = read("components", "Fleet.tsx");
const SITEMAP = read("app", "sitemap.ts");

// ── "WHY DO I ONLY GET SCOOTER BOOKINGS?" ───────────────────────────────────
//
// Asked 2026-09-08. Measured on the live site the same day, against the whole
// sitemap: "Premium scooter rentals" appeared on 75 of 77 pages, "car rental"
// on 5, "rent a car" on 1. Editorial links (guide/blog/about) ran 18 to the
// scooter page and 3 to the car page.
//
// These tests hold the structural half of the answer. The commercial half —
// a car costs Rs 1,499 + Rs 600 delivery against a scooter's Rs 699 with none,
// printed side by side on the fleet cards — is the owner's to decide and is
// deliberately not encoded here.
describe("the car page has a heading worth ranking", () => {
  it("uses the keyword heading as the h1, not the nav label", () => {
    // The h1 was "Cars" — the one-word chrome label — while "Car Rental in
    // Rodrigues" sat underneath as an h2. The strongest heading on a commercial
    // page was a nav crumb.
    expect(BROWSE).toContain('titleAs="h1"');
    expect(BROWSE).toContain('{header(vcat.label, "span")}');
  });

  it("lets Fleet render that heading as the page heading", () => {
    expect(FLEET).toMatch(/titleAs\s*=\s*"h2"/);
    expect(FLEET).toMatch(/titleAs\?:\s*"h1"\s*\|\s*"h2"/);
    expect(FLEET).toContain("const Heading = titleAs;");
  });

  it("leaves the other two callers of header() as h1", () => {
    // Neither /browse/[place] nor getting-around has a competing heading.
    expect(BROWSE).toContain('const header = (title: string, titleAs: "h1" | "span" = "h1")');
  });
});

describe("the page does not promise things that are not true", () => {
  it("no longer offers a multi-day discount", () => {
    // The automatic 10%/15% tiers came out in M159, so the rate table renders
    // exactly 1x / 3x / 7x. Both intros were still advertising the discount.
    expect(BROWSE_CODE).not.toMatch(/discounts from 3 days/);
  });

  it("states the car delivery fee instead of implying delivery is free", () => {
    // Cars carry Rs 600 (content.vehicleCategories); scooters carry 0. The
    // fleet card already prints "+ Rs 600 delivery".
    expect(BROWSE).toMatch(/deliveryFee \? `, plus Rs \$\{deliveryFee/);
    expect(BROWSE).toMatch(/intro: \(from, deliveryFee\)/);
  });

  it("takes the fee from the CMS rather than hardcoding it", () => {
    // The owner can change it in /admin; a literal 600 here would drift.
    expect(BROWSE).toContain("vcopy.intro(vFrom, vcat.deliveryFee)");
  });

  it("does not tell a car customer a helmet is included", () => {
    // TrustBar renders on /browse/[category], which is the car page too. It
    // hardcoded "Helmet included" and "Free scooter delivery" with no category
    // awareness — both false beside a Rs 600 car delivery fee.
    expect(TRUST).toContain("category === \"car\" ? CAR : SCOOTER");
    expect(BROWSE).toContain("<TrustBar category={vcat.id} />");
  });
});

describe("the car page answers a car renter's questions", () => {
  // Measured on the live EN car pages: ZERO occurrences of airport, Plaine
  // Corail, or which side of the road. The French page answers all of them and
  // is the best car page on the site.
  it("names the airport", () => {
    expect(BROWSE).toMatch(/Plaine Corail/);
  });

  it("says which side of the road you drive on", () => {
    expect(BROWSE).toMatch(/drive on the left/i);
  });

  it("says the car is automatic and air-conditioned", () => {
    expect(BROWSE).toMatch(/Automatic, air-conditioned/);
  });
});

describe("the only structured car price on the site is readable", () => {
  it("carries a vocabulary", () => {
    // rentalCategoryLd was the sole context-less node in the French car page's
    // top-level JSON-LD array — the one machine-readable car price we publish,
    // invisible to the crawler it exists for. Ten siblings in lib/schema.ts
    // declare @context; this one did not.
    const ld = rentalCategoryLd({
      category: "car",
      name: "Suzuki Swift",
      fromPrice: 1499,
      url: "https://roulerodrig.com/browse/car",
    }) as Record<string, unknown>;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Car");
  });

  it("still types a scooter as a Motorcycle", () => {
    const ld = rentalCategoryLd({
      category: "scooter",
      name: "Avenis 125",
      fromPrice: 699,
      url: "https://roulerodrig.com/browse/scooter",
    }) as Record<string, unknown>;
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Motorcycle");
  });
});

describe("the sitemap", () => {
  it("lists /browse/getting-around", () => {
    // Verified absent: 0 of 76 <loc> entries. It is the only page on the site
    // whose visible text says "rent a car".
    expect(SITEMAP).toContain("/browse/getting-around");
  });
});
