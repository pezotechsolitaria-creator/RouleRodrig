import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TrustBar from "@/components/TrustBar";
import { productLd } from "@/lib/schema";

// ── THE TRUST BAR AND THE SCHEMA, PER KIND (architecture review 2026-09-30) ─
//
// Every rental surface assumed a motor vehicle. TrustBar fell through to the
// scooter pair for any category that was not "car", and the schema node was
// chosen by category id alone — so a kayak category would have opened with
// "Helmet included" and "Free scooter delivery". These render the real
// component and call the real builder; the page-level proof (a whole kayak
// page) is app/browse/vehicle-page-category.test.ts.

type BarProps = { category?: string; kind?: "motor" | "equipment" };
const bar = (p: BarProps) => renderToStaticMarkup(createElement<BarProps>(TrustBar, p));
const text = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

describe("TrustBar", () => {
  it("makes no helmet, scooter or driving promise on an equipment page", () => {
    const t = text(bar({ category: "kayak", kind: "equipment" }));
    expect(t).not.toMatch(/helmet|scooter|licen[cs]e|air conditioning|ready to drive|airport/i);
  });

  it("keeps the two promises that hold for any rental", () => {
    const t = text(bar({ category: "kayak", kind: "equipment" }));
    expect(t).toContain("WhatsApp support");
    expect(t).toContain("Easy booking");
  });

  it("does not leave two items stranded in a four-column row", () => {
    const html = bar({ category: "kayak", kind: "equipment" });
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("lg:grid-cols-4");
  });

  it("renders byte-for-byte what it did before for a motor category", () => {
    for (const category of ["scooter", "car", "motorbike", undefined]) {
      expect(bar({ category, kind: "motor" })).toBe(bar({ category }));
    }
  });

  it("still says what it always said on the two live categories", () => {
    const scooter = bar({ category: "scooter" });
    expect(text(scooter)).toContain("Helmet included");
    expect(text(scooter)).toContain("Free scooter delivery");
    expect(scooter).toContain("grid grid-cols-2 lg:grid-cols-4 gap-x-6");
    const car = text(bar({ category: "car" }));
    expect(car).toContain("Air conditioning");
    expect(car).not.toMatch(/helmet/i);
  });
});

describe("productLd", () => {
  const base = { name: "Sit-on-top Kayak", price: 800, url: "https://roulerodrig.com/browse/kayak/x" };

  it("types equipment as a plain Product, whatever the category id", () => {
    for (const category of ["kayak", "car", "scooter"]) {
      expect(productLd({ ...base, category, rentalKind: "equipment" })["@type"]).toBe("Product");
    }
  });

  it("keeps the same rental Offer: LeaseOut, per DAY, in MUR", () => {
    const eq = productLd({ ...base, category: "kayak", rentalKind: "equipment" });
    const motor = productLd({ ...base, category: "car" });
    expect(eq.offers).toEqual(motor.offers);
    expect(eq.offers).toMatchObject({
      "@type": "Offer",
      price: 800,
      priceCurrency: "MUR",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: 800,
        priceCurrency: "MUR",
        unitCode: "DAY",
      },
      availability: "https://schema.org/InStock",
    });
  });

  it("says OutOfStock for equipment too when it cannot be booked", () => {
    const eq = productLd({ ...base, category: "kayak", rentalKind: "equipment", available: false });
    expect(eq.offers?.availability).toBe("https://schema.org/OutOfStock");
  });

  it("changes nothing for motor, or for no kind", () => {
    for (const category of ["car", "scooter", "motorbike"]) {
      expect(productLd({ ...base, category, rentalKind: "motor" })).toEqual(
        productLd({ ...base, category }),
      );
    }
    expect(productLd({ ...base, category: "car" })["@type"]).toBe("Car");
    expect(productLd({ ...base, category: "scooter" })["@type"]).toBe("Motorcycle");
  });
});
