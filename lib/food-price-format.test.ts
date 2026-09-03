import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { centsToShortString } from "./money";

// ── "Rs 320.00" ON A MENU (M161) ────────────────────────────────────────────
//
// The owner's rule, given plainly on the activity screen and true everywhere a
// price is read rather than reconciled: "i should see no decimal point".
// Rodrigues prices are whole rupees.
//
// The /food listing was the last surface ignoring it — nine dishes reading
// "Rs 320.00", "Rs 80.00", "Rs 2500.00", four wasted characters each, on the
// densest card on the site. The shop already used the short form, so food was
// inconsistent with its own sibling.
//
// lib/money.ts draws the line and this test holds it: cards, pickers and the
// one-line delivery note lose the ".00"; a TOTAL keeps it, because money being
// paid is written in full.

const ROOT = __dirname.replace(/lib$/, "");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("a menu price is not written to the cent", () => {
  it("drops a trailing .00 but keeps real cents", () => {
    expect(centsToShortString(32000)).toBe("320");
    expect(centsToShortString(8000)).toBe("80");
    expect(centsToShortString(32050)).toBe("320.50");
  });

  const CARDS: [string, string[]][] = [
    ["the dish card", ["components", "food", "FoodCard.tsx"]],
    ["the dish page", ["app", "food", "[slug]", "page.tsx"]],
    ["the delivery note", ["components", "food", "FulfillmentBar.tsx"]],
  ];

  for (const [what, file] of CARDS) {
    it(`${what} uses the short form`, () => {
      const src = read(...file);
      expect(src).toContain("centsToShortString");
      expect(src).not.toContain("centsToDecimalString");
    });
  }
});

describe("a total still says the cents", () => {
  it("keeps the cart total in full", () => {
    // Not a nicety. This is the figure a customer checks against what leaves
    // their account, and it is the one place rounding would be a lie.
    expect(read("components", "food", "FoodCartBar.tsx")).toContain(
      "centsToDecimalString(total)",
    );
  });

  it("keeps the line total in full while shortening the variant picker", () => {
    const src = read("components", "food", "DishOrderPanel.tsx");
    expect(src).toContain("centsToDecimalString(lineTotal)");
    expect(src).toContain("centsToShortString(v.price)");
  });
});
