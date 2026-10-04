import { describe, expect, it } from "vitest";
import { deskCounts, inFilter, legalActions, paymentSettled, type AdminActionId } from "./admin-actions";
import { canPaymentTransition, canTransition, PAYMENT_STATUSES, RESERVATION_STATUSES, type PaymentStatus, type ReservationStatus } from "./status";

const r = (reservation_status: ReservationStatus, payment_status: PaymentStatus = "unpaid") => ({ reservation_status, payment_status });

describe("the Reservation Center offers only legal moves", () => {
  it("a new request: review, confirm, ask, decline, cancel — never payment", () => {
    expect(legalActions(r("requested")).sort()).toEqual(["cancel", "confirm", "decline", "request_info", "review"].sort());
  });

  it("under review: no second 'start review'", () => {
    expect(legalActions(r("under_review"))).not.toContain("review");
    expect(legalActions(r("under_review"))).toContain("confirm");
  });

  it("confirmed and unpaid: record payment or allow cash, but NOT ready", () => {
    const a = legalActions(r("confirmed", "payment_pending"));
    expect(a).toContain("mark_paid");
    expect(a).toContain("allow_cash");
    expect(a).not.toContain("ready");
    expect(a).not.toContain("confirm");
  });

  it("confirmed and paid: ready becomes possible; cash no longer", () => {
    const a = legalActions(r("confirmed", "paid"));
    expect(a).toContain("ready");
    expect(a).not.toContain("allow_cash");
  });

  it("pays on the day counts as settled for ready", () => {
    expect(legalActions(r("confirmed", "pay_in_person"))).toContain("ready");
  });

  it("closed reservations offer nothing", () => {
    for (const s of ["completed", "declined", "expired", "cancelled"] as ReservationStatus[]) {
      expect(legalActions(r(s, "paid")), s).toEqual([]);
    }
  });

  it("every status move it offers is one the transition map allows", () => {
    const target: Partial<Record<AdminActionId, ReservationStatus>> = {
      review: "under_review",
      confirm: "confirmed",
      request_info: "needs_information",
      decline: "declined",
      cancel: "cancelled",
      ready: "ready",
      start: "in_progress",
      complete: "completed",
    };
    for (const s of RESERVATION_STATUSES) {
      for (const p of PAYMENT_STATUSES) {
        for (const a of legalActions(r(s, p))) {
          const to = target[a];
          // Confirm from "requested" goes through under_review (both legal).
          const via = a === "confirm" && s === "requested" ? "under_review" : s;
          if (to) expect(canTransition(via, to), `${s}/${p} offers ${a}`).toBe(true);
        }
      }
    }
  });

  it("record payment is offered only where the payment map lets money land", () => {
    for (const s of RESERVATION_STATUSES) {
      for (const p of PAYMENT_STATUSES) {
        if (!legalActions(r(s, p)).includes("mark_paid")) continue;
        expect(p === "paid" || canPaymentTransition(p, "paid") || canPaymentTransition(p, "partially_paid"), `${s}/${p}`).toBe(true);
      }
    }
    expect(legalActions(r("confirmed", "unpaid"))).not.toContain("mark_paid");
  });

  it("money is never recorded before a confirm", () => {
    for (const s of ["draft", "requested", "under_review", "needs_information"] as ReservationStatus[]) {
      for (const p of PAYMENT_STATUSES) expect(legalActions(r(s, p))).not.toContain("mark_paid");
    }
  });

  it("settled means paid, on the day, waived or nothing to pay", () => {
    expect(PAYMENT_STATUSES.filter(paymentSettled).sort()).toEqual(["not_required", "paid", "pay_in_person", "waived"]);
  });
});

describe("the desk's filters", () => {
  const today = "2026-10-04";
  const row = (s: ReservationStatus, p: PaymentStatus, date = today, reported: string | null = null) => ({
    reservation_status: s,
    payment_status: p,
    payment_reported_at: reported,
    slot_date: date,
  });

  it("'Guest says paid' is confirmed, still owed, and reported", () => {
    expect(inFilter(row("confirmed", "payment_pending", today, "2026-10-04T08:00:00Z"), "reported", today)).toBe(true);
    expect(inFilter(row("confirmed", "payment_pending"), "reported", today)).toBe(false);
    expect(inFilter(row("confirmed", "paid", today, "2026-10-04T08:00:00Z"), "reported", today)).toBe(false);
  });

  it("an unpaid confirmed hold is not 'upcoming' — it is awaiting payment", () => {
    const x = row("confirmed", "payment_pending", "2026-10-09");
    expect(inFilter(x, "upcoming", today)).toBe(false);
    expect(inFilter(x, "awaiting_payment", today)).toBe(true);
  });

  it("counts every filter in one pass", () => {
    const c = deskCounts(
      [row("requested", "unpaid"), row("under_review", "unpaid"), row("needs_information", "unpaid"), row("declined", "unpaid"), row("ready", "paid")],
      today,
    );
    expect(c.new).toBe(2);
    expect(c.needs_info).toBe(1);
    expect(c.closed).toBe(1);
    expect(c.today).toBe(1);
    expect(c.all).toBe(5);
  });
});
