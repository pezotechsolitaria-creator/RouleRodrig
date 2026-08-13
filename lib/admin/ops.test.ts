import { describe, it, expect } from "vitest";
import {
  attentionItems, mergeActivity, escapeIlike, containsPattern, isSearchable,
  type ActivityEvent,
} from "./ops";

// The command centre's job is triage. The two failure modes worth testing are
// mis-ranking (a waiting customer buried under paperwork) and the search box
// becoming a wildcard query — the exact class of bug M11 was.

describe("attentionItems", () => {
  it("drops zero counts entirely rather than rendering '0 problems'", () => {
    expect(attentionItems({})).toEqual([]);
    expect(attentionItems({ pendingReviews: 0, openOrders: { food: 0, shop: 0, events: 0 } })).toEqual([]);
  });

  it("puts a waiting customer above waiting paperwork", () => {
    const items = attentionItems({
      pendingMerchants: 50,          // action — a person waiting on a decision
      openOrders: { food: 1 },       // critical — a customer waiting on food
    });
    expect(items[0].key).toBe("open-orders-food");
    // Severity beats raw count: fifty applications do not outrank one order.
    expect(items[1].key).toBe("merchants");
  });

  it("ranks by count within the same severity", () => {
    const items = attentionItems({
      pendingVehicleBookings: 2,
      pendingPlaceBookings: 7,
    });
    expect(items.map((i) => i.key)).toEqual(["place-bookings", "vehicle-bookings"]);
  });

  it("treats money in limbo as critical", () => {
    const [first] = attentionItems({
      awaitingPaymentConfirmation: { shop: 1 },
      pendingReviews: 30,
    });
    expect(first.key).toBe("awaiting-payment-shop");
    expect(first.severity).toBe("critical");
  });

  it("gives every item a destination — an alert with nowhere to click is a nag", () => {
    const q = { food: 1, shop: 1, events: 1 };
    const items = attentionItems({
      openOrders: q, awaitingPaymentConfirmation: q,
      pendingVehicleBookings: 1, pendingPlaceBookings: 1,
      unhandledSubmissions: 1, pendingReviews: 1, pendingMerchants: 1,
      pendingOwnerApplications: 1, pendingDrivers: 1, deliveriesNeedingAdmin: 1,
      lowStockVariants: 1,
    });
    // 9 singletons + 3 open-order queues + 3 awaiting-payment queues.
    expect(items).toHaveLength(15);
    for (const i of items) expect(i.href.startsWith("/admin")).toBe(true);
  });

  it("sends each order queue to the screen that can actually show it", () => {
    // The bug: both counts were one number linking to /admin/food, which is
    // scoped to kitchens — so a shop or ticket order was counted in an alert
    // whose destination could never display it.
    const items = attentionItems({
      openOrders: { food: 1, shop: 1, events: 1 },
      awaitingPaymentConfirmation: { shop: 1 },
    });
    const href = (k: string) => items.find((i) => i.key === k)?.href;
    expect(href("open-orders-food")).toBe("/admin/food");
    expect(href("open-orders-shop")).toBe("/admin/marketplace");
    expect(href("open-orders-events")).toBe("/admin/events");
    expect(href("awaiting-payment-shop")).toBe("/admin/marketplace");
  });

  it("names the queue in the label, so the number is never ambiguous", () => {
    const [item] = attentionItems({ openOrders: { events: 2 } });
    expect(item.label).toBe("Ticket orders still open");
  });

  it("points listing applications at the studio section that holds them", () => {
    // /admin#owners was right while the studio WAS /admin. Moving the studio to
    // /admin/content turned it into a link that lands on the Command Center and
    // does nothing.
    const [item] = attentionItems({ pendingOwnerApplications: 1 });
    expect(item.href).toBe("/admin/content#owners");
  });
});

describe("mergeActivity", () => {
  const ev = (at: string, line = "x"): ActivityEvent => ({ at, line, href: "/admin" });

  it("interleaves sources newest first, whatever table they came from", () => {
    const merged = mergeActivity([
      [ev("2026-08-12T10:00:00Z", "order")],
      [ev("2026-08-12T11:00:00Z", "booking"), ev("2026-08-12T09:00:00Z", "lead")],
    ]);
    expect(merged.map((e) => e.line)).toEqual(["booking", "order", "lead"]);
  });

  it("caps the feed", () => {
    const many = Array.from({ length: 40 }, (_, i) => ev(`2026-08-0${(i % 9) + 1}T00:00:00Z`));
    expect(mergeActivity([many], 12)).toHaveLength(12);
  });

  it("sinks an unparseable timestamp to the bottom instead of throwing", () => {
    // One malformed legacy row must not take the command centre down, and it
    // must not float to the top pretending to be news either.
    const merged = mergeActivity([[ev("not-a-date", "junk"), ev("2026-08-12T10:00:00Z", "real")]]);
    expect(merged[0].line).toBe("real");
    expect(merged[1].line).toBe("junk");
  });

  it("handles the empty morning", () => {
    expect(mergeActivity([[], []])).toEqual([]);
  });
});

describe("escapeIlike / containsPattern", () => {
  it("defuses % — the character that was an auth bypass in M11", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
    // A bare % must not become match-everything.
    expect(containsPattern("%")).toBe("%\\%%");
  });

  it("defuses _ and the * that PostgREST rewrites to %", () => {
    expect(escapeIlike("a_b")).toBe("a\\_b");
    expect(escapeIlike("a*b")).toBe("a\\*b");
  });

  it("escapes the escape character itself first", () => {
    // Order matters: escaping \ after % would double the added escapes.
    expect(escapeIlike("a\\%b")).toBe("a\\\\\\%b");
  });

  it("leaves an honest name alone (apart from wrapping)", () => {
    expect(containsPattern("  Jean  ")).toBe("%Jean%");
  });
});

describe("isSearchable", () => {
  it("refuses queries too short to mean anything", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable(" a ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
  });
});

describe("food ordering going dark", () => {
  // Every other attention item counts work waiting to be done. This one reports
  // a STATE, and it is the only one that fires on a zero — which is exactly why
  // it needs pinning: a future refactor that treats `count: 0` as "nothing to
  // say" would silently delete the alert.
  it("raises an alarm when nothing is orderable", () => {
    const items = attentionItems({ orderableDishes: 0 });
    const food = items.find((i) => i.key === "food-offline");
    expect(food, "no food-offline item at all").toBeDefined();
    expect(food!.count).toBeGreaterThan(0);
    expect(food!.severity).toBe("critical");
    expect(food!.href).toBe("/admin/food");
  });

  it("says nothing while dishes are on sale", () => {
    const food = attentionItems({ orderableDishes: 7 }).find((i) => i.key === "food-offline");
    expect(food?.count ?? 0).toBe(0);
  });

  it("stays quiet when the count is unknown rather than crying wolf", () => {
    // An absent count means the query failed or has not been wired, which is
    // not the same as "no food". Claiming the shop is shut on missing data
    // would train the owner to ignore the one alert that matters most.
    const food = attentionItems({}).find((i) => i.key === "food-offline");
    expect(food?.count ?? 0).toBe(0);
  });
});

describe("a live kitchen with an empty menu", () => {
  // Found by shopping the site: Chez Banane was active and visible with zero
  // sellable dishes. Nothing is broken and nobody is waiting, so it is not
  // critical — but a customer who opens an OPEN restaurant and finds no food
  // concludes the site is broken, not that the kitchen is quiet.
  it("names them when there are any", () => {
    const item = attentionItems({ emptyLiveKitchens: 1 }).find((i) => i.key === "empty-live-kitchen");
    expect(item, "no empty-live-kitchen item at all").toBeDefined();
    expect(item!.count).toBe(1);
    expect(item!.severity).toBe("action");
    expect(item!.href).toBe("/admin/food");
  });

  it("ranks below the alert that ordering is off entirely", () => {
    // Both fire together on the state production is in today, and the order
    // has to survive a refactor: un-pausing a kitchen with no dishes fixes
    // neither, so "nothing is orderable" must stay the line read first.
    const items = attentionItems({ orderableDishes: 0, emptyLiveKitchens: 1 });
    const offline = items.findIndex((i) => i.key === "food-offline");
    const empty = items.findIndex((i) => i.key === "empty-live-kitchen");
    expect(offline).toBeGreaterThanOrEqual(0);
    expect(empty).toBeGreaterThan(offline);
  });

  it("says nothing when every live kitchen has food", () => {
    const item = attentionItems({ emptyLiveKitchens: 0 }).find((i) => i.key === "empty-live-kitchen");
    expect(item?.count ?? 0).toBe(0);
  });

  it("stays quiet when the count is unknown", () => {
    // Unlike food-offline this one counts work rather than reporting a state,
    // so a missing count is simply nothing to say.
    const item = attentionItems({}).find((i) => i.key === "empty-live-kitchen");
    expect(item?.count ?? 0).toBe(0);
  });
});
