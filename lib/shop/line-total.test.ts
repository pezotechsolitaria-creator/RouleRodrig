import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SHOP_COPY } from "./copy.i18n";

// ── The product page must price what the customer is actually taking ────────
//
// Reported from the live site: "1 microfibre is 250, if I want 3 it still puts
// 250 and it should be 750."
//
// It was exactly that. The big yellow number on a product page was
// `variant.price` — the price of ONE — and it never moved when the quantity
// stepper did. Somebody stepping up to three read "Rs 250.00" at the precise
// moment they decided to buy three.
//
// Nobody was ever charged wrongly: the cart multiplies, and quote_order() sums
// `price * qty` server-side before anything is paid. So this was not a money
// bug — it was worse in a quieter way. The customer is told one number where
// they decide, and a different one where they pay, and the platform looks like
// it changed its mind.
//
// This pins the arithmetic to the quantity, and pins the unit price staying
// visible beside it — because "Rs 750.00" alone is a number you have to trust,
// while "Rs 750.00 · Rs 250.00 each" is one you can check.

const SOURCE = readFileSync("components/shop/AddToCartForm.tsx", "utf8");

describe("the product page price follows the quantity", () => {
  it("multiplies the unit price by the chosen quantity", () => {
    // Guards the literal regression: `centsToDecimalString(variant.price)` as
    // the headline number, with no quantity in it.
    expect(
      SOURCE,
      "The big price on the product page is not multiplied by the quantity. " +
        "A customer choosing 3 would be shown the price of 1.",
    ).toMatch(/centsToDecimalString\(\s*variant\.price\s*\*\s*quantity\s*\)/);
  });

  it("still shows the unit price once more than one is chosen", () => {
    // Without this the headline is unverifiable — the reader has no way to see
    // WHY it says 750, and a wrong multiplier would look identical to a right
    // one.
    expect(SOURCE).toMatch(/quantity > 1 &&/);
    expect(SOURCE).toMatch(/copy\.buy\.each/);
  });

  it("says 'each' in all three languages", () => {
    // A bare "Rs 250.00" under a bigger number means nothing on its own.
    for (const lang of ["en", "fr", "cr"] as const) {
      const each = SHOP_COPY[lang].buy.each;
      expect(each.trim().length, `${lang} buy.each is empty`).toBeGreaterThan(1);
    }
    // And they must not all be the same string, which is what happens when a
    // key is added to one dictionary and copy-pasted into the others.
    const all = (["en", "fr", "cr"] as const).map((l) => SHOP_COPY[l].buy.each);
    expect(new Set(all).size, `buy.each is identical across languages: ${all.join(", ")}`)
      .toBeGreaterThan(1);
  });
});
