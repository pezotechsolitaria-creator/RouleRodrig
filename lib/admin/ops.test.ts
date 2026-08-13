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
