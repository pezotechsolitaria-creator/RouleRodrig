import { describe, it, expect } from "vitest";
import { showsVisitorNav, isConsole, consoleOf } from "./nav-scope";

// The bug this locks down: the customer's tab bar rendered on every path except
// "/" and "/merchant", because those were the only two anyone had thought to
// exclude. So the platform operator got "Order food" and "Ti Roulé" underneath
// the /admin order queue, and a floating bar sat beside the pay button.

describe("showsVisitorNav", () => {
  it("shows on ordinary visitor pages", () => {
    for (const p of ["/explore", "/shop", "/shop/miel-rodrigues", "/food", "/events", "/order", "/track", "/more", "/cart", "/taxi", "/guide/beaches"]) {
      expect(showsVisitorNav(p), p).toBe(true);
    }
  });

  it("never shows on a console — each has its own navigation", () => {
    for (const p of [
      "/admin", "/admin/food", "/admin/content",
      "/merchant", "/merchant/orders",
      "/organizer", "/organizer/summer-fest/scan",
      "/driver", "/driver/apply",
      "/partner",
    ]) {
      expect(showsVisitorNav(p), p).toBe(false);
    }
  });

  it("never shows during a one-decision flow", () => {
    for (const p of ["/checkout", "/checkout?cart=food", "/login", "/auth/callback", "/auth/reset-password"]) {
      expect(showsVisitorNav(p.split("?")[0]), p).toBe(false);
    }
  });

  it("steps aside on the homepage, which renders its own bar", () => {
    expect(showsVisitorNav("/")).toBe(false);
  });

  it("does not treat a page that merely STARTS with a console's letters as a console", () => {
    // "/administration" and "/drivers-guide" are not consoles. A bare
    // startsWith() would have swallowed both.
    expect(showsVisitorNav("/administration")).toBe(true);
    expect(showsVisitorNav("/drivers-guide")).toBe(true);
    expect(showsVisitorNav("/partnerships")).toBe(true);
    expect(showsVisitorNav("/logins")).toBe(true);
  });
});

describe("consoleOf", () => {
  it("names the console a path belongs to", () => {
    expect(consoleOf("/admin/food")).toBe("/admin");
    expect(consoleOf("/merchant/orders/123")).toBe("/merchant");
    expect(consoleOf("/organizer/summer-fest")).toBe("/organizer");
  });

  it("is null for a visitor page", () => {
    expect(consoleOf("/shop")).toBeNull();
    expect(consoleOf("/administration")).toBeNull();
  });
});

describe("isConsole", () => {
  it("matches the exact prefix and its children only", () => {
    expect(isConsole("/driver")).toBe(true);
    expect(isConsole("/driver/apply")).toBe(true);
    expect(isConsole("/drivers")).toBe(false);
  });
});

describe("every console screen is registered", () => {
  it("treats /kitchen as a console", () => {
    // A cook mid-service was getting the visitor tab bar ("Order food",
    // "Ti Roulé") and a floating mascot over the order they were cooking,
    // because /kitchen shipped without being added here. The rule file exists
    // precisely so a new console cannot be forgotten — this asserts it was not.
    expect(isConsole("/kitchen")).toBe(true);
    expect(showsVisitorNav("/kitchen")).toBe(false);
  });

  it("covers every console the app actually has", () => {
    for (const p of ["/admin", "/merchant", "/organizer", "/driver", "/partner", "/kitchen"]) {
      expect(isConsole(p), `${p} must be a console`).toBe(true);
      expect(showsVisitorNav(p), `${p} must not show visitor tabs`).toBe(false);
    }
  });

  it("still shows the tab bar on ordinary visitor pages", () => {
    // The inverse matters just as much: over-matching would strip the nav from
    // the pages that need it.
    for (const p of ["/shop", "/food", "/events", "/orders/track", "/manage-booking"]) {
      expect(showsVisitorNav(p), `${p} must keep the tabs`).toBe(true);
    }
  });
});
