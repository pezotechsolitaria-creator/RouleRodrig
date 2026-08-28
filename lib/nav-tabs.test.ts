import { describe, it, expect } from "vitest";
import { NAV_TABS, isTabActive, tabLabel } from "./nav-tabs";

// These guard the bug this module was created to fix: the two bottom-nav
// renderers each carried their own copy of the tab list, so the SAME tab was
// called "Track" on one page and "Bookings" on another. Anything that can
// drift again — a missing translation, a duplicated key, a path that lights
// two tabs or none — fails here rather than on a customer's phone.

const tab = (key: string) => {
  const found = NAV_TABS.find((t) => t.key === key);
  if (!found) throw new Error(`no tab "${key}"`);
  return found;
};

describe("NAV_TABS", () => {
  it("has unique keys and hrefs", () => {
    const keys = NAV_TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hrefs = NAV_TABS.map((t) => t.href).filter(Boolean);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("is fully trilingual — no blank or placeholder label", () => {
    for (const t of NAV_TABS) {
      expect(t.label).toHaveLength(3);
      for (const l of t.label) expect(l.trim()).not.toBe("");
    }
  });

  it("gives every tab either a destination or an action, never both", () => {
    for (const t of NAV_TABS) {
      expect(Boolean(t.href) !== Boolean(t.action)).toBe(true);
    }
  });

  it("picks the label for the visitor's language", () => {
    expect(tabLabel(tab("order"), "en")).toBe("Order");
    expect(tabLabel(tab("order"), "fr")).toBe("Commander");
    expect(tabLabel(tab("order"), "cr")).toBe("Komann");
  });
});

describe("isTabActive", () => {
  // Exactly one tab lit per path — never two, and (on a nav destination)
  // never zero, which is what leaves a customer on a screen no tab claims.
  const lit = (pathname: string) => NAV_TABS.filter((t) => isTabActive(t, pathname)).map((t) => t.key);

  it("lights Home only on the homepage itself", () => {
    expect(lit("/")).toEqual(["home"]);
    // "/" prefixes every path — startsWith here would light Home everywhere.
    expect(lit("/explore")).toEqual(["explore"]);
  });

  it("keeps Ti Roulé dead centre — it is the only tab drawn as a gold button", () => {
    // It was third of five, then the Order tab was added ahead of it and pushed
    // it to fourth, where a raised gold button reads as a mistake rather than as
    // the special one. Nothing enforced the position, so nothing caught it.
    const i = NAV_TABS.findIndex((t) => t.key === "tiroule");
    expect(NAV_TABS.length % 2, "an even number of tabs has no centre").toBe(1);
    expect(i).toBe((NAV_TABS.length - 1) / 2);
  });

  it("draws exactly one tab as an action rather than a destination", () => {
    // The centre rule above only means anything while there is one such tab.
    expect(NAV_TABS.filter((t) => t.action).map((t) => t.key)).toEqual(["tiroule"]);
  });

  it("has exactly five tabs, and none of them is the account", () => {
    // The account moved to the top-right corner (components/AccountButton.tsx),
    // beside the language toggle and the saved heart. This bar answers WHERE you
    // are going; an account is WHO you are. Six tabs also left 50px each at
    // 375px, the smallest target on the screen.
    expect(NAV_TABS.map((t) => t.key)).toEqual(["home", "order", "tiroule", "explore", "more"]);
  });

  it("lights NO tab on the account's own pages", () => {
    // Correct, not an oversight: the control that took you there is in the
    // corner. Lighting an unrelated tab would say you are somewhere you are not.
    for (const p of ["/account", "/track", "/manage-booking", "/orders", "/orders/track", "/login"]) {
      expect(lit(p), p).toEqual([]);
    }
  });

  it("lights More and Explore on their own sections", () => {
    expect(lit("/more")).toEqual(["more"]);
    expect(lit("/explore/beaches")).toEqual(["explore"]);
  });

  it("never lights the Ti Roulé action tab", () => {
    for (const p of ["/", "/explore", "/orders", "/more", "/shop"]) {
      expect(lit(p)).not.toContain("tiroule");
    }
  });

  it("lights Order across all three commerce surfaces and the basket", () => {
    // These used to light nothing at all — the shop, food and tickets had no
    // tab, which is exactly why a customer who left the homepage was stranded.
    for (const p of ["/order", "/shop", "/shop/miel-rodrigues", "/food", "/food/ourite", "/events", "/cart", "/checkout"]) {
      expect(lit(p)).toEqual(["order"]);
    }
  });

  it("does not let the Order tab claim /orders", () => {
    // startsWith("/order") matches "/orders" — the bug the Order tab's
    // exact-match avoids. /orders is account territory and lights nothing.
    expect(lit("/orders")).toEqual([]);
    expect(lit("/order")).toEqual(["order"]);
  });

  it("lights nothing on a page in no section at all", () => {
    expect(lit("/legal/terms")).toEqual([]);
  });
});
