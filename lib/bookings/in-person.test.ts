import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  bookingTotalRupees, amountPaidRupees, balanceRupees, cashToCollect, cashOverdue, rupees,
} from "./in-person";

// Figures from the live rows on 29 Sept 2026: RR-87E663 is a Rs 5,997 car
// rental confirmed by hand with nothing paid; its reminders said "Balance at
// pickup Rs 2,998" because they subtracted a deposit nobody paid.

describe("what a booking costs and what is left", () => {
  it("a vehicle's total is total_amount", () => {
    expect(bookingTotalRupees("vehicle", { total_amount: 5997, deposit_amount: 2999 })).toBe(5997);
  });

  it("a place booking's deposit_amount IS its whole price (M210)", () => {
    expect(bookingTotalRupees("place", { deposit_amount: 1000 })).toBe(1000);
  });

  it("nothing paid → the whole amount is owed, not total minus an unpaid deposit", () => {
    expect(balanceRupees("vehicle", { total_amount: 5997, deposit_amount: 2999, amount_paid: null })).toBe(5997);
  });

  it("part paid → the rest", () => {
    expect(balanceRupees("vehicle", { total_amount: 5997, amount_paid: 1000 })).toBe(4997);
  });

  it("never negative, and unknown when there is no figure", () => {
    expect(balanceRupees("vehicle", { total_amount: 100, amount_paid: 500 })).toBe(0);
    expect(balanceRupees("vehicle", { total_amount: null })).toBeNull();
    expect(amountPaidRupees({ amount_paid: -5 })).toBe(0);
  });
});

describe("cash to collect", () => {
  const car = { status: "confirmed", pay_in_person: true, total_amount: 5997, start_date: "2026-11-14" };

  it("only for a booking confirmed as paid in person", () => {
    expect(cashToCollect("vehicle", car)).toBe(5997);
    expect(cashToCollect("vehicle", { ...car, pay_in_person: false })).toBeNull();
    expect(cashToCollect("vehicle", { ...car, status: "pending" })).toBeNull();
    expect(cashToCollect("vehicle", { ...car, status: "cancelled" })).toBeNull();
  });

  it("shrinks as money is recorded, down to nothing", () => {
    expect(cashToCollect("vehicle", { ...car, amount_paid: 5000 })).toBe(997);
    expect(cashToCollect("vehicle", { ...car, amount_paid: 5997 })).toBe(0);
  });

  it("is overdue once the pickup day has come with the money unrecorded", () => {
    expect(cashOverdue("vehicle", car, "2026-11-13")).toBe(false);
    expect(cashOverdue("vehicle", car, "2026-11-14")).toBe(true);
    expect(cashOverdue("vehicle", { ...car, amount_paid: 5997 }, "2026-11-20")).toBe(false);
  });
});

describe("money format", () => {
  it("whole rupees with a thousands separator", () => {
    expect(rupees(5997)).toBe("Rs 5,997");
    expect(rupees(14252)).toBe("Rs 14,252");
  });
});

describe("the migration keeps promise and money apart", () => {
  const sql = readFileSync("supabase/migrations/20260928213059_m220_a_booking_paid_in_person.sql", "utf8")
    .replace(/\r\n/g, "\n");
  const confirm = sql.slice(
    sql.indexOf("create or replace function public.admin_confirm_in_person"),
    sql.indexOf("create or replace function public.admin_record_booking_payment"),
  );

  it("confirming in person never writes money — unless cash is taken at that moment", () => {
    const beforeCash = confirm.slice(0, confirm.indexOf("if v_now > 0 then"));
    expect(beforeCash).not.toMatch(/amount_paid\s*=|deposit_paid_at\s*=\s*coalesce/);
  });

  it("the ledger is admin-only", () => {
    expect(sql).toContain("alter table public.booking_payments enable row level security;");
    expect(sql).toContain("revoke all on table public.booking_payments from public, anon, authenticated;");
    expect(sql).not.toMatch(/grant [^;]*on (table )?public\.booking_payments/i);
  });

  it("an overpayment is refused", () => {
    expect(sql).toContain("That is more than is owed");
  });

  it("a no-show is a cancellation with a mark, not a new status", () => {
    expect(sql).toContain("update bookings set status = 'cancelled', no_show_at = now()");
  });
});
