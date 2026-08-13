import { describe, it, expect } from "vitest";
import {
  acceptStep,
  canCancel,
  cancelWarning,
  needsAction,
  awaitingOwner,
  formatMoney,
  deskOrder,
  domainOf,
  statusFor,
  DOMAIN_HOME,
  type DeskOrder,
} from "./order-desk";
import { LEGAL_TRANSITIONS, type OrderStatus } from "@/lib/orders/status";

const base: DeskOrder = {
  id: "o1",
  orderNumber: "RR260812-8EB5E3",
  status: "pending_payment",
  domain: "shop",
  storeName: "Miel de Rodrigues",
  customerName: "Marie Rhianna Aubdool",
  customerPhone: "+230 5827 0562",
  total: 25000,
  currency: "MUR",
  placedAt: "2026-08-12T10:00:00Z",
  items: 2,
};

const at = (o: Partial<DeskOrder>): DeskOrder => ({ ...base, ...o });

describe("acceptStep", () => {
  it("offers the one forward move, never cancel", () => {
    expect(acceptStep(at({ status: "pending_payment" }))?.to).toBe("paid");
    expect(acceptStep(at({ status: "paid" }))?.to).toBe("preparing");
    expect(acceptStep(at({ status: "preparing" }))?.to).toBe("ready_for_pickup");
    expect(acceptStep(at({ status: "ready_for_pickup" }))?.to).toBe("collected");
  });

  it("has nothing left to offer on a finished order", () => {
    expect(acceptStep(at({ status: "collected" }))).toBeNull();
    expect(acceptStep(at({ status: "cancelled" }))).toBeNull();
    expect(acceptStep(at({ status: "refunded" }))).toBeNull();
  });

  it("speaks each domain's own language for the same step", () => {
    expect(acceptStep(at({ status: "paid", domain: "food" }))?.label).toBe("Send to the kitchen");
    expect(acceptStep(at({ status: "paid", domain: "shop" }))?.label).toBe("Start packing");
  });

  // An event has nothing to cook and no counter to collect from. Offering
  // "Send to the kitchen" on a ticket order would be nonsense the database
  // would happily accept.
  it("stops an event order at paid", () => {
    expect(acceptStep(at({ status: "pending_payment", domain: "event" }))?.to).toBe("paid");
    expect(acceptStep(at({ status: "pending_payment", domain: "event" }))?.label).toBe(
      "Confirm payment and send the tickets",
    );
    expect(acceptStep(at({ status: "paid", domain: "event" }))).toBeNull();
  });

  it("moves a bank-transfer order out of awaiting confirmation", () => {
    expect(acceptStep(at({ status: "awaiting_payment_confirmation" }))?.to).toBe("paid");
    expect(acceptStep(at({ status: "awaiting_payment_confirmation" }))?.label).toBe("Confirm payment");
  });

  // The screen must never offer a move the RPC is about to reject.
  it("never proposes a transition the state machine forbids", () => {
    const STATUSES: OrderStatus[] = [
      "pending_payment", "awaiting_payment_confirmation", "paid",
      "preparing", "ready_for_pickup", "collected", "cancelled", "refunded",
    ];
    for (const status of STATUSES) {
      for (const domain of ["food", "shop", "event"] as const) {
        const step = acceptStep(at({ status, domain }));
        if (step) expect(LEGAL_TRANSITIONS[status] ?? []).toContain(step.to);
      }
    }
  });
});

describe("canCancel", () => {
  it("is available on everything still open", () => {
    for (const status of ["pending_payment", "awaiting_payment_confirmation", "paid", "preparing", "ready_for_pickup"] as OrderStatus[]) {
      expect(canCancel(at({ status }))).toBe(true);
    }
  });

  it("is gone once the order is finished", () => {
    expect(canCancel(at({ status: "collected" }))).toBe(false);
    expect(canCancel(at({ status: "cancelled" }))).toBe(false);
  });
});

describe("cancelWarning", () => {
  it("warns that a refund opens when money was taken", () => {
    const w = cancelWarning(at({ status: "paid", total: 25000 }));
    expect(w).toContain("refund");
    expect(w).toContain("Rs 250.00");
  });

  it("says plainly that nothing was paid when nothing was", () => {
    const w = cancelWarning(at({ status: "pending_payment" }));
    expect(w).toContain("Nothing has been paid");
    expect(w).not.toContain("refund of");
  });
});

describe("needsAction / awaitingOwner", () => {
  it("counts every unfinished order as open", () => {
    expect(needsAction(at({ status: "preparing" }))).toBe(true);
    expect(needsAction(at({ status: "collected" }))).toBe(false);
    expect(needsAction(at({ status: "cancelled" }))).toBe(false);
  });

  it("singles out the ones where the owner is the blocker", () => {
    expect(awaitingOwner(at({ status: "pending_payment" }))).toBe(true);
    expect(awaitingOwner(at({ status: "awaiting_payment_confirmation" }))).toBe(true);
    expect(awaitingOwner(at({ status: "preparing" }))).toBe(false);
  });
});

describe("deskOrder", () => {
  it("puts orders waiting on the owner first, then oldest first", () => {
    const rows = [
      at({ id: "done", status: "collected", placedAt: "2026-08-01T00:00:00Z" }),
      at({ id: "cooking", status: "preparing", placedAt: "2026-08-02T00:00:00Z" }),
      at({ id: "new-late", status: "pending_payment", placedAt: "2026-08-12T00:00:00Z" }),
      at({ id: "new-early", status: "pending_payment", placedAt: "2026-08-03T00:00:00Z" }),
    ];
    expect([...rows].sort(deskOrder).map((r) => r.id)).toEqual([
      "new-early", "new-late", "cooking", "done",
    ]);
  });
});

describe("formatMoney", () => {
  it("reads minor units correctly", () => {
    expect(formatMoney(25000)).toBe("Rs 250.00");
    expect(formatMoney(86400)).toBe("Rs 864.00");
    expect(formatMoney(0)).toBe("Rs 0.00");
  });
});

describe("domainOf", () => {
  it("routes each store to its own kind", () => {
    expect(domainOf(true, false)).toBe("food");
    expect(domainOf(false, true)).toBe("event");
    expect(domainOf(false, false)).toBe("shop");
  });

  // A kitchen is never also an event venue, but if the data ever said so, food
  // must win — it is the one with a cooking step to get wrong.
  it("prefers food when a store somehow looks like both", () => {
    expect(domainOf(true, true)).toBe("food");
  });

  it("every domain points at a real admin screen", () => {
    for (const d of ["food", "shop", "event"] as const) {
      expect(DOMAIN_HOME[d]).toMatch(/^\/admin\//);
    }
  });
});

describe("statusFor", () => {
  it("uses the event vocabulary for event orders", () => {
    expect(statusFor(at({ status: "paid", domain: "event" }))).not.toBe(
      statusFor(at({ status: "paid", domain: "shop" })),
    );
  });
});
