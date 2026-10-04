import { describe, it, expect } from "vitest";
import {
  HUB_ACTIONS,
  HUB_BRANCHES,
  doorsOf,
  gateIsOpen,
  isVehicleTrade,
  otherShelves,
  VEHICLE_WORDS,
  type HubFacts,
} from "./hub";

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
  it("keeps the six doors it always had, and adds the tree's doors (review 2026-09-30)", () => {
    // This pinned exactly six until the architecture review of 30 Sep 2026
    // made the hub the root of the Marketplace tree. The six are all still
    // here; the new ones are listed by name so an accidental addition or loss
    // still fails, as the old length check did.
    const keys = HUB_ACTIONS.map((a) => a.key);
    for (const key of ["shop", "wash", "deliver", "task", "pro", "celebrations"]) {
      expect(keys).toContain(key);
    }
    expect(keys).toEqual([
      "shop",
      "wash",
      "deliver",
      "task",
      "pro",
      "celebrations",
      "massage",
      "hiking",
      "concierge",
      "esim",
      "transfers",
      "map",
      "emergency",
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never again marks a live flow as coming soon", () => {
    // THE BUG THIS GUARDS. "Do it for me" shipped marked SOON while /deliver
    // had been running it as a quick action the whole time, so the hub was
    // telling customers a working feature did not exist. Both of these are
    // live; a null href on either is the same lie coming back.
    const byKey = Object.fromEntries(HUB_ACTIONS.map((a) => [a.key, a.href]));
    expect(byKey.deliver, "Delivery is live at /deliver").toBe("/deliver");
    expect(byKey.task, "Do it for me is a mode of /deliver").toBe("/deliver");
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

  it("opens every card, because every shelf now has stock on it", () => {
    // M183/M184/M185 gave Professional Services and Celebrations real providers
    // with a bookable service AND a stocked product each, so nothing is "Soon".
    const soon = HUB_ACTIONS.filter((a) => a.href === null).map((a) => a.key);
    expect(soon, `still marked coming soon: ${soon.join(", ")}`).toEqual([]);
  });

  it("sends the shelf cards at the categories that exist", () => {
    // These four slugs are rows in `categories`. A typo here is a 404 on the
    // one page built to send people somewhere.
    const byKey = Object.fromEntries(HUB_ACTIONS.map((a) => [a.key, a.href]));
    expect(byKey.wash).toBe("/shop/c/vehicle-care");
    expect(byKey.pro).toBe("/shop/c/professional-services");
    expect(byKey.celebrations).toBe("/shop/c/celebrations");
  });

  it("points each open card at a route that exists", () => {
    const byKey = Object.fromEntries(HUB_ACTIONS.map((a) => [a.key, a.href]));
    expect(byKey.shop).toBe("/shop");
    expect(byKey.deliver).toBe("/deliver");
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

// ── THE TREE, AND THE RULE THAT NO DOOR OPENS ON AN EMPTY ROOM ──────────────
//
// Architecture review 2026-09-30, item 1. Five branches of doors onto pages
// that exist; a door shows only while its page has something on it, and a
// read that failed is unknown — which keeps the door, as listing-gates keeps a
// page indexable — rather than stripping the hub for an hour of ISR.

/** Everything read, everything stocked. */
const FULL: HubFacts = {
  products: 12,
  shelves: new Set(["vehicle-care", "professional-services", "celebrations", "honey"]),
  experiences: { massage: 2, hiking: 1, boat: 3, fishing: 1 },
  foodConcierge: true,
};

describe("the marketplace tree", () => {
  it("has the brief's five branches, in its order", () => {
    expect(HUB_BRANCHES.map((b) => b.key)).toEqual([
      "products",
      "services",
      "rentals",
      "essentials",
      "requests",
    ]);
  });

  it("files every door under one branch, and none under Rentals", () => {
    // Rentals is drawn from the live fleet (rentals-rail.ts). A typed door
    // there would outlive the day the owner switches a category off.
    const branches = new Set(HUB_BRANCHES.map((b) => b.key));
    for (const a of HUB_ACTIONS) expect(branches.has(a.branch), a.key).toBe(true);
    expect(HUB_ACTIONS.filter((a) => (a.branch as string) === "rentals")).toEqual([]);
  });

  it("groups the doors as the brief's tree does", () => {
    const keys = (b: Parameters<typeof doorsOf>[0]) => doorsOf(b, FULL).map((a) => a.key);
    expect(keys("products")).toEqual(["shop", "celebrations"]);
    expect(keys("services")).toEqual(["wash", "pro", "massage", "hiking"]);
    expect(keys("essentials")).toEqual(["esim", "transfers", "map", "emergency"]);
    expect(keys("requests")).toEqual(["deliver", "task", "concierge"]);
  });

  it("essentials are links to the pages that own them, nothing more", () => {
    const hrefs = doorsOf("essentials", FULL).map((a) => a.href);
    expect(hrefs).toEqual(["/esim", "/transfers", "/map", "/emergency"]);
  });
});

describe("a door is shown only while its room has something in it", () => {
  it("closes each shelf door on its own empty shelf, and only that one", () => {
    const facts = { ...FULL, shelves: new Set(["celebrations"]) };
    expect(doorsOf("services", facts).map((a) => a.key)).toEqual(["massage", "hiking"]);
    expect(doorsOf("products", facts).map((a) => a.key)).toEqual(["shop", "celebrations"]);
  });

  it("closes Shop when /shop would render its launch state", () => {
    const facts = { ...FULL, products: 0, shelves: new Set<string>() };
    expect(doorsOf("products", facts)).toEqual([]);
  });

  it("closes massage and hiking when the vertical has no provider", () => {
    const facts: HubFacts = { ...FULL, experiences: { massage: 0, hiking: 0, boat: 1, fishing: 1 } };
    expect(doorsOf("services", facts).map((a) => a.key)).toEqual(["wash", "pro"]);
  });

  it("closes the food concierge when the owner has switched it off", () => {
    expect(doorsOf("requests", { ...FULL, foodConcierge: false }).map((a) => a.key)).toEqual([
      "deliver",
      "task",
    ]);
  });

  it("keeps every door when the reads failed — unknown is not empty", () => {
    const unknown: HubFacts = {
      products: null,
      shelves: null,
      experiences: { massage: null, hiking: null, boat: null, fishing: null },
      foodConcierge: true,
    };
    for (const a of HUB_ACTIONS) expect(gateIsOpen(a.gate, unknown), a.key).toBe(true);
  });

  it("still shows a not-yet-open door as Soon, whatever its gate says", () => {
    const soon = [{ ...HUB_ACTIONS[1], href: null }];
    const empty = { ...FULL, shelves: new Set<string>() };
    expect(doorsOf("services", empty, soon).map((a) => a.key)).toEqual(["wash"]);
  });
});

describe("the other live shelves under Products", () => {
  const cats = [
    { slug: "honey", name: "Honey", count: 4 },
    { slug: "celebrations", name: "Celebrations", count: 2 },
    { slug: "vehicle-care", name: "Vehicle Care", count: 1 },
    { slug: "spices-piment", name: "Spices & piment", count: 0 },
    { slug: "handicraft", name: "  Handicraft ", count: 3 },
  ];

  it("lists shelves with something on them that no door already opens", () => {
    expect(otherShelves(cats)).toEqual([
      { slug: "honey", name: "Honey" },
      { slug: "handicraft", name: "Handicraft" },
    ]);
  });

  it("lists nothing when the read failed", () => {
    expect(otherShelves(null)).toEqual([]);
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
