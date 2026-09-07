import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── "I STILL CANNOT ADD A DISH" ─────────────────────────────────────────────
//
// Reported by the owner on 2026-09-07 and found in the data, not the code.
//
// kitchen_staff.role is `text DEFAULT 'cook'` with a CHECK of ('owner','cook').
// admin_add_kitchen_staff() named four columns in its INSERT and role was not
// one of them, and /api/admin/kitchen-staff never sent one -- so EVERY person
// the product has ever added to a kitchen became a cook, including the person
// who owns the restaurant.
//
// app/kitchen/page.tsx reads:
//
//     .from("kitchen_staff").select("store_id").eq("role", "owner").limit(1)
//     const isOwner = (ownerRows?.length ?? 0) > 0;
//
// and passes isOwner to KitchenBoard as `canManage`, which MenuPanel uses to
// gate BOTH "Add a dish" and "Edit dish", and which also gates the four-tile
// management grid on /kitchen. A cook sees a menu he cannot change. The owner
// was a cook.
//
// Fixed in two places, and this file holds both:
//   the DATA  — the two live kitchens now carry role 'owner' (not testable here)
//   the PRODUCT — an admin can now choose, so it never recurs silently
describe("adding an owner to a kitchen", () => {
  const ROUTE = read("app", "api", "admin", "kitchen-staff", "route.ts");
  const PANEL = read("components", "admin", "KitchenStaffPanel.tsx");

  it("sends a role to the RPC", () => {
    // The whole bug in one line: this argument did not exist.
    expect(ROUTE).toContain("p_role: parsed.data.role");
  });

  it("accepts only the two roles the CHECK constraint allows", () => {
    expect(ROUTE).toMatch(/role:\s*z\.enum\(\["cook",\s*"owner"\]\)/);
  });

  it("defaults an omitted role to cook, never owner", () => {
    // An omitted field must not quietly hand somebody the menu and the prices.
    expect(ROUTE).toMatch(/z\.enum\(\["cook",\s*"owner"\]\)\.default\("cook"\)/);
  });

  it("surfaces the RPC's own role error rather than a 500", () => {
    // RR006 is raised by admin_add_kitchen_staff for a role outside the pair.
    expect(ROUTE).toContain('error.code === "RR006"');
  });

  it("reads the role back, so the list can show it", () => {
    // Without this the admin list cannot tell an owner from a cook -- which is
    // how the owner sat as a cook on his own kitchen unnoticed.
    expect(ROUTE).toMatch(/\.select\("id, store_id, invite_email, display_name, user_id, created_at, role,/);
  });

  it("offers the choice in the admin panel", () => {
    expect(PANEL).toContain('<option value="cook"');
    expect(PANEL).toContain('<option value="owner"');
  });

  it("says what Owner grants before somebody picks it", () => {
    // "Owner" on its own does not tell an admin they are handing over pricing.
    expect(PANEL).toMatch(/Owner[^<]*menu/i);
  });

  it("sends the chosen role with the invite", () => {
    expect(PANEL).toMatch(/name:\s*name\.trim\(\),\s*role\s*\}/);
  });
});

// ── THE GATE THIS ALL FEEDS ─────────────────────────────────────────────────
//
// If the /kitchen side ever stops keying off role='owner', the fix above is
// silently pointless. Pin the contract from the other end too.
describe("what an owner sees at /kitchen", () => {
  const PAGE = read("app", "kitchen", "page.tsx");
  const MENU = read("app", "kitchen", "MenuPanel.tsx");

  it("decides ownership from the role column", () => {
    expect(PAGE).toContain('.eq("role", "owner")');
  });

  it("hands that decision to the board as canManage", () => {
    expect(PAGE).toContain("canManage={isOwner}");
  });

  it("gates both menu-editing controls on it", () => {
    // Add a dish, on an empty menu and on a menu that already has dishes.
    expect(MENU).toContain("canManage && dishes.length > 0");
    // Edit dish, per row.
    expect(MENU).toMatch(/canManage &&[\s\S]{0,400}products\/\$\{d\.productId\}\/edit/);
  });

  it("points those controls at routes that exist", () => {
    // They are Links, not fetches: a typo here is a 404 the owner reads as
    // "still cannot add a dish".
    expect(MENU).toContain("/merchant/products/new");
    for (const p of [
      ["app", "merchant", "(app)", "products", "new", "page.tsx"],
      ["app", "merchant", "(app)", "products", "[id]", "edit", "page.tsx"],
    ]) {
      expect(() => read(...p), p.join("/")).not.toThrow();
    }
  });
});
