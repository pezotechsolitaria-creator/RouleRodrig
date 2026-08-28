import { describe, it, expect } from "vitest";
import {
  showsVisitorNav,
  showsSiteFooter,
  isConsole,
  consoleOf,
} from "./nav-scope";

// The bug this locks down: the customer's tab bar rendered on every path except
// "/" and "/merchant", because those were the only two anyone had thought to
// exclude. So the platform operator got "Order food" and "Ti Roulé" underneath
// the /admin order queue, and a floating bar sat beside the pay button.

describe("showsVisitorNav", () => {
  it("shows on ordinary visitor pages", () => {
    for (const p of [
      "/explore",
      "/shop",
      "/shop/miel-rodrigues",
      "/food",
      "/events",
      "/order",
      "/track",
      "/more",
      "/cart",
      "/taxi",
      "/guide/beaches",
    ]) {
      expect(showsVisitorNav(p), p).toBe(true);
    }
  });

  it("never shows on a console — each has its own navigation", () => {
    for (const p of [
      "/admin",
      "/admin/food",
      "/admin/content",
      "/merchant",
      "/merchant/orders",
      "/organizer",
      "/organizer/summer-fest/scan",
      "/driver",
      "/driver/apply",
      "/partner",
    ]) {
      expect(showsVisitorNav(p), p).toBe(false);
    }
  });

  it("never shows during a one-decision flow", () => {
    for (const p of [
      "/checkout",
      "/checkout?cart=food",
      "/login",
      "/auth/callback",
      "/auth/reset-password",
      "/deliver",
      "/deliver/abc-123",
      "/taxi/book",
      "/transfers",
    ]) {
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
    for (const p of [
      "/admin",
      "/merchant",
      "/organizer",
      "/driver",
      "/partner",
      "/kitchen",
    ]) {
      expect(isConsole(p), `${p} must be a console`).toBe(true);
      expect(showsVisitorNav(p), `${p} must not show visitor tabs`).toBe(false);
    }
  });

  it("still shows the tab bar on ordinary visitor pages", () => {
    // The inverse matters just as much: over-matching would strip the nav from
    // the pages that need it.
    for (const p of [
      "/shop",
      "/food",
      "/events",
      "/orders/track",
      "/manage-booking",
    ]) {
      expect(showsVisitorNav(p), `${p} must keep the tabs`).toBe(true);
    }
  });
});

// ── The booking paths lose the bar; the browsing paths keep it ──────────────
//
// /taxi/book and /transfers are forms with a primary action at the bottom, and
// the floating pill was costing each of them 138px — a 64px in-flow spacer plus
// a ~74px pill hovering over the thumb's target. But the prefixes have to stay
// narrow, because the neighbouring routes are not forms: /taxi is a directory
// somebody browses, and /taxi/track is something they watch.
describe("the taxi and transfer split", () => {
  // Query stripped the way every test above does it: usePathname() never
  // returns one, so a raw "?service=airport" is not an input this can receive.
  it("takes the bar off the booking forms", () => {
    for (const p of [
      "/taxi/book",
      "/taxi/book?service=airport",
      "/transfers",
    ]) {
      expect(showsVisitorNav(p.split("?")[0]), p).toBe(false);
    }
  });

  it("leaves it on the directory and the tracking screen", () => {
    for (const p of ["/taxi", "/taxi/track", "/taxi/track?ref=abc"]) {
      expect(showsVisitorNav(p.split("?")[0]), p).toBe(true);
    }
  });
});

describe("showsSiteFooter", () => {
  it("is on the ordinary pages a visitor reads", () => {
    for (const p of [
      "/taxi",
      "/food",
      "/shop",
      "/events",
      "/more",
      "/guide/beaches",
      "/fr/plages-rodrigues",
      "/emergency",
    ]) {
      expect(showsSiteFooter(p), p).toBe(true);
    }
  });

  it("is NOT on the homepage, which renders its own", () => {
    // app/page.tsx passes <Footer> in itself, under the sponsor strip. Without
    // this the site would print two footers on its most visited page.
    expect(showsSiteFooter("/")).toBe(false);
  });

  it("is NOT on any console", () => {
    for (const p of [
      "/admin",
      "/admin/availability",
      "/merchant",
      "/merchant/orders",
      "/organizer",
      "/driver",
      "/partner",
      "/kitchen",
    ]) {
      expect(showsSiteFooter(p), p).toBe(false);
    }
  });

  it("IS on focused flows, unlike the tab bar", () => {
    // The distinction this rule exists for. A floating pill over the pay button
    // is a competing target; a footer below the fold is not.
    for (const p of ["/checkout", "/deliver", "/taxi/book", "/transfers", "/login"]) {
      expect(showsVisitorNav(p), `tab bar on ${p}`).toBe(false);
      expect(showsSiteFooter(p), `footer on ${p}`).toBe(true);
    }
  });

  it("does not mistake a page that merely starts with a console name", () => {
    expect(showsSiteFooter("/administration")).toBe(true);
    expect(showsSiteFooter("/drivers-guide")).toBe(true);
  });
});
