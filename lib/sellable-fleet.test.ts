import { describe, expect, it } from "vitest";
import { isSellableFleetItem, priceNumber } from "./site-data";

// ── A CAR BOOKABLE AT Rs 0 ──────────────────────────────────────────────────
//
// /browse/car had been a soft 404. The hour it went live (2026-09-09) it showed
// four unfinished template listings among the two real cars:
//
//     NEW CARS · "ADD A SHORT TAGLINE." · "Add a description for this car."
//     From Rs 0 / day    [ Book Now ]
//
// on the page a "car rental Rodrigues" searcher lands on. The owner had added
// the rows and never finished them, and while the page 404'd nobody could see.
//
// The rule is the PRICE and nothing else. A row with no usable daily rate
// cannot be sold, so it is a draft whatever it is called. A row that carries a
// real rate is real stock even if its name and description are still
// placeholder text — those are the owner's words to fix, not ours to hide
// listings over.

describe("isSellableFleetItem", () => {
  it("keeps a real listing", () => {
    expect(isSellableFleetItem({ price: "Rs 1999(Free delivery)" })).toBe(true);
    expect(isSellableFleetItem({ price: "From Rs 699(free delivery)" })).toBe(true);
  });

  it("drops the Rs 0 placeholder that actually shipped", () => {
    // The exact string from site_content.
    expect(isSellableFleetItem({ price: "From Rs 0" })).toBe(false);
  });

  it("drops a row with no price at all", () => {
    expect(isSellableFleetItem({ price: "" })).toBe(false);
    expect(isSellableFleetItem({ price: "Ask us" })).toBe(false);
  });

  it("judges on price alone, not on placeholder wording", () => {
    // Two of the four drafts were priced Rs 2,499 and Rs 2,999 and still
    // called "New Cars". Those are real cars with bad copy, and hiding them
    // would be removing the owner's stock over a naming problem.
    expect(isSellableFleetItem({ price: "Rs 2499(Free delivery)" })).toBe(true);
  });

  it("agrees with priceNumber, which is what the 'from' line uses", () => {
    // If these two ever disagreed, a page could advertise "from Rs X" for a
    // vehicle it does not list, or list one it cannot price.
    for (const price of [
      "Rs 1999(Free delivery)",
      "From Rs 0",
      "From Rs 699(free delivery)",
      "",
    ]) {
      expect(isSellableFleetItem({ price })).toBe(priceNumber(price) != null);
    }
  });
});
