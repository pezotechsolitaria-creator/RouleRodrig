import { describe, it, expect } from "vitest";
import { isActive } from "./AdminShell";

// architecture review 2026-09-30, item 6: /admin/content-history sits beside
// /admin/content in the sidebar. A bare prefix match lit both at once.
describe("the sidebar highlights one desk", () => {
  it("does not light the content studio on the history page", () => {
    expect(isActive("/admin/content-history", "/admin/content")).toBe(false);
    expect(isActive("/admin/content-history", "/admin/content-history")).toBe(true);
  });

  it("still lights a desk on its own sub-pages", () => {
    expect(isActive("/admin/invoices/abc", "/admin/invoices")).toBe(true);
    expect(isActive("/admin/categories", "/admin/categories")).toBe(true);
  });

  it("keeps the Command Center exact and hash links unlit", () => {
    expect(isActive("/admin/food", "/admin")).toBe(false);
    expect(isActive("/admin/content", "/admin/content#bookings")).toBe(false);
  });
});
