import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── A trade's storefront is not a shop's ────────────────────────────────────
//
// marketplace_stores excludes kitchens and box offices but NOT trades, so a car
// wash arrives on the storefront through the same page as a honey seller. Three
// things on that page were written for somebody selling objects, and all three
// were visibly wrong on a car wash before this — seen on the rendered page at
// 375px, not inferred.

describe("the page counts what the business actually sells", () => {
  const page = read("app/shop/[storeSlug]/page.tsx");

  it("says services, not '0 products', for a trade", () => {
    // A shop advertising that it sells nothing, directly above a working
    // booking panel.
    expect(page).toMatch(/services\.length === 1 \? "1 service"/);
    expect(page).toMatch(/services\.length > 0 \? \(/);
  });

  it("does not promise delivery from a business that delivers nothing", () => {
    // store_hours carries delivery windows for EVERY store because the columns
    // exist, not because every store uses them — so a car wash's page read
    // "Delivery available · 08:00 – 17:00" under its opening hours.
    expect(page).toMatch(/showsDelivery=\{services\.length === 0\}/);
    const card = read("components/shop/StoreHoursCard.tsx");
    expect(card).toMatch(/showsDelivery = true/);
    // Both delivery lines are gated, not just the visible one.
    expect((card.match(/\{showsDelivery && today/g) ?? []).length).toBe(2);
  });

  it("still shows the opening hours themselves", () => {
    // The hours are when they WORK. Hiding the whole card would have removed
    // the one thing a customer needs before walking over.
    const card = read("components/shop/StoreHoursCard.tsx");
    const statusLine = card.indexOf("ChevronDown");
    const firstGate = card.indexOf("{showsDelivery && today");
    expect(statusLine).toBeLessThan(firstGate);
  });
});
