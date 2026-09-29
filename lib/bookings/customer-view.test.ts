import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  askedToPayInPerson,
  inPersonMoney,
  inPersonTimelineCompleted,
  isNoShow,
  lookupMoneyRow,
  type LookedUpBooking,
} from "./customer-view";
import translations from "../i18n";

// M220 — what /manage-booking says about a booking paid in person. The shapes
// below are what lookup_booking() returns: a vehicle carries `total` and a
// part-payment `deposit`; a place carries `total: null` and its WHOLE price in
// `deposit` (M210). Figures echo the live Rs 5,997 car confirmed by hand.

const car: LookedUpBooking = {
  kind: "vehicle",
  status: "confirmed",
  total: 5997,
  deposit: 2999,
  amountPaid: null,
  depositPaid: false,
  payInPerson: true,
  paymentPreference: null,
  noShow: false,
  start: "2026-11-14",
};

const boat: LookedUpBooking = {
  kind: "place",
  status: "confirmed",
  total: null,
  deposit: 3500,
  amountPaid: null,
  depositPaid: false,
  payInPerson: true,
};

describe("the lookup maps onto the one money row", () => {
  it("a vehicle's total is its total, not its deposit", () => {
    const row = lookupMoneyRow(car);
    expect(row.total_amount).toBe(5997);
    expect(row.deposit_amount).toBe(2999);
  });

  it("a place's price travels as `deposit` and stays there (M210)", () => {
    const row = lookupMoneyRow(boat);
    expect(row.total_amount).toBeUndefined();
    expect(row.deposit_amount).toBe(3500);
  });
});

describe("a booking confirmed as paid in person", () => {
  it("owes the whole price when nothing is recorded — never total minus an unpaid deposit", () => {
    const m = inPersonMoney(car)!;
    expect(m).toEqual({ total: 5997, paid: 0, toPay: 5997, paidInFull: false });
  });

  it("owes the rest after a part payment", () => {
    const m = inPersonMoney({ ...car, amountPaid: 1000, depositPaid: true })!;
    expect(m.toPay).toBe(4997);
    expect(m.paid).toBe(1000);
    expect(m.paidInFull).toBe(false);
  });

  it("is paid in full once the cash is recorded", () => {
    const m = inPersonMoney({ ...car, amountPaid: 5997, depositPaid: true })!;
    expect(m.toPay).toBe(0);
    expect(m.paidInFull).toBe(true);
  });

  it("prices a place booking from its deposit field", () => {
    expect(inPersonMoney(boat)!.toPay).toBe(3500);
  });

  it("is not described at all for an online booking", () => {
    expect(inPersonMoney({ ...car, payInPerson: false })).toBeNull();
    // Older lookups had no payInPerson key.
    expect(inPersonMoney({ ...car, payInPerson: undefined })).toBeNull();
  });

  it("owes nothing once cancelled, and a no-show owes nothing either", () => {
    expect(inPersonMoney({ ...car, status: "cancelled" })).toBeNull();
    expect(inPersonMoney({ ...car, status: "cancelled", noShow: true })).toBeNull();
  });

  it("has no figure to show when the row carries no price", () => {
    const m = inPersonMoney({ ...car, total: null })!;
    expect(m.toPay).toBeNull();
    expect(m.paidInFull).toBe(false);
  });
});

describe("the in-person timeline never ticks a step that did not happen", () => {
  it("stops at 'Pay in person' until the money is recorded in full", () => {
    expect(inPersonTimelineCompleted(inPersonMoney(car)!, "confirmed")).toBe(2);
    expect(inPersonTimelineCompleted(inPersonMoney({ ...car, amountPaid: 1000 })!, "confirmed")).toBe(2);
  });

  it("ticks it once paid, and the last step only once the booking is completed", () => {
    const paid = inPersonMoney({ ...car, amountPaid: 5997 })!;
    expect(inPersonTimelineCompleted(paid, "confirmed")).toBe(3);
    expect(inPersonTimelineCompleted(paid, "completed")).toBe(4);
  });

  it("has four labels with no Deposit step, in all three languages", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      const M = translations[lang].manageBooking;
      for (const labels of [M.timelineInPersonVehicle, M.timelineInPersonPlace]) {
        expect(labels).toHaveLength(4);
        // BookingTimeline keys its steps by label.
        expect(new Set(labels).size).toBe(4);
        expect(labels.join(" ").toLowerCase()).not.toMatch(/deposit|acompte|depo\b/);
      }
    }
  });
});

describe("words for a request the owner has not answered", () => {
  it("only while it is pending and not yet confirmed in person", () => {
    const req: LookedUpBooking = { ...car, status: "pending", payInPerson: false, paymentPreference: "in_person" };
    expect(askedToPayInPerson(req)).toBe(true);
    expect(askedToPayInPerson({ ...req, paymentPreference: "online" })).toBe(false);
    expect(askedToPayInPerson({ ...req, paymentPreference: null })).toBe(false);
    // Approved means the owner chose the online route: its pay buttons stay.
    expect(askedToPayInPerson({ ...req, status: "approved" })).toBe(false);
  });

  it("a no-show is a cancelled booking with the flag, nothing else", () => {
    expect(isNoShow({ ...car, status: "cancelled", noShow: true })).toBe(true);
    expect(isNoShow({ ...car, status: "cancelled", noShow: false })).toBe(false);
    expect(isNoShow({ ...car, status: "confirmed", noShow: true })).toBe(false);
  });
});

describe("/manage-booking uses it", () => {
  const PAGE = readFileSync(join(__dirname, "..", "..", "app", "manage-booking", "page.tsx"), "utf8");

  it("reads the helpers rather than re-deriving the money", () => {
    expect(PAGE).toMatch(/from "@\/lib\/bookings\/customer-view"/);
    expect(PAGE).toContain("inPersonMoney(booking)");
  });

  it("hides the deposit and balance rows for a booking paid in person", () => {
    // …and "Deposit to confirm" for a cash request the owner has not answered.
    expect(PAGE).toContain("booking.deposit != null && booking.deposit > 0 && !isCancelled && !inPerson && !askedInPerson");
    expect(PAGE).toContain("booking.depositPaid && !isCancelled && booking.total != null && !inPerson");
  });

  it("gives a no-show no refund card", () => {
    expect(PAGE).toContain("noShow ? null : booking.depositPaid ? (");
  });
});
