import { describe, it, expect } from "vitest";
import {
  canStartDelivery,
  paymentCardState,
  waitingOn,
} from "./payment-state";

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

  it("never holds a job from before payment methods existed", () => {
    // This test used to read "never holds a cash job", and M158 deliberately
    // changed that: a cash job now waits on the customer's ID, exactly as a
    // transfer waits on a receipt. The half that has NOT changed, and must not,
    // is the null-method case — every delivery predating M155 — which was never
    // asked to carry a document and would otherwise be frozen.
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

describe("a cash job waits on the customer's ID (M158)", () => {
  const ID = "2026-08-27T10:00:00Z";

  it("holds an assigned cash job until the ID arrives", () => {
    expect(canStartDelivery({ status: "assigned", paymentMethod: "cash" })).toBe(false);
    expect(
      canStartDelivery({ status: "assigned", paymentMethod: "cash", idDocumentAt: ID }),
    ).toBe(true);
  });

  it("does NOT hold a job from before payment methods existed", () => {
    // Every delivery predating M155 has a null method. Gating those would stop
    // work that was never asked to carry a document.
    expect(canStartDelivery({ status: "assigned", paymentMethod: null })).toBe(true);
    expect(canStartDelivery({ status: "assigned" })).toBe(true);
  });

  it("does not confuse the two documents", () => {
    // A receipt on a cash job is not an ID, and an ID on a transfer is not a
    // receipt. Each method waits on its own.
    expect(
      canStartDelivery({ status: "assigned", paymentMethod: "cash", paymentProofAt: ID }),
    ).toBe(false);
    expect(
      canStartDelivery({ status: "assigned", paymentMethod: "bank_transfer", idDocumentAt: ID }),
    ).toBe(false);
  });

  it("gates only the first transition, like the receipt", () => {
    for (const status of ["going_to_pickup", "picked_up", "out_for_delivery", "arrived"]) {
      expect(canStartDelivery({ status, paymentMethod: "cash" }), status).toBe(true);
    }
  });

  it("names WHICH document is missing, so the card can say so", () => {
    expect(waitingOn({ status: "assigned", paymentMethod: "cash" })).toBe("id");
    expect(waitingOn({ status: "assigned", paymentMethod: "bank_transfer" })).toBe("receipt");
    expect(waitingOn({ status: "assigned", paymentMethod: "cash", idDocumentAt: ID })).toBeNull();
    expect(waitingOn({ status: "picked_up", paymentMethod: "cash" })).toBeNull();
  });

  it("still shows the cash amount while the ID is outstanding", () => {
    // The gate and the card are separate questions: the driver is held, and
    // they still need to know what they will be collecting when they go.
    expect(
      paymentCardState({ collectCash: 25000, paymentMethod: "cash", idDocumentAt: null }),
    ).toBe("cash");
  });
});
