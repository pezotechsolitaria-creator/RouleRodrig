import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: vi.fn(), hasServiceRole: () => false }));
vi.mock("./server", () => ({ bookingPath: (k: string) => `/booking/token-for-${k}` }));

const { contactMatches, reservationReference } = await import("./resume-lookup");

// ── Finding a reservation again from what a guest can say (6 Oct 2026) ─────

const row = { customer_email: "Guest@Example.com", customer_phone: "+230 5123 4567" };

describe("contactMatches", () => {
  it("takes the booking email, in any case, and nothing like it", () => {
    expect(contactMatches(row, "guest@example.com")).toBe(true);
    expect(contactMatches(row, " GUEST@EXAMPLE.COM ")).toBe(true);
    expect(contactMatches(row, "guest@example.co")).toBe(false);
    // Never a pattern (rr-ilike-email-is-a-pattern).
    expect(contactMatches(row, "%@example.com")).toBe(false);
    expect(contactMatches(row, "g_est@example.com")).toBe(false);
  });

  it("takes the phone however it is written", () => {
    for (const typed of ["51234567", "5123 4567", "+230 5123 4567", "0023051234567", "(230) 5123-4567"]) {
      expect(contactMatches(row, typed), typed).toBe(true);
    }
    expect(contactMatches(row, "5123 4568")).toBe(false);
  });

  it("refuses a fragment too short to prove anything", () => {
    expect(contactMatches(row, "4567")).toBe(false);
    expect(contactMatches(row, "")).toBe(false);
  });

  it("never matches an email the reservation does not have", () => {
    expect(contactMatches({ customer_email: null, customer_phone: "+23051234567" }, "a@b.co")).toBe(false);
  });
});

describe("reservationReference", () => {
  it("knows the 5-character reservation shape, as a guest types it", () => {
    expect(reservationReference("rr-h01bk")).toBe("RR-H01BK");
    expect(reservationReference("RR HO1BK")).toBe("RR-H01BK");
  });

  it("leaves rental and order references to their own lookups", () => {
    expect(reservationReference("RR-A1B2C3")).toBeNull();
    expect(reservationReference("RR260811-D9220F")).toBeNull();
  });
});
