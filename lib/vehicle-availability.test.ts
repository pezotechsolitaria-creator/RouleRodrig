import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { productLd } from "./schema";

const PAGE = readFileSync(
  join(process.cwd(), "app", "browse", "[category]", "[vehicle]", "page.tsx"),
  "utf8",
);

// ── WITHDRAWN AND BUSY-TODAY ARE OPPOSITE SITUATIONS ────────────────────────
//
// They were one `out` flag. A vehicle the owner had switched off therefore
// said "Fully booked TODAY — pick your dates", kept a live Book button, and
// sent the visitor to a form built from `fleet.filter(s => s.available !==
// false)` — which matched nothing, so they arrived at an empty "Choose a
// vehicle…" with no explanation.
//
// Nothing in the fleet is withdrawn today, so none of that has ever fired. It
// would have fired on the owner's first use of the switch, which is exactly
// the kind of bug that is cheapest to fix before it happens.

describe("a withdrawn vehicle and a busy one are told apart", () => {
  it("keeps them as two flags, not one", () => {
    expect(PAGE).toContain("const withdrawn = item.available === false");
    expect(PAGE).toContain("const busyToday = item.soldOutToday === true");
  });

  it("never tells a withdrawn vehicle's visitor to pick dates", () => {
    // "pick your dates" is the right advice for busy-today and false for a
    // vehicle that is not in the booking form at all.
    const banner = PAGE.slice(PAGE.indexOf("{out && ("), PAGE.indexOf("{out && (") + 700);
    expect(banner).toContain("withdrawn");
    expect(banner).toContain("Fully booked today");
    // The withdrawn branch has to come first, or the ternary is decoration.
    expect(banner.indexOf("withdrawn")).toBeLessThan(banner.indexOf("Fully booked today"));
  });

  it("offers a withdrawn vehicle a way out instead of a way in", () => {
    // The Book link leads to a form that filters this vehicle out.
    expect(PAGE).toContain("See what else is available");
    expect(PAGE).toContain("{withdrawn ? (");
  });

  it("tells search engines it is out of stock", () => {
    expect(PAGE).toContain("available: item.available !== false");
  });
});

describe("the schema default that made this invisible", () => {
  const base = {
    name: "Test 125", description: "x", image: undefined,
    price: 699, category: "scooter", url: "https://roulerodrig.com/x",
  };

  it("says InStock when nobody passes availability", () => {
    // Documented, not endorsed: this default is why a withdrawn vehicle
    // advertised itself as available for as long as the flag was missing.
    const ld = JSON.stringify(productLd({ ...base }));
    expect(ld).toContain("schema.org/InStock");
  });

  it("says OutOfStock when the page passes it", () => {
    const ld = JSON.stringify(productLd({ ...base, available: false }));
    expect(ld).toContain("schema.org/OutOfStock");
    expect(ld).not.toContain("schema.org/InStock");
  });
});
