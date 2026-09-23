import { describe, expect, it } from "vitest";
import { marketplaceOrderDoc } from "@/lib/receiptly/documents";
import { withSlot } from "./order-document";

// ── M216 · THE CONFIRMATION PRINTS THE DAY THE FOOD IS FOR ──────────────────
//
// The PDF is what a customer keeps, forwards and shows at the counter. Before
// M216 it carried everything about a Chez Banane booking except its day.

const RANGE = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';

const doc = () =>
  marketplaceOrderDoc({
    kind: "confirmation",
    orderNumber: "RR260925-AB",
    customerName: "Marie Payet",
    items: [{ name: "Poisson grillé", quantity: 1, lineTotalCents: 45000 }],
    totalCents: 45000,
    fulfillmentLabel: "Pickup from shop",
    storeName: "Chez Banane",
    issuedOn: "2026-09-23",
  });

describe("withSlot", () => {
  it("adds a Collection row with the short label that fits the field", () => {
    const d = withSlot(doc(), RANGE, "pickup")!;
    expect(d.details.at(-1)).toEqual({ label: "Collection", value: "Fri 25 Sep, 12:00–12:30" });
    // The field is a third of the page wide; the full weekday was clipped.
    expect(d.details.at(-1)!.value).not.toMatch(/Friday|September/);
  });

  it("labels the row by what happens at the slot for a delivery", () => {
    expect(withSlot(doc(), RANGE, "rr_delivery")!.details.at(-1)!.label).toBe("Handed to driver");
    expect(withSlot(doc(), RANGE, "customer_delivery")!.details.at(-1)!.label).toBe("Driver collects");
  });

  it("stays within the five detail rows the PDF prints", () => {
    expect(withSlot(doc(), RANGE, "pickup")!.details.length).toBeLessThanOrEqual(5);
  });

  it("leaves an order with no slot, or no document, exactly as it was", () => {
    const d = doc();
    expect(withSlot(d, null, "pickup")).toBe(d);
    expect(withSlot(d, "not a range", "pickup")).toBe(d);
    expect(withSlot(null, RANGE, "pickup")).toBeNull();
  });
});
