import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── AN EDIT MUST ONLY EVER TOUCH WHAT IT WAS OPENED ON (M131) ───────────────
//
// Two findings from the unguarded-entity audit, both admin- or merchant-only,
// both silent, both real:
//
//   1. saveVariants() updated a size row scoped ONLY by its id, while the
//      payload set product_id. A size id belonging to a different dish was not
//      rejected — it was MOVED onto this dish, name and price with it, and
//      this dish's real sizes were deactivated on the way out because they
//      were missing from the submission.
//
//   2. The merchant price endpoint wrapped its write in `if (variant)` with no
//      else and returned { ok: true } regardless. A product with no size row
//      meant the merchant raised their price, saw it confirmed, and kept
//      selling at the old one.
//
// Neither needs an attacker. A stale tab, two people editing at once, or a
// half-finished product is enough — which is exactly why they went unnoticed.

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const stripComments = (src: string) =>
  src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("a menu edit cannot reach another dish", () => {
  const src = stripComments(read("lib/food/admin.ts"));

  it("refuses a size that does not already belong to this dish", () => {
    expect(src).toMatch(/ownIds/);
    expect(src).toMatch(/no longer belongs to this dish/);
  });

  it("checks the whole submission BEFORE writing any of it", () => {
    // Half-applying leaves the menu in a state nobody chose. The guard must
    // run before the write loop, not inside it.
    const guardAt = src.indexOf("ownIds.has");
    const loopAt = src.indexOf("for (const [index, v] of variants.entries())");
    expect(guardAt).toBeGreaterThan(-1);
    expect(loopAt).toBeGreaterThan(-1);
    expect(guardAt, "the ownership check must come before the write loop").toBeLessThan(loopAt);
  });

  it("scopes the update by product as well as id", () => {
    // The backstop. An UPDATE able to reach another dish's row is one typo
    // away from being this bug again.
    expect(src).toMatch(/\.update\(payload\)[\s\S]{0,120}\.eq\("product_id", productId\)/);
  });
});

describe("a price that did not save says so", () => {
  const src = stripComments(read("app/api/merchant/products/[id]/route.ts"));

  it("refuses rather than reporting success when there is no size to price", () => {
    expect(src).toMatch(/if \(!variant\)/);
    expect(src).toMatch(/no size to price/);
  });

  it("does not return ok:true on that path", () => {
    // The whole bug: the handler fell through to its success response.
    const i = src.indexOf("if (!variant)");
    const between = src.slice(i, i + 400);
    expect(between).toMatch(/status: 409/);
    expect(between).not.toMatch(/ok: true/);
  });
});
