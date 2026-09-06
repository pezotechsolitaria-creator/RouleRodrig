import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── THE FRONT DOOR ONLY ADMITTED ONE KIND OF BUSINESS ───────────────────────
//
// onboard_merchant() raised 'product name is required' and 'price must be zero
// or greater' unconditionally, and inserted a product, a variant and an
// inventory movement every time. So the only business that could create an
// account was one selling a thing with a price and a stock count.
//
// A restaurant sells dishes it cooks to order. A car wash sells thirty minutes
// of somebody's Saturday. Neither could get through the door, and both had a
// fully built console waiting behind it.

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/** The migration that defines the CURRENT onboard_merchant — the last one wins. */
function onboardSql(): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, files[i]), "utf8");
    if (/create\s+(or\s+replace\s+)?function\s+public\.onboard_merchant/i.test(sql)) return sql;
  }
  throw new Error("no migration defines onboard_merchant");
}

describe("onboard_merchant", () => {
  const sql = onboardSql();

  it("no longer demands an item before a business may exist", () => {
    // Requiring one did not produce a stocked shop. It produced an abandoned
    // form, or a made-up product called "test".
    expect(sql).toContain("v_has_item");
    expect(sql).toMatch(/if v_has_item and \(p_price is null/);
  });

  it("still catches a HALF-filled item", () => {
    // Somebody who typed a name and left the price blank meant to sell
    // something, and would otherwise get a free one.
    expect(sql).toMatch(/if v_has_item and \(p_quantity is null/);
  });

  it("creates the extension row that decides which console they get", () => {
    // Without this a car wash signs up, gets no trade_providers row, and is a
    // SHOP as far as every screen is concerned — a stock report instead of a
    // diary. The kind-blindness fixed everywhere else would walk back in
    // through the front door.
    expect(sql).toContain("insert into food_kitchens (store_id)");
    expect(sql).toContain("insert into trade_providers (store_id, trade)");
  });

  it("refuses a kind it does not know", () => {
    expect(sql).toMatch(/v_kind not in \('shop', 'kitchen', 'service'\)/);
  });

  it("does not offer events, which only an admin can create", () => {
    // A self-served organiser would have no event and no way to make one.
    expect(sql).not.toMatch(/v_kind = 'events'/);
  });

  it("makes a trade say what it actually does", () => {
    // The customer is choosing "car wash" or "plumber", not a business name
    // they have never heard of.
    expect(sql).toMatch(/v_kind = 'service' and coalesce\(btrim\(p_business_category\)/);
  });

  // THE TRAP THIS PROJECT HAS ALREADY HIT ONCE.
  it("replaces the function rather than overloading it", () => {
    // A defaulted parameter would create a SECOND function of the same name,
    // and PostgREST refuses an overloaded endpoint with PGRST203 — every signup
    // on the platform would start failing.
    expect(sql).toContain("drop function if exists public.onboard_merchant(");
    expect(sql).toMatch(/versions|overloaded/i);
  });

  it("is not callable by anon", () => {
    expect(sql).toMatch(/revoke all on function public\.onboard_merchant[\s\S]{0,200}from anon/);
  });
});

describe("the signup form", () => {
  const form = readFileSync(
    join(process.cwd(), "components", "merchant", "OnboardingForm.tsx"),
    "utf8",
  );
  const api = readFileSync(
    join(process.cwd(), "app", "api", "merchant", "onboard", "route.ts"),
    "utf8",
  );

  it("asks what kind of business first", () => {
    expect(form).toContain("KIND_CHOICE");
    expect(form).toContain('name="kind"');
  });

  it("offers all three kinds a person can self-serve", () => {
    for (const k of ["shop", "kitchen", "service"]) {
      expect(form).toContain(`k: "${k}"`);
    }
  });

  it("sends the kind, or the console would be decided by accident", () => {
    expect(form).toContain("kind,");
    expect(api).toContain("p_kind: kind");
  });

  it("lets the item step be skipped entirely", () => {
    expect(form).toContain("const blank =");
    expect(api).toContain("if (productName) {");
  });

  it("says the step is skippable, rather than leaving it to be guessed", () => {
    // A label that does not say so leaves somebody inventing a product called
    // "test" to get past it.
    expect(form).toMatch(/if you have one/i);
  });
});
