import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { productLd } from "@/lib/schema";
import { SCOOTER_RATES, scooterTotal } from "@/lib/booking-pricing";

// ── THE SCOOTER LIST, WHEREVER A PRICE IS STATED (6 Oct 2026) ───────────────
//
// 1 day Rs 1,699 · 2 days Rs 899 a day · 3 days or more Rs 799 a day. The card
// says "Rs 799 / day · 3 days or more"; these hold the two places that could
// still state the figure without its condition: the Offer a crawler reads, and
// the sheet before and after a range is chosen.

type Spec = { price: number; unitCode: string; eligibleQuantity?: { value?: number; minValue?: number } };

describe("a scooter's Offer states the three rates, each with its days", () => {
  const base = { name: "Avenis 125", url: "https://roulerodrig.com/browse/scooter/avenis-125cc" };

  it("lists 1 day, 2 days and 3-or-more as separate per-day prices", () => {
    const offer = productLd({ ...base, category: "scooter", price: 799, scooterRates: SCOOTER_RATES }).offers as {
      price: number;
      priceSpecification: Spec[];
    };
    expect(offer.price).toBe(799);
    expect(offer.priceSpecification.map((s) => [s.price, s.unitCode, s.eligibleQuantity])).toEqual([
      [1699, "DAY", { "@type": "QuantitativeValue", unitCode: "DAY", value: 1 }],
      [899, "DAY", { "@type": "QuantitativeValue", unitCode: "DAY", value: 2 }],
      [799, "DAY", { "@type": "QuantitativeValue", unitCode: "DAY", minValue: 3 }],
    ]);
  });

  it("keeps a car, and anything not on the list, to one per-day price", () => {
    for (const p of [
      { ...base, category: "car", price: 1899, scooterRates: SCOOTER_RATES },
      { ...base, category: "scooter", price: 1200, scooterRates: SCOOTER_RATES },
      { ...base, category: "scooter", price: 799, rentalKind: "equipment" as const, scooterRates: SCOOTER_RATES },
      // No list handed over: one plain price, never a guessed one.
      { ...base, category: "scooter", price: 799 },
    ]) {
      const spec = (productLd(p).offers as { priceSpecification: Spec }).priceSpecification;
      expect(Array.isArray(spec), JSON.stringify(p)).toBe(false);
      expect(spec.price).toBe(p.price);
    }
  });
});

describe("the sheet tells a short scooter rental what one more day costs", () => {
  const SRC = readFileSync(join(process.cwd(), "components", "BookingSection.tsx"), "utf8");

  it("offers it only on 1 or 2 scooter days, and only when that day is free", () => {
    expect(SRC).toContain("if (!breakdown || !scooterPriced || days < 1 || days > 2 || !effectiveEnd) return null;");
    expect(SRC).toContain("if (isFull(end)) return null;");
  });

  it("is the arithmetic the checkout charges: Rs 99, then Rs 599", () => {
    expect(scooterTotal(2, SCOOTER_RATES)! - scooterTotal(1, SCOOTER_RATES)!).toBe(99);
    expect(scooterTotal(3, SCOOTER_RATES)! - scooterTotal(2, SCOOTER_RATES)!).toBe(599);
  });

  it("shows the list where the line items go, before a range exists", () => {
    expect(SRC).toContain("{!breakdown && scooterPriced && (");
    expect(SRC).toContain("line(r.days(1), convert(rs(rates.oneDay)))");
    // ...the owner's list, the same one the server charges with.
    expect(SRC).toContain("const rates = scooterRates(categories);");
    expect(SRC).toContain("scooterTotal(days + 1, rates)");
  });
});
