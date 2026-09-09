import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BROWSE = readFileSync(
  join(process.cwd(), "app/browse/[category]/page.tsx"),
  "utf8",
);
// Comments name the behaviour they removed, so the "does it still DO this"
// assertions read the code with comments stripped.
const CODE = BROWSE.replace(/^\s*\/\/.*$/gm, "");

// ── THE DAY /browse/car RETURNED 404 ────────────────────────────────────────
//
// 2026-09-09, 17:11:57 UTC. The owner switched the Cars category off in /admin
// while adding vehicles. /browse/car immediately began serving the "Lost on the
// island" screen with <meta name="robots" content="noindex">.
//
// Mechanism: the category lookup was `find(c => c.id === category && c.enabled)`.
// With enabled:false it returned undefined, the vehicle branch was skipped, no
// later branch matched "car", and the page fell through to notFound() at the
// bottom of the file. Nothing warned him, and nothing in the admin said that
// the switch takes a page offline.
//
// The cost: /browse/car is in the sitemap, carries reciprocal hreflang from
// /fr/location-voiture-rodrigues, and is one of the two pages this business
// sells from. A 404 is the instruction to Google to DELETE a URL. It is the
// wrong answer to "paused for an afternoon".
describe("a switched-off vehicle category", () => {
  it("does not 404", () => {
    // The lookup is split: vcatAny ignores `enabled`, vcat requires it.
    expect(CODE).toContain(
      "const vcatAny = content.vehicleCategories.find((c) => c.id === category);",
    );
    expect(CODE).toContain("const vcat = vcatAny?.enabled ? vcatAny : undefined;");
    expect(CODE).toContain("if (vcatAny && !vcat) {");
  });

  it("keeps the heading the URL ranks on", () => {
    // Throwing away the h1 during a pause throws away the ranking with it.
    expect(CODE).toMatch(/pausedCopy\?\.heading \?\? vcatAny\.label/);
  });

  it("says plainly that it is unavailable", () => {
    expect(BROWSE).toMatch(/are not available to book right now/);
  });

  it("offers somewhere to go instead", () => {
    // A dead end converts nobody. The other enabled category, and the
    // getting-around page, are both one tap away.
    expect(CODE).toMatch(/content\.vehicleCategories\.find\(\(c\) => c\.enabled && c\.id !== vcatAny\.id\)/);
    expect(CODE).toContain("/browse/getting-around");
  });

  it("still 404s a category that does not exist at all", () => {
    // /browse/hovercraft should 404. The guard only covers a category the owner
    // has defined and switched off.
    expect(CODE).toMatch(/notFound\(\);\s*\}\s*$/m);
  });
});

describe("an empty fleet in a live category", () => {
  it("does not 404 either", () => {
    // Same URL, same reasoning: "everything is out on hire today" is not
    // "this page never existed". This was the other notFound() on the branch.
    expect(CODE).not.toMatch(/if \(items\.length === 0\) notFound\(\);/);
    expect(BROWSE).toMatch(/out on hire right now/);
  });
});

// ── THE FEE THAT CONTRADICTED THE PRICE ─────────────────────────────────────
//
// Found the same day. Every car's price string read "(Free delivery)" while
// vehicleCategories.car.deliveryFee was 600, and app/api/bookings/route.ts
// charges that field — so a customer booked seeing "Free delivery" and was
// charged Rs 600. Set to 0 in the CMS on the owner's instruction.
//
// The intro copy reads the same field, so the sentence and the charge cannot
// diverge. This test pins that wiring; the VALUE lives in the CMS where the
// owner can change it.
describe("the delivery fee the copy quotes is the fee that is charged", () => {
  it("comes from the category, not a literal", () => {
    expect(CODE).toContain("vcopy.intro(vFrom, vcat.deliveryFee)");
  });

  it("says nothing about delivery when the fee is zero", () => {
    // `deliveryFee ? ...` — a 0 fee prints no clause at all, so "free
    // delivery" on the card is never contradicted by the paragraph above it.
    expect(CODE).toMatch(/deliveryFee \? `, plus Rs \$\{deliveryFee/);
  });
});
