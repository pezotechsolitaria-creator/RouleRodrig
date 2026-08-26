import { describe, it, expect } from "vitest";
import { canStartDelivery, paymentCardState } from "./payment-state";

const PROOF = "2026-08-27T09:00:00Z";

describe("what the card says about the money", () => {
  it("says CASH whenever there is cash owed, whatever the method column holds", () => {
    // The amount is the authority, not the method. A store order has cash to
    // collect and NO payment_method at all, and every delivery created before
    // M155 has a null method with a real balance. Branching on the method first
    // would have silenced the card for both.
    expect(paymentCardState({ collectCash: 30000 })).toBe("cash");
    expect(paymentCardState({ collectCash: 30000, paymentMethod: null })).toBe("cash");
    expect(paymentCardState({ collectCash: 30000, paymentMethod: "cash" })).toBe("cash");
  });

  it("says nothing for a store order that is already settled", () => {
    expect(paymentCardState({ collectCash: 0 })).toBe("none");
    expect(paymentCardState({})).toBe("none");
  });

  it("holds a transfer with no receipt", () => {
    expect(
      paymentCardState({ collectCash: 0, paymentMethod: "bank_transfer", paymentProofAt: null }),
    ).toBe("awaiting");
  });

  it("clears a transfer once the receipt lands", () => {
    expect(
      paymentCardState({ collectCash: 0, paymentMethod: "bank_transfer", paymentProofAt: PROOF }),
    ).toBe("settled");
  });

  it("NEVER asks for cash on a job paid by transfer", () => {
    // The bug M157 fixed, guarded from this side too. driver_dashboard returns
    // collectCash = 0 for a transfer; if that ever regressed, the card would
    // tell a driver to collect a bill the customer had already paid, and the
    // person who loses is the customer.
    expect(
      paymentCardState({ collectCash: 0, paymentMethod: "bank_transfer", paymentProofAt: PROOF }),
    ).not.toBe("cash");
  });
});

describe("the start gate, mirroring advance_delivery()", () => {
  it("holds an assigned transfer job until the receipt arrives", () => {
    expect(
      canStartDelivery({ status: "assigned", paymentMethod: "bank_transfer", paymentProofAt: null }),
    ).toBe(false);
    expect(
      canStartDelivery({ status: "assigned", paymentMethod: "bank_transfer", paymentProofAt: PROOF }),
    ).toBe(true);
  });

  it("never holds a cash job", () => {
    expect(canStartDelivery({ status: "assigned", paymentMethod: "cash" })).toBe(true);
    // And never holds a job from before payment methods existed.
    expect(canStartDelivery({ status: "assigned", paymentMethod: null })).toBe(true);
    expect(canStartDelivery({ status: "assigned" })).toBe(true);
  });

  it("gates ONLY the first transition", () => {
    // Once a driver is under way the receipt has done its job. Holding up a
    // later step would strand a delivery already halfway across the island —
    // and the SQL gates only `assigned` too.
    for (const status of [
      "going_to_pickup",
      "arrived_at_pickup",
      "picked_up",
      "out_for_delivery",
      "arrived",
    ]) {
      expect(
        canStartDelivery({ status, paymentMethod: "bank_transfer", paymentProofAt: null }),
        status,
      ).toBe(true);
    }
  });

  it("agrees with the card: held means awaiting, and awaiting means held", () => {
    // The two functions are read off the same row by the same component, so a
    // disagreement would show "paid" beside a button that will not move.
    const held = { status: "assigned", paymentMethod: "bank_transfer", paymentProofAt: null };
    const ok = { status: "assigned", paymentMethod: "bank_transfer", paymentProofAt: PROOF };
    expect(canStartDelivery(held)).toBe(false);
    expect(paymentCardState(held)).toBe("awaiting");
    expect(canStartDelivery(ok)).toBe(true);
    expect(paymentCardState(ok)).toBe("settled");
  });
});
