import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRAND_ALTERNATE,
  PAYMENT_ACCEPTED,
  experienceLd,
  itemListLd,
  organizationLd,
  productLd,
  sellerLd,
} from "./schema";
import { METHOD_LABEL, PAYMENT_METHODS } from "./bookings/in-person";

// ── THE BUSINESS NODE, AND THE LISTS THAT POINT AT PAGES ────────────────────
// SEO audit 2026-09-29: T8 (paymentAccepted), T5 (the Hyundai with no brand),
// T13 (ItemLists deduped by address), C17 (the accented spelling as an alias).

describe("how a booking can be paid, as schema states it (T8)", () => {
  it("is exactly the methods a booking payment can be recorded as", () => {
    // Derived, so a method cannot be claimed here that the desk does not take.
    expect(PAYMENT_ACCEPTED.split(", ")).toEqual(PAYMENT_METHODS.map((m) => METHOD_LABEL[m]));
  });

  it("includes cash, which is the question people ask before booking", () => {
    expect(PAYMENT_ACCEPTED).toContain("Cash");
    expect(PAYMENT_ACCEPTED).toContain("PayPal");
    expect(PAYMENT_ACCEPTED).toContain("Bank transfer");
  });

  it("is on the seller stub every rental and experience page carries", () => {
    expect(sellerLd().paymentAccepted).toBe(PAYMENT_ACCEPTED);
  });
});

describe("one brand, one alias (C17)", () => {
  it("names the accented spelling as an alternateName, never as the name", () => {
    expect(BRAND_ALTERNATE).toBe("Roulé Rodrigues");
    for (const node of [sellerLd(), organizationLd()]) {
      expect(node.name).toBe("Roule Rodrigues");
      expect(node.alternateName).toBe(BRAND_ALTERNATE);
    }
  });
});

describe("the accented form appears only as that alias (C17)", () => {
  // The files this audit pass touched. Comments are stripped: they may quote
  // the old spelling to explain why it went.
  const FILES = [
    "lib/schema.ts",
    "lib/experiences.ts",
    "lib/experiences-faq.ts",
    "lib/home-description.ts",
    "app/page.tsx",
    "app/layout.tsx",
    "app/experiences/page.tsx",
    "app/experiences/[type]/page.tsx",
    "app/experiences/[type]/PlaceDetail.tsx",
    "app/fr/que-faire-a-rodrigues/page.tsx",
  ];
  for (const rel of FILES) {
    it(rel, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .split(/\r?\n/)
        .filter((l) => !l.includes("export const BRAND_ALTERNATE"));
      expect(src.filter((l) => l.includes("Roulé Rodrigues"))).toEqual([]);
    });
  }
});

describe("brandOf knows the Hyundai (T5)", () => {
  it("gives the Venue its manufacturer", () => {
    const ld = productLd({ name: "Hyundai Venue", category: "car", url: "u", price: 1999 });
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Hyundai" });
  });

  it("still gives an unknown model no brand rather than a guess", () => {
    expect(productLd({ name: "Mystery 50cc", category: "scooter", url: "u" }).brand).toBeUndefined();
  });
});

describe("itemListLd drops a repeated address (T13)", () => {
  it("keeps one entry per url and counts what it keeps", () => {
    const ld = itemListLd("Scooters", [
      { name: "AVENIS 125cc", url: "https://x/browse/scooter/avenis-125cc" },
      { name: "AVENIS 125cc", url: "https://x/browse/scooter/avenis-125cc" },
      { name: "BURGMAN 125cc", url: "https://x/browse/scooter/burgman-125cc" },
    ]);
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement.map((i) => i.name)).toEqual(["AVENIS 125cc", "BURGMAN 125cc"]);
  });

  it("keeps every entry that has no url, since a name alone proves no repeat", () => {
    const ld = itemListLd("x", [{ name: "a" }, { name: "a" }]);
    expect(ld.numberOfItems).toBe(2);
  });
});

describe("experienceLd agrees between the detail and the category page (C6)", () => {
  it("names the operator and the duration when given them", () => {
    const ld = experienceLd({
      name: "Rituel Signature Harmony Spa (1 h 30)",
      price: 1999,
      url: "u",
      providerName: "Therapist Maryanne",
      durationMinutes: 90,
    });
    expect(ld.provider).toEqual({ "@type": "Person", name: "Therapist Maryanne" });
    expect(ld.timeRequired).toBe("PT90M");
  });
});
