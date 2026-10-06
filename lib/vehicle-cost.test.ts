import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { costLabel, costTiers, modelCostTable, SCOOTER_COST_DAYS } from "./vehicle-cost";
import { priceBreakdown } from "./booking-pricing";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
/** Comments out, so an explanation that quotes the old code cannot satisfy or
 *  fail an assertion about the code itself. */
const code = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const CATS = [
  { id: "car", deliveryFee: 600, depositPct: 50 },
  { id: "scooter", deliveryFee: 0, depositPct: 25 },
];

// ── ONE TABLE, TWO PAGES (SEO audit 2026-09-29 C18) ────────────────────────
//
// The detail pages printed "1 day Rs 1,899 · 3 days Rs 5,697 · 1 week
// Rs 13,293" and /browse/car, the page that ranks for "car rental rodrigues",
// printed none of it. Both now read costTiers(), which reads priceBreakdown()
// — the function /api/bookings charges with.
describe("costTiers", () => {
  it("is exactly what the checkout charges for 1, 3 and 7 days", () => {
    const swift = { price: "Rs 1899(Book for more than 2 days to get free delivery!!)", category: "car" };
    const tiers = costTiers(swift, CATS);
    expect(tiers.map((t) => t.rental)).toEqual([1899, 5697, 13293]);
    for (const t of tiers) {
      expect(t.rental).toBe(priceBreakdown(swift, t.days, CATS)!.rental);
    }
  });

  it("is rental only: the delivery fee is not folded in", () => {
    const tiers = costTiers({ price: "Rs 2,899", category: "car" }, CATS);
    expect(tiers[0].rental).toBe(2899);
  });

  it("labels the rows the way the page reads them", () => {
    expect([1, 3, 7].map(costLabel)).toEqual(["1 day", "3 days", "1 week"]);
  });

  it("claims no discount on a car, because M159 removed them", () => {
    const tiers = costTiers({ price: "Rs 1,899", category: "car" }, CATS);
    expect(tiers.every((t) => t.off === 0 && t.perDay === 1899)).toBe(true);
  });

  it("prints a scooter's published list, row for row (6 Oct 2026)", () => {
    // 1 day Rs 1,699 · 2 days Rs 899 a day · 3 days or more Rs 799 a day —
    // the same function the checkout charges with, whatever the box says.
    const tiers = costTiers({ price: "Rs 699(free delivery)", category: "scooter" }, CATS, SCOOTER_COST_DAYS);
    expect(tiers.map((t) => [t.label, t.rental, t.perDay])).toEqual([
      ["1 day", 1699, 1699],
      ["2 days", 1798, 899],
      ["3 days", 2397, 799],
      ["1 week", 5593, 799],
    ]);
  });

  it("returns nothing for a vehicle with no usable price", () => {
    expect(costTiers({ price: "on request", category: "car" }, CATS)).toEqual([]);
    expect(costTiers(undefined, CATS)).toEqual([]);
  });
});

describe("modelCostTable", () => {
  it("prices a model once, from its cheapest twin unit", () => {
    // Two Swifts at Rs 1,499 and Rs 1,500 share one URL (slugs come from the
    // name). Two rows at two prices would be the contradiction the Product
    // grouping on the same page was written to end.
    const rows = modelCostTable(
      [
        { id: "s1", name: "Suzuki Swift", price: "Rs 1,500", category: "car" },
        { id: "h", name: "Toyota Hilux", price: "Rs 2,899", category: "car" },
        { id: "s2", name: "Suzuki Swift ", price: "Rs 1,499", category: "car" },
      ],
      CATS,
    );
    expect(rows.map((r) => r.href)).toEqual(["/browse/car/suzuki-swift", "/browse/car/toyota-hilux"]);
    expect(rows[0].name).toBe("Suzuki Swift");
    expect(rows[0].tiers[0].rental).toBe(1499);
  });

  it("leaves out a draft with no price", () => {
    const rows = modelCostTable([{ id: "d", name: "New Cars", price: "", category: "car" }], CATS);
    expect(rows).toEqual([]);
  });
});

describe("both pages use it", () => {
  const DETAIL = code(read("app", "browse", "[category]", "[vehicle]", "page.tsx"));
  const BROWSE = read("app", "browse", "[category]", "page.tsx");
  const BROWSE_CODE = code(BROWSE);

  it("the detail page no longer does the arithmetic itself", () => {
    expect(DETAIL).toContain("costTiers(item, content.vehicleCategories, scooterRates ? SCOOTER_COST_DAYS : undefined)");
    expect(DETAIL).not.toContain("priceBreakdown(");
  });

  it("/browse/car prints the table for every model, under a real heading", () => {
    expect(BROWSE_CODE).toContain("modelCostTable(items, content.vehicleCategories)");
    expect(BROWSE).toMatch(/<h2[^>]*>\s*\n?\s*What car hire costs on Rodrigues/);
    expect(BROWSE).toMatch(/<h2[^>]*>\s*\n?\s*Collecting your car at Plaine Corail airport/);
  });

  it("quotes the security deposit from the owner's FAQ, not from a literal", () => {
    // Rs 5,000 is the owner's figure for cars (lib/rental-conditions.ts) and is
    // NOT the booking part-payment. It is printed as he wrote it, or not at all.
    expect(BROWSE_CODE).toContain('conditionItems.find((c) => c.id === "deposit")?.answer');
    expect(BROWSE_CODE).not.toMatch(/5,000|5 000|5000/);
  });
});
