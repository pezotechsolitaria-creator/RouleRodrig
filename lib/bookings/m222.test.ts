import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// M222 — two holes the review of M220 found before it shipped.

const sql = readFileSync(
  "supabase/migrations/20260929054739_m222_cash_has_a_date_and_a_declared_transfer_wins.sql",
  "utf8",
).replace(/\r\n/g, "\n");

describe("a declared transfer is checked, never overwritten by 'pays in person'", () => {
  it("confirm-in-person refuses a booking whose customer declared a transfer", () => {
    expect(sql).toMatch(/if v_reported and not v_paid_at then\s+raise exception using errcode = 'RR004'/);
    expect(sql).toContain("The customer says they already sent a transfer.");
  });

  it("reads the declaration for both kinds", () => {
    expect(sql).toContain("b.payment_reported_at is not null, b.deposit_paid_at is not null");
    expect(sql).toContain("p.payment_reported_at is not null, p.deposit_paid_at is not null");
  });
});

describe("cash has the date it changed hands", () => {
  it("the payment takes an optional received-at, never in the future", () => {
    expect(sql).toContain("p_received_at timestamptz default null");
    expect(sql).toContain("The payment date cannot be in the future.");
    expect(sql).toMatch(/insert into booking_payments \([^)]*received_at\)/);
  });

  it("the old signature is dropped first — no second overload (PGRST203)", () => {
    expect(sql).toContain("drop function if exists public.admin_record_booking_payment(text, uuid, integer, text, text);");
    expect(sql).toContain("admin_record_booking_payment has more than one overload");
  });

  it("the first payment's date is the booking's paid-at, not the moment it was typed in", () => {
    expect(sql).toContain("deposit_paid_at = coalesce(deposit_paid_at, v_when)");
  });
});
