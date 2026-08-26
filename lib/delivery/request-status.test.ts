import { describe, it, expect } from "vitest";
import {
  requestStatusCopy,
  legCopy,
  legIndex,
  LEG_ORDER,
  TERMINAL_LEGS,
  BROKEN_LEGS,
  ACTIVE_LEGS,
  PRE_PICKUP_LEGS,
  requestRef,
  normaliseRef,
  sortQuotes,
  quoteBadges,
  formatFee,
  payAtDoor,
  expiresIn,
  type Quote,
} from "./request-status";

const NOW = new Date("2026-08-26T10:00:00Z");

function quote(over: Partial<Quote> & Pick<Quote, "id" | "fee">): Quote {
  return {
    note: null,
    status: "offered",
    createdAt: "2026-08-26T09:00:00Z",
    driverName: "A driver",
    vehicleType: "scooter",
    driverPhone: null,
    completed: 0,
    rating: null,
    ...over,
  };
}

// The whole point of this surface is that the customer knows THE NEXT MOVE IS
// THEIRS. Every other order on this site is committed when it is placed, so a
// screen that fails to say so leaves somebody waiting for a driver who was
// never sent. That is the property these tests exist to hold.

describe("the state of a request, in words", () => {
  it("says nobody is coming yet, whenever prices are waiting", () => {
    const c = requestStatusCopy({ status: "open", quoteCount: 3, now: NOW });
    expect(c.needsCustomer).toBe(true);
    expect(c.tone).toBe("action");
    expect(c.label).toBe("3 prices in");
    expect(c.detail).toMatch(/nobody is on the way until you choose/i);
  });

  it("counts one price without the plural", () => {
    const c = requestStatusCopy({ status: "open", quoteCount: 1, now: NOW });
    expect(c.label).toBe("1 price in");
    expect(c.headline).toBe("You have a price");
  });

  it("distinguishes an empty board from a full one", () => {
    const waiting = requestStatusCopy({ status: "open", quoteCount: 0, now: NOW });
    expect(waiting.needsCustomer).toBe(false);
    expect(waiting.tone).toBe("waiting");
    // The same database status as the case above. If these two read the same,
    // the screen is lying to one of them.
    expect(waiting.headline).not.toBe(
      requestStatusCopy({ status: "open", quoteCount: 2, now: NOW }).headline,
    );
  });

  it("treats a past expiry as expired even while the row still says open", () => {
    // The row is only closed by a sweep. Until it runs, the customer must not be
    // told that drivers are looking at a job that has aged out.
    const c = requestStatusCopy({
      status: "open",
      quoteCount: 0,
      expiresAt: "2026-08-26T09:59:00Z",
      now: NOW,
    });
    expect(c.tone).toBe("dead");
    expect(c.label).toBe("Expired");
    expect(c.detail).toMatch(/post it again/i);
  });

  it("leaves a request open while its expiry is still ahead", () => {
    const c = requestStatusCopy({
      status: "open",
      quoteCount: 0,
      expiresAt: "2026-08-26T10:01:00Z",
      now: NOW,
    });
    expect(c.tone).toBe("waiting");
  });

  it("stops asking the customer for anything once a driver is booked", () => {
    const c = requestStatusCopy({ status: "accepted", quoteCount: 4, now: NOW });
    expect(c.needsCustomer).toBe(false);
    expect(c.tone).toBe("moving");
  });

  // ── The delivery can go wrong AFTER the choice was made ──────────────────
  // delivery_requests.status goes to 'accepted' and nothing ever moves it back:
  // driver_cannot_complete() and admin_reassign_delivery() touch only the
  // deliveries row. So the request says 'accepted' for ever and the DELIVERY is
  // the only thing that knows the driver walked away.

  it("stops claiming a driver is booked once that driver has dropped out", () => {
    // The exact failure this whole surface exists to prevent, reached from the
    // other end: a customer sitting and waiting for somebody nobody sent.
    const c = requestStatusCopy({
      status: "accepted",
      quoteCount: 0,
      deliveryStatus: "searching_driver",
      now: NOW,
    });
    expect(c.headline).not.toMatch(/booked/i);
    expect(c.headline).toMatch(/drop out/i);
    expect(c.detail).toMatch(/nothing for you to do/i);
    expect(c.tone).toBe("waiting");
    expect(c.needsCustomer).toBe(false);
  });

  it("never says booked in ANY broken state", () => {
    for (const leg of BROKEN_LEGS) {
      const c = requestStatusCopy({
        status: "accepted",
        quoteCount: 0,
        deliveryStatus: leg,
        now: NOW,
      });
      expect(c.headline, leg).not.toMatch(/your driver is booked/i);
      expect(c.tone, leg).not.toBe("moving");
      // It is not the customer's to fix, and a call to action they cannot act
      // on reads as blame.
      expect(c.needsCustomer, leg).toBe(false);
    }
  });

  it("reports a failed delivery as failed, not as in progress", () => {
    // The enum label is failed_delivery. The code said "failed", so a delivery
    // that had genuinely failed rendered as still on its way, for ever.
    const c = requestStatusCopy({
      status: "accepted",
      quoteCount: 0,
      deliveryStatus: "failed_delivery",
      now: NOW,
    });
    expect(c.tone).toBe("dead");
    expect(c.headline).toMatch(/could not be delivered/i);
    expect(c.detail).toMatch(/not been charged/i);
  });

  it("marks a completed delivery done rather than moving", () => {
    const c = requestStatusCopy({
      status: "accepted",
      quoteCount: 0,
      deliveryStatus: "delivered",
      now: NOW,
    });
    expect(c.tone).toBe("done");
    expect(c.needsCustomer).toBe(false);
  });

  it("still says booked while the job is genuinely under way", () => {
    for (const leg of ["assigned", "going_to_pickup", "picked_up", "out_for_delivery", "arrived"]) {
      const c = requestStatusCopy({
        status: "accepted",
        quoteCount: 0,
        deliveryStatus: leg,
        now: NOW,
      });
      expect(c.tone, leg).toBe("moving");
      expect(c.headline, leg).toMatch(/booked/i);
    }
  });

  it("says plainly that a cancelled request cost nothing", () => {
    const c = requestStatusCopy({ status: "cancelled", quoteCount: 2, now: NOW });
    expect(c.detail).toMatch(/nothing was charged/i);
    expect(c.needsCustomer).toBe(false);
  });
});

describe("the driver's leg", () => {
  it("names every state on the trail", () => {
    for (const leg of LEG_ORDER) {
      expect(legCopy(leg).label, leg).toBeTruthy();
    }
  });

  it("asks for the code exactly once, and only when it is needed", () => {
    // An instruction repeated at every rung is an instruction nobody reads, and
    // one that arrives before the driver does is one they have forgotten by the
    // time it matters. "delivered" may mention the code in the PAST tense —
    // that is a receipt, not a thing to do.
    const asks = LEG_ORDER.filter((l) => /have your .*code ready/i.test(legCopy(l).detail));
    expect(asks).toEqual(["arrived"]);
    expect(legCopy("delivered").detail).toMatch(/confirmed with your code/i);
  });

  it("puts arrived_at_pickup on the same rung as going_to_pickup", () => {
    // A customer does not need two rungs for "the driver is dealing with the
    // pickup" — an extra step that never visibly advances reads as a stall.
    expect(legIndex("arrived_at_pickup")).toBe(legIndex("going_to_pickup"));
    expect(legIndex("arrived_at_pickup")).toBeGreaterThanOrEqual(0);
  });

  it("advances monotonically along the trail", () => {
    const seen = LEG_ORDER.map(legIndex);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("returns something readable for a status it has never met", () => {
    expect(legCopy("teleported").label).toBeTruthy();
  });

  it("has real copy for EVERY delivery_status the database can produce", () => {
    // The guard against the whole class of bug. legCopy() falls back silently,
    // so a label this file has never heard of does not throw -- it just renders
    // "In progress" for ever. This list is the enum, verbatim.
    const ENUM = [
      "created", "searching_driver", "assigned", "going_to_pickup",
      "arrived_at_pickup", "picked_up", "out_for_delivery", "arrived",
      "delivered", "cancelled", "driver_unavailable", "driver_unresponsive",
      "failed_delivery", "returned_to_merchant", "requires_admin",
    ];
    for (const label of ENUM) {
      expect(legCopy(label).label, label).not.toBe("In progress");
    }
  });

  it("treats every ending as terminal, so nothing polls for ever", () => {
    for (const leg of TERMINAL_LEGS) {
      expect(legCopy(leg).label, leg).not.toBe("In progress");
    }
    // The one that was missing, spelled the way the database spells it.
    expect(TERMINAL_LEGS).toContain("failed_delivery");
    expect(TERMINAL_LEGS as readonly string[]).not.toContain("failed");
  });

  it("lists every state a driver is actually holding a job in", () => {
    // The list app/api/admin/people/route.ts used to hand-write. It had
    // "en_route", which is not a delivery_status label, so PostgREST failed the
    // enum cast and 400d the query -- the owner's driver panel reported zero
    // active assignments for a driver who was mid-delivery.
    expect(ACTIVE_LEGS as readonly string[]).not.toContain("en_route");
    for (const leg of ACTIVE_LEGS) {
      expect(legCopy(leg).label, leg).not.toBe("In progress");
    }
    // Holding a job and being finished with it are disjoint by definition.
    for (const leg of TERMINAL_LEGS) {
      expect(ACTIVE_LEGS as readonly string[], leg).not.toContain(leg);
    }
    for (const leg of BROKEN_LEGS) {
      expect(ACTIVE_LEGS as readonly string[], leg).not.toContain(leg);
    }
  });

  it("lets a customer out only before the driver has collected", () => {
    // After pickup the driver is holding the goods and the database refuses,
    // so offering the button there would be a promise the server breaks.
    for (const leg of ["picked_up", "out_for_delivery", "arrived", "delivered"]) {
      expect(PRE_PICKUP_LEGS as readonly string[], leg).not.toContain(leg);
    }
    // And every state in it is one a driver is genuinely holding.
    for (const leg of PRE_PICKUP_LEGS) {
      expect(ACTIVE_LEGS as readonly string[], leg).toContain(leg);
    }
  });

  it("keeps the broken states off the progress trail", () => {
    // A trail is a route. A driver dropping out is not a rung on it, and
    // showing it as one would imply the job is advancing.
    for (const leg of BROKEN_LEGS) {
      expect(LEG_ORDER as readonly string[], leg).not.toContain(leg);
    }
  });
});

describe("choosing between prices", () => {
  it("puts the cheapest first", () => {
    const out = sortQuotes([quote({ id: "b", fee: 30000 }), quote({ id: "a", fee: 20000 })]);
    expect(out.map((q) => q.id)).toEqual(["a", "b"]);
  });

  it("breaks a tie by experience, never randomly", () => {
    // Two identical prices must land in the same order on every render, or the
    // list shuffles under the customer's thumb as it refreshes.
    const a = quote({ id: "a", fee: 25000, completed: 2 });
    const b = quote({ id: "b", fee: 25000, completed: 40 });
    expect(sortQuotes([a, b]).map((q) => q.id)).toEqual(["b", "a"]);
    expect(sortQuotes([b, a]).map((q) => q.id)).toEqual(["b", "a"]);
  });

  it("does not mutate what it was given", () => {
    const list = [quote({ id: "b", fee: 30000 }), quote({ id: "a", fee: 20000 })];
    sortQuotes(list);
    expect(list.map((q) => q.id)).toEqual(["b", "a"]);
  });

  it("badges nothing when there is only one price", () => {
    // "Lowest price" against no alternative is a sales trick, not information.
    expect(quoteBadges([quote({ id: "a", fee: 20000 })]).size).toBe(0);
    expect(quoteBadges([]).size).toBe(0);
  });

  it("marks the cheapest rather than relying on position alone", () => {
    const badges = quoteBadges([quote({ id: "a", fee: 20000 }), quote({ id: "b", fee: 30000 })]);
    expect(badges.get("a")).toBe("cheapest");
    expect(badges.get("b")).toBeUndefined();
  });

  it("gives one quote at most one badge", () => {
    // Cheapest AND most experienced is one driver being advertised, not a
    // comparison being explained.
    const a = quote({ id: "a", fee: 20000, completed: 90 });
    const b = quote({ id: "b", fee: 30000, completed: 1 });
    const badges = quoteBadges([a, b]);
    expect(badges.get("a")).toBe("cheapest");
    expect([...badges.values()].filter((v) => v === "most_experienced")).toHaveLength(0);
  });

  it("only calls someone most experienced when the gap is real", () => {
    const cheap = quote({ id: "a", fee: 20000, completed: 3 });
    const near = quote({ id: "b", fee: 30000, completed: 4 });
    expect(quoteBadges([cheap, near]).get("b")).toBeUndefined();

    const far = quote({ id: "c", fee: 30000, completed: 40 });
    expect(quoteBadges([cheap, far]).get("c")).toBe("most_experienced");
  });
});

describe("what the customer actually hands over", () => {
  it("is just the fee on a collection", () => {
    const out = payAtDoor({ fee: 25000, kind: "package", spendCap: null });
    expect(out.lines).toHaveLength(1);
    expect(out.total).toBe("Rs 250");
    expect(out.note).toBeNull();
  });

  it("never shows a shopping fee without the money being repaid", () => {
    // The failure this prevents: someone reads "Rs 250", brings Rs 300, and the
    // driver has laid out Rs 1,500 of their own money on gas bottles.
    const out = payAtDoor({ fee: 25000, kind: "shop_and_deliver", spendCap: 150000 });
    expect(out.lines).toHaveLength(2);
    expect(out.total).toBe("up to Rs 1750");
    expect(out.note).toMatch(/receipt decides/i);
  });

  it("falls back to the fee alone when a shopping run has no cap", () => {
    const out = payAtDoor({ fee: 25000, kind: "shop_and_deliver", spendCap: null });
    expect(out.lines).toHaveLength(1);
  });

  it("writes whole rupees without empty cents", () => {
    expect(formatFee(25000)).toBe("Rs 250");
    expect(formatFee(25050)).toBe("Rs 250.50");
  });
});

describe("how long is left", () => {
  it("counts down in the largest useful unit", () => {
    expect(expiresIn("2026-08-26T10:20:00Z", NOW)).toBe("in 20 minutes");
    expect(expiresIn("2026-08-26T13:00:00Z", NOW)).toBe("in 3 hours");
    expect(expiresIn("2026-08-28T10:00:00Z", NOW)).toBe("in 2 days");
  });

  it("uses the singular where it belongs", () => {
    expect(expiresIn("2026-08-26T11:00:00Z", NOW)).toBe("in 1 hour");
    expect(expiresIn("2026-08-27T10:00:00Z", NOW)).toBe("in 1 day");
  });

  it("never counts down past zero", () => {
    expect(expiresIn("2026-08-26T09:59:00Z", NOW)).toBeNull();
    expect(expiresIn(null, NOW)).toBeNull();
    expect(expiresIn(undefined, NOW)).toBeNull();
  });

  it("rounds a nearly-gone window up to a minute rather than to nothing", () => {
    // "in 0 minutes" is worse than useless — it reads as broken.
    expect(expiresIn("2026-08-26T10:00:30Z", NOW)).toBe("in 1 minute");
  });
});

describe("the reference a person writes down", () => {
  const ID = "3f9a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b";

  it("is short, sayable, and matches what the driver and owner see", () => {
    // The boards build it as 'RR-' || upper(left(id::text, 6)). If these two
    // ever disagree, a customer reads out a code nobody can find.
    expect(requestRef(ID)).toBe("RR-3F9A2B");
  });

  it("survives however badly somebody writes it down", () => {
    for (const typed of [
      "RR-3F9A2B", "rr-3f9a2b", "3F9A2B", "3f9a2b",
      "RR 3F9A2B", "rr3f9a2b", "  RR-3f9a2b  ",
    ]) {
      expect(normaliseRef(typed), typed).toBe("3F9A2B");
    }
  });

  it("refuses anything that is not six hex characters", () => {
    // Said before a request is spent, so the form can explain rather than
    // returning a bare "we couldn't find that".
    for (const bad of ["", "RR-", "12345", "1234567", "ZZZZZZ", "RR-3F9A2G", "hello"]) {
      expect(normaliseRef(bad), bad).toBeNull();
    }
  });

  it("round-trips its own output", () => {
    expect(normaliseRef(requestRef(ID))).toBe("3F9A2B");
  });
});
