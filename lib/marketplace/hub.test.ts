import { describe, it, expect } from "vitest";
import { HUB_ACTIONS, isVehicleTrade, VEHICLE_WORDS } from "./hub";

// ── THE HUB, AND THE ONE FILTER IT DEPENDS ON ───────────────────────────────
//
// /marketplace is a menu, and a menu that lies costs somebody their afternoon.
// Two things can go wrong and neither shows up in a screenshot:
//
//   A CARD THAT PROMISES A DOOR THAT IS NOT THERE. `href: null` is the single
//   source of "not yet"; if a second flag ever appears they will disagree.
//
//   A PROVIDER NOBODY CAN FIND. trade_providers.trade is free text — its own
//   migration says "an island of tradespeople will not fit a list we guessed in
//   advance" — so the vehicle filter reads what an admin typed. Missing a real
//   car wash makes it invisible on the one page built to find it, which is the
//   whole failure this page exists to fix.

describe("the menu cannot lie about what is open", () => {
  it("offers the six the brief asked for", () => {
    expect(HUB_ACTIONS).toHaveLength(6);
    for (const key of ["shop", "wash", "deliver", "pro", "task", "admin"]) {
      expect(HUB_ACTIONS.map((a) => a.key)).toContain(key);
    }
  });

  it("has one source of truth for whether a door is open", () => {
    // Every action is either a usable path or an explicit null. A "" or a "#"
    // would render as a link and go nowhere.
    for (const a of HUB_ACTIONS) {
      if (a.href !== null) {
        expect(a.href, a.key).toMatch(/^\/[a-z0-9/-]*$/);
        expect(a.href, a.key).not.toBe("/");
      }
    }
  });

  it("opens exactly the three that are actually built", () => {
    // Shop and Delivery have been live for months; Wash became real when
    // trade_providers + book_service_slot_public landed. The other three have
    // no implementation, so they must not be linked.
    const open = HUB_ACTIONS.filter((a) => a.href).map((a) => a.key).sort();
    expect(open).toEqual(["deliver", "shop", "wash"]);
  });

  it("points each open card at a route that exists", () => {
    const byKey = Object.fromEntries(HUB_ACTIONS.map((a) => [a.key, a.href]));
    expect(byKey.shop).toBe("/shop");
    expect(byKey.deliver).toBe("/deliver");
    expect(byKey.wash).toBe("/marketplace/wash");
  });

  it("gives every card words of its own", () => {
    for (const a of HUB_ACTIONS) {
      expect(a.title.trim(), a.key).not.toBe("");
      expect(a.blurb.trim(), a.key).not.toBe("");
    }
    const titles = HUB_ACTIONS.map((a) => a.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

describe("a car wash is found however the admin typed it", () => {
  it("matches the trade already in the database", () => {
    // The live provider reads "Car wash and valeting". If this ever stops
    // matching, the page goes empty and looks like there are no car washes.
    expect(isVehicleTrade("Car wash and valeting")).toBe(true);
  });

  it("does not care about case", () => {
    expect(isVehicleTrade("CAR WASH")).toBe(true);
    expect(isVehicleTrade("car wash")).toBe(true);
    expect(isVehicleTrade("Car Wash")).toBe(true);
  });

  it("does not care about accents", () => {
    // "Lavage" is how this is written here, and it is written both ways.
    expect(isVehicleTrade("Lavage auto")).toBe(true);
    expect(isVehicleTrade("Garage / mécanicien")).toBe(true);
    expect(isVehicleTrade("Nettoyage de voitures")).toBe(true);
  });

  it("catches the ordinary ways somebody describes the work", () => {
    for (const trade of [
      "Carwash",
      "Mobile valeting",
      "Car detailing",
      "Mechanic",
      "Tyre repair",
      "Scooter servicing",
      "Auto electrics",
    ]) {
      expect(isVehicleTrade(trade), trade).toBe(true);
    }
  });

  it("leaves the trades that are not about vehicles", () => {
    for (const trade of ["Plumber", "Electrician", "Hairdresser", "Gardener"]) {
      expect(isVehicleTrade(trade), trade).toBe(false);
    }
  });

  it("survives an empty or whitespace trade without throwing", () => {
    expect(isVehicleTrade("")).toBe(false);
    expect(isVehicleTrade("   ")).toBe(false);
  });

  it("keeps the word list lowercase, or nothing matches", () => {
    // The comparison lowercases the trade but NOT the list, so an uppercase
    // entry here would silently never match anything.
    for (const w of VEHICLE_WORDS) {
      expect(w, w).toBe(w.toLowerCase());
    }
  });
});
