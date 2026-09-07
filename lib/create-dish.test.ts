import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── "ADD A DISH" HAS TO CREATE A DISH ───────────────────────────────────────
//
// The second half of the 2026-09-07 kitchen bug. Fixing the owner's role made
// "Add a dish" appear — and it linked to /merchant/products/new, which calls
// create_product(). That writes products + product_variants and nothing else.
//
// A dish is a product that ALSO has a food_items row. kitchen_menu(), the RPC
// behind "Today's menu", inner joins food_items, and so does the public food
// catalogue. So the button would have created something invisible on the menu
// it was pressed from and invisible on /food, while appearing in
// /merchant/products — the click succeeding and nothing showing up, which is
// worse than a button that refuses.
//
// Verified end to end against production before this test was written: called
// create_dish() as the owner inside a transaction, confirmed the dish appeared
// in kitchen_menu() for Chez Banane, then deleted it.
describe("creating a product in a kitchen", () => {
  const ROUTE = read("app", "api", "merchant", "products", "route.ts");

  it("uses create_dish for a kitchen", () => {
    expect(ROUTE).toContain('.rpc("create_dish"');
  });

  it("still uses create_product for a shop", () => {
    // The same form serves both. A shop must never get a food_items row.
    expect(ROUTE).toContain('.rpc("create_product"');
  });

  it("decides on what the store IS, not on anything the caller sends", () => {
    // A client-supplied "isKitchen" would let a shop request a dish.
    expect(ROUTE).toMatch(/from\("food_kitchens"\)[\s\S]{0,200}\.eq\("store_id", storeId\)/);
    expect(ROUTE).toContain("const isKitchen = Boolean(kitchenRow)");
  });
});

// ── THE MIGRATION'S OWN TRAPS ───────────────────────────────────────────────
//
// Two things about this function are load-bearing and easy to undo by
// "tidying" it later. Both cost a debugging session on 2026-09-07.
describe("create_dish, as written", () => {
  const RAW = read("supabase", "migrations", "20260907101500_m187_b_create_dish_must_not_name_citext.sql");
  // The comment block explains the bug by naming the cast that caused it, so a
  // bare substring check on the whole file fails on its own explanation. Strip
  // the comments and assert on the SQL that actually runs.
  const SQL = RAW.replace(/^\s*--.*$/gm, "");

  it("never names citext", () => {
    // The function pins its search_path (it is SECURITY DEFINER, so it must),
    // and Supabase installs extensions into a separate schema. Naming the type
    // fails with 42704 at runtime, not at deploy — every call, silently, until
    // somebody actually presses the button.
    expect(SQL).not.toMatch(/::citext/);
  });

  it("keeps its search_path pinned", () => {
    // The fix for the citext error must never be "widen the search_path".
    expect(SQL).toContain("set search_path to 'public', 'pg_temp'");
  });

  it("checks staff access itself rather than trusting the caller", () => {
    expect(SQL).toContain("is_store_staff(p_store_id)");
  });

  it("refuses a store that is not a kitchen", () => {
    expect(SQL).toMatch(/food_kitchens fk where fk\.store_id = p_store_id/);
  });

  it("is not reachable by anon", () => {
    // It creates rows. CREATE FUNCTION grants EXECUTE to PUBLIC, and this
    // database also grants anon and authenticated by default privileges —
    // which REVOKE FROM PUBLIC does not undo, so anon must be named.
    expect(SQL).toMatch(/revoke all on function public\.create_dish[^\n]*from anon/);
  });

  it("suffixes a duplicate slug instead of failing", () => {
    // Two dishes called "Salade" is a real kitchen, not a validation error.
    expect(SQL).toMatch(/v_slug := v_base \|\| '-' \|\| v_n::text/);
  });
});

// ── AND THE SCREEN THAT FORGOT TO ASK ───────────────────────────────────────
describe("the merchant console's menu screen", () => {
  const PAGE = read("app", "merchant", "(app)", "menu", "page.tsx");

  it("tells MenuPanel who is looking", () => {
    // It rendered <MenuPanel /> with no prop, and canManage defaults to false —
    // so even a correctly-roled owner got the cook's read-only menu here.
    expect(PAGE).toContain("<MenuPanel canManage={canManage} />");
  });

  it("scopes the owner check to the store being shown", () => {
    // Not "am I an owner of any kitchen" — that would hand a cook at this
    // kitchen the controls because they own a different one.
    expect(PAGE).toMatch(/\.eq\("store_id", storeId\)[\s\S]{0,80}\.eq\("role", "owner"\)/);
  });
});
