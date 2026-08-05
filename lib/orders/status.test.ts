import { describe, expect, it } from "vitest";
import { legalNextStatuses, timelineIndex, isAwaitingPayment, LEGAL_TRANSITIONS, STATUS_LABEL, STATUS_ORDER, type OrderStatus } from "./status";

describe("legalNextStatuses", () => {
  it("returns the forward + cancel options for each actionable status", () => {
    // pending_payment is actionable as of M5 — a cash/manual order needs the
    // merchant to confirm payment received (or reject it) directly from here.
    expect(legalNextStatuses("pending_payment")).toEqual(["paid", "cancelled"]);
    expect(legalNextStatuses("paid")).toEqual(["preparing", "cancelled"]);
    expect(legalNextStatuses("preparing")).toEqual(["ready_for_pickup", "cancelled"]);
    expect(legalNextStatuses("ready_for_pickup")).toEqual(["collected", "cancelled"]);
  });

  it("returns no actions for terminal statuses", () => {
    expect(legalNextStatuses("collected")).toEqual([]);
    expect(legalNextStatuses("cancelled")).toEqual([]);
    expect(legalNextStatuses("refunded")).toEqual([]);
  });

  // Mirrors the RPC's own state machine (update_order_status()) — this table
  // must never allow a skip (e.g. paid -> collected) or the UI would offer a
  // button the server will reject with RR004.
  // Measured with timelineIndex(), not STATUS_ORDER.indexOf(), because
  // awaiting_payment_confirmation is deliberately not its own timeline step —
  // it is a sub-state of "not yet paid" that maps to index 0, so that cash
  // customers are never shown a step only bank-transfer orders can reach.
  it("never allows skipping a step", () => {
    for (const [from, to] of Object.entries(LEGAL_TRANSITIONS)) {
      const fromIndex = timelineIndex(from as OrderStatus);
      for (const target of to ?? []) {
        if (target === "cancelled") continue;
        expect(timelineIndex(target)).toBe(fromIndex + 1);
      }
    }
  });
});

describe("awaiting_payment_confirmation", () => {
  // Regression guard. submit_payment_receipt() nulls auto_release_at, so if
  // this state had no way out an order backed by a wrong or fraudulent receipt
  // would be stuck forever AND hold its stock forever. The merchant must be
  // able to reject, not only confirm.
  it("can be both confirmed and rejected by the merchant", () => {
    expect(legalNextStatuses("awaiting_payment_confirmation")).toEqual(["paid", "cancelled"]);
  });

  it("is a labelled, first-class status", () => {
    expect(STATUS_LABEL.awaiting_payment_confirmation).toBeTruthy();
  });

  // Not a timeline step: only bank-transfer orders pass through it, so showing
  // it would give cash customers a step they can never reach.
  it("shares the pre-payment timeline position rather than adding a step", () => {
    expect(STATUS_ORDER).not.toContain("awaiting_payment_confirmation");
    expect(timelineIndex("awaiting_payment_confirmation")).toBe(timelineIndex("pending_payment"));
  });

  it("counts as still awaiting payment", () => {
    expect(isAwaitingPayment("awaiting_payment_confirmation")).toBe(true);
    expect(isAwaitingPayment("pending_payment")).toBe(true);
    expect(isAwaitingPayment("paid")).toBe(false);
  });
});

describe("timelineIndex", () => {
  it("maps each forward status to its position", () => {
    expect(timelineIndex("pending_payment")).toBe(0);
    expect(timelineIndex("paid")).toBe(1);
    expect(timelineIndex("preparing")).toBe(2);
    expect(timelineIndex("ready_for_pickup")).toBe(3);
    expect(timelineIndex("collected")).toBe(4);
  });

  it("returns -1 for cancelled/refunded so the timeline renders the terminal state instead", () => {
    expect(timelineIndex("cancelled")).toBe(-1);
    expect(timelineIndex("refunded")).toBe(-1);
  });
});
