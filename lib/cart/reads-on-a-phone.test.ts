import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FOOD_COPY } from "@/lib/food/copy.i18n";
import { translations } from "@/lib/i18n";

const ROOT = process.cwd();

// ── WHAT A 375px PHONE ACTUALLY SHOWED ──────────────────────────────────────
//
// Measured in a browser at 375×812 with one dish in the cart, before any of
// this:
//
//   the food cart bar   96px tall, its label column 88px wide, because
//                       "Rs 1000.00" is 143 and the label was the only thing
//                       that could shrink. "View your order" broke over three
//                       lines. In French it is longer again.
//   the cart row        the product name had 102px and needed 177, so
//                       "Beach Experience Package" read "Beach Experi…".
//   the section heading "Votre commande de repas" needed 335px and had 194:
//                       "Votre comma…".
//   the dish card       "Octopus•Fish•Crab•Chicken" has no spaces, so
//                       line-clamp-2 had nothing to wrap and 155px of text
//                       ran out of a 126px card.
//
// After: 72px, and nothing on /cart or /food is clipped except the kitchen
// name on the bar's second line, which is what `truncate` is there for.
//
// These are source assertions because the suite has no DOM. They cannot prove
// the pixels; they hold the decisions that produced them.

/** The fix's own comments name every class it removed. Read code only. */
function code(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the food cart bar", () => {
  const src = code("components/food/FoodCartBar.tsx");

  it("speaks the copy that was written for it", () => {
    // FOOD_COPY.cartBar had both strings in three languages and NO consumer.
    expect(src).toContain('from "@/lib/food/copy.i18n"');
    expect(src).toContain("FOOD_COPY[language].cartBar");
    expect(src).toContain("cb.viewOrder");
    expect(src).toContain("cb.fromKitchen(kitchen)");
  });

  it("has no English left in it", () => {
    // The literal was `from {kitchen}` — the one control between a French
    // visitor and paying.
    expect(src).not.toContain(">from {kitchen}<");
    expect(src).not.toContain("t.common.viewYourOrder");
  });

  it("and that copy exists in every language", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      const bar = FOOD_COPY[lang].cartBar;
      expect(bar.viewOrder.length, lang).toBeGreaterThan(3);
      expect(bar.fromKitchen("Chez Banane"), lang).toContain("Chez Banane");
    }
  });

  it("leaves exactly one translation of the label", () => {
    // Two copies of one sentence in two files is how they drift; this is the
    // mistake FulfillmentBar had to be pulled back from.
    expect("viewYourOrder" in translations.en.common).toBe(false);
  });

  it("writes the total in full, per lib/money.ts", () => {
    // The short form is for cards and rails. This is the number the customer
    // checks against what they are about to be charged.
    expect(src).toContain("centsToDecimalString(total)");
    expect(src).not.toContain("centsToShortString");
  });
});

describe("the cart row", () => {
  const src = code("app/cart/page.tsx");

  it("gives the quantity controls their own line on a phone", () => {
    // Four 32px controls cannot share 343px with a product name.
    expect(src).toContain("grid-cols-[3.5rem_1fr]");
    expect(src).toContain("sm:grid-cols-[3.5rem_1fr_auto]");
    expect(src).toContain("col-span-2");
    expect(src).toContain("sm:col-span-1");
  });

  it("lets a long product name wrap instead of cutting it", () => {
    expect(src).toContain("line-clamp-2 font-dm text-sm font-medium text-offwhite");
  });

  it("does not truncate the heading that names the basket", () => {
    expect(src).toContain("flex flex-wrap items-baseline justify-between");
    expect(src).not.toContain('<span className="truncate">');
  });
});

describe("the dish card", () => {
  it("can break a descriptor that has no spaces in it", () => {
    expect(code("components/food/FoodCard.tsx")).toContain("line-clamp-2 break-words");
  });
});
