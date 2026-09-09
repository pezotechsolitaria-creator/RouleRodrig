import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALWAYS_AVAILABLE, isAlwaysAvailable } from "./service-stock";

// ── FOUR SERVICES SHIPPED SAYING "SOLD OUT" ─────────────────────────────────
//
// Party setup, a call-out hour, a full valet, a quick wash — struck through on
// the shelves the owner had just asked for, where services are the priority.
//
// The form asks "Stock quantity *" and a service has no answer. The field is
// required, so what most sellers will leave behind is the default 0 — and 0 is
// the exact value the shop floor reads as sold out. M192 corrected the four
// rows; these tests cover the thing that produced them.

describe("isAlwaysAvailable", () => {
  it("recognises what the form writes", () => {
    expect(isAlwaysAvailable(ALWAYS_AVAILABLE)).toBe(true);
  });

  it("does not treat a real count as unlimited", () => {
    // 12 jars of honey is a number the merchant means literally.
    expect(isAlwaysAvailable(12)).toBe(false);
    expect(isAlwaysAvailable(0)).toBe(false);
  });

  it("is a threshold, not an equality", () => {
    // Somebody who typed a bigger number by hand means the same thing, and
    // re-opening their listing must not offer to sell 10,000 haircuts.
    expect(isAlwaysAvailable(10_000)).toBe(true);
  });

  it("survives a variant that has no quantity at all", () => {
    expect(isAlwaysAvailable(null)).toBe(false);
    expect(isAlwaysAvailable(undefined)).toBe(false);
  });

  it("is high enough that no real shelf reaches it", () => {
    // If a shop could plausibly stock this many of something, the switch would
    // start mislabelling real inventory as a service.
    expect(ALWAYS_AVAILABLE).toBeGreaterThanOrEqual(9999);
  });
});

describe("the merchant form asks the question before the number", () => {
  const FORM = readFileSync(
    join(process.cwd(), "components/merchant/products/ProductForm.tsx"),
    "utf8",
  );
  // The comments quote the bug to explain it, so a naive scan matches its own
  // explanation. Same trap as lib/island-map-seam.test.ts.
  const code = FORM.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("offers the switch", () => {
    expect(code).toContain("This is a service, not an item");
  });

  it("fills the quantity in rather than leaving it at the default", () => {
    // Leaving the field untouched is precisely what produced the four struck
    // -through services: the default is 0 and 0 means sold out.
    expect(code).toMatch(/setValue\("stockQuantity", checked \? ALWAYS_AVAILABLE : 0/);
  });

  it("reads the stored value back, so an edit does not undo it", () => {
    // Without this, opening a saved service shows the switch off and 9999 in
    // the box, and saving turns it back into a countable product.
    expect(code).toMatch(/useState\(\s*isAlwaysAvailable\(variant\?\.stock_quantity\)/);
  });

  it("never shows the sentinel to the seller", () => {
    // A disabled input reading 9999 invites "why 9999?", and the answer is
    // that there is no number.
    expect(code).toContain("As many as you can take on.");
    expect(code).not.toMatch(/value=\{ALWAYS_AVAILABLE\}/);
  });
});
