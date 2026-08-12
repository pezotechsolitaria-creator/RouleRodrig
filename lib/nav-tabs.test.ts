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
    expect(tabLabel(tab("account"), "en")).toBe("Account");
    expect(tabLabel(tab("account"), "fr")).toBe("Compte");
    expect(tabLabel(tab("account"), "cr")).toBe("Kont");
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

  it("lights Account for tracking, bookings, orders and sign-in", () => {
    // Tracking used to be its own tab. It is one thing you do about YOUR stuff,
    // so it now lives under the page that holds all of it — including the
    // dashboards a merchant, driver or organiser could previously only reach by
    // typing the URL.
    expect(lit("/account")).toEqual(["account"]);
    expect(lit("/track")).toEqual(["account"]);
    expect(lit("/manage-booking")).toEqual(["account"]);
    expect(lit("/orders")).toEqual(["account"]);
    expect(lit("/orders/8a1f7c2e-0000-4000-8000-000000000000")).toEqual(["account"]);
    expect(lit("/orders/track")).toEqual(["account"]);
    expect(lit("/login")).toEqual(["account"]);
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

  it("does not let /order steal /orders from Account", () => {
    // startsWith("/order") matches "/orders" — the bug the Order tab's
    // exact-match avoids. Two tabs lit at once is worse than the wrong one.
    expect(lit("/orders")).toEqual(["account"]);
  });

  it("lights nothing on a page in no section at all", () => {
    expect(lit("/legal/terms")).toEqual([]);
  });
});
