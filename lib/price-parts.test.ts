import { describe, expect, it } from "vitest";
import { priceParts } from "./price-parts";

// ── "Rs 1999(Fr…" ───────────────────────────────────────────────────────────
//
// What the sticky action bar rendered at 393px before this existed. The price
// field in site_content is a single free-text box, and the owner types three
// separate facts into it with no space before the bracket:
//
//     " Rs 1999(Free delivery)"        a real row, leading space included
//     "From Rs 699(free delivery)"
//
// Printed raw the string truncates, and the half that gets cut is FREE
// DELIVERY — the single strongest trust signal this business has, and the one
// the owner asked to make more prominent.
//
// Nothing here rewrites the owner's content. The raw string is still what the
// cards show; this only splits it for the places that need the parts.

describe("priceParts", () => {
  it("splits the real car row", () => {
    const p = priceParts(" Rs 1999(Free delivery)");
    expect(p.amount).toBe(1999);
    expect(p.freeDelivery).toBe(true);
    expect(p.isFrom).toBe(false);
    expect(p.display).toBe("Rs 1,999");
  });

  it("splits the real scooter row and keeps the From", () => {
    // "From" is a promise about the CHEAPEST option, not decoration. Dropping
    // it would advertise Rs 699 as the price of every scooter.
    const p = priceParts("From Rs 699(free delivery)");
    expect(p.amount).toBe(699);
    expect(p.isFrom).toBe(true);
    expect(p.display).toBe("From Rs 699");
    expect(p.freeDelivery).toBe(true);
  });

  it("groups thousands, because Rs 2999 is harder to read at a glance", () => {
    expect(priceParts("Rs 2999(Free delivery)").display).toBe("Rs 2,999");
  });

  it("does not invent free delivery", () => {
    expect(priceParts("Rs 2500").freeDelivery).toBe(false);
  });

  it("will not read a Freelander as free delivery", () => {
    // The word boundary earns its keep the day somebody lists one.
    expect(priceParts("Rs 3500 Freelander").freeDelivery).toBe(false);
  });

  it("falls back to the owner's own words when there is no number", () => {
    // Better an odd string than an empty price or an invented one.
    expect(priceParts("Ask us").display).toBe("Ask us");
    expect(priceParts("Ask us").amount).toBeNull();
  });

  it("treats the Rs 0 placeholder as having no price", () => {
    // The same rule isSellableFleetItem uses, so a draft cannot show a price
    // in one place and be filtered out in another.
    expect(priceParts("From Rs 0").amount).toBeNull();
  });
});
