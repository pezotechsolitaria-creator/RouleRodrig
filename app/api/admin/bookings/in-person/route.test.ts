import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

// M220 — the owner accepts a booking the customer pays in person. These pins
// hold the guarantees the route adds on top of the database functions.

const src = readFileSync("app/api/admin/bookings/in-person/route.ts", "utf8");

// ── A fake privileged client, for driving the real handlers ────────────────
// Records the order things happen in: "the ledger before the receipt" is an
// ordering guarantee, and only a run can prove an order.
const calls: string[] = [];
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const rows: Record<string, unknown> = {};
let rpcReply: { data: unknown; error: unknown } = { data: null, error: null };

function chain(table: string) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "order", "limit", "in"]) c[m] = () => c;
  c.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
  c.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return c;
}

const fakeAdmin = {
  from: (t: string) => chain(t),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.push(`rpc:${fn}`);
    rpcCalls.push({ fn, args });
    return rpcReply;
  },
};

vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "admin" }));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => fakeAdmin }));
vi.mock("@/lib/availability", () => ({ isVehicleFree: async () => true }));
vi.mock("@/lib/admin/audit", () => ({
  audit: async (_admin: unknown, e: { action: string }) => {
    calls.push(`audit:${e.action}`);
  },
}));
vi.mock("@/lib/bookings/in-person-notify", () => ({
  sendInPersonConfirmation: async () => ({ emailed: true, hasEmail: true }),
  sendInPersonPaymentReceipt: async () => {
    calls.push("receipt:recorded");
    return { emailed: true, hasEmail: true };
  },
}));
vi.mock("@/lib/notifications/booking-status", () => ({ notifyBookingStatus: async () => {} }));
vi.mock("@/lib/receipts/payment-receipt", () => ({
  sendPaymentReceipt: async (_s: unknown, kind: string, _id: string, method: string) => {
    calls.push(`receipt:${kind}:${method}`);
    return true;
  },
}));
vi.mock("@/lib/email", () => ({
  sendPlaceAvailabilityConfirmed: async () => true,
  sendPlaceUnavailable: async () => true,
}));

const ID = "11111111-1111-4111-8111-111111111111";
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
  rpcReply = { data: { paymentId: "p1", paid: 1288, balance: 3864, total: 5152 }, error: null };
});

describe("the in-person booking route", () => {
  it("is admin-only, like every /api/admin route", () => {
    expect(src).toMatch(/if \(!isAuthed\(req\)\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\);/);
  });

  it("checks the vehicle is free before confirming — the pill never did", () => {
    const confirm = src.slice(src.indexOf('if (action === "confirm")'), src.indexOf('admin.rpc("admin_confirm_in_person"'));
    expect(confirm).toContain("isVehicleFree(r.scooter, r.start_date, r.end_date, id)");
    expect(confirm).toContain('code: "CLASH"');
    // …and the owner can override for a known duplicate, deliberately.
    expect(confirm).toContain('kind === "vehicle" && !force');
  });

  it("the database decides; the route never writes money columns itself", () => {
    expect(src).toContain('admin.rpc("admin_confirm_in_person"');
    expect(src).toContain('admin.rpc("admin_record_booking_payment"');
    expect(src).toContain('admin.rpc("admin_mark_no_show"');
    expect(src).not.toMatch(/\.update\(\s*\{[^}]*(amount_paid|deposit_paid_at|pay_in_person)/);
  });

  it("a repeat confirm emails nobody twice", () => {
    expect(src).toContain("if (result.already) return NextResponse.json({ ok: true, result, emailed: false, repeat: true });");
  });

  it("every action leaves an audit row", () => {
    expect(src).toContain("action: `${entityType}.confirm_in_person`");
    expect(src).toContain("action: `${entityType}.payment`");
    expect(src).toContain("action: `${entityType}.no_show`");
  });

  it("a no-show sends no email — nothing is refunded", () => {
    const noShow = src.slice(src.indexOf('admin.rpc("admin_mark_no_show"'));
    expect(noShow).not.toMatch(/sendInPerson|sendEmail|notify/);
  });

  it("amounts are whole rupees, validated", () => {
    expect(src).toContain("amountRupees: z.number().int().positive()");
  });
});

describe("the old pills can no longer call cash a bank transfer", () => {
  it("rentals", () => {
    const r = readFileSync("app/api/admin/bookings/route.ts", "utf8");
    expect(r).toContain("if (body.status === 'confirmed' && !(before as { pay_in_person?: boolean }).pay_in_person)");
    expect(r).toContain("VEHICLE_STATUSES.has(body.status)");
  });

  it("stays and activities", () => {
    const r = readFileSync("app/api/admin/place-bookings/route.ts", "utf8");
    expect(r).toContain("current.status !== 'confirmed' && !current.pay_in_person");
  });
});

// ── M222: cash has a date, and the receipt is the owner's choice ────────────

describe("POST payment — the day it changed hands", () => {
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import("./route");
    return POST(json("http://localhost/api/admin/bookings/in-person", "POST", { kind: "vehicle", id: ID, action: "payment", amountRupees: 1288, ...body }));
  };

  it("sends a past island day to the RPC as noon on Rodrigues", async () => {
    const res = await post({ receivedOn: "2026-09-08" });
    expect(res.status).toBe(200);
    expect(rpcCalls[0].args.p_received_at).toBe("2026-09-08T08:00:00.000Z");
    expect(calls).toContain("receipt:recorded");
  });

  it("leaves the date to the RPC (now) when none is given", async () => {
    await post({});
    expect(rpcCalls[0].args).toHaveProperty("p_received_at", null);
  });

  it("refuses a future day before touching the ledger", async () => {
    const res = await post({ receivedOn: "2999-01-01" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("The payment date cannot be in the future.");
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses a day that does not exist", async () => {
    const res = await post({ receivedOn: "2026-02-30" });
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("emails no receipt when told not to — and says it was a choice, not a missing address", async () => {
    const res = await post({ receivedOn: "2026-08-15", notify: false });
    const body = (await res.json()) as { emailed: boolean; receiptSkipped?: boolean };
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ emailed: false, receiptSkipped: true });
    expect(calls).not.toContain("receipt:recorded");
    // Still audited: the money is in the ledger either way.
    expect(calls).toContain("audit:booking.payment");
  });
});

// ── The old "Confirmed" pill writes the transfer it announces ────────────────

describe("PATCH confirmed — the transfer goes into the ledger, then the receipt", () => {
  const patchRental = async (before: Record<string, unknown>) => {
    rows.bookings = { email: "a@b.c", status: "pending", pay_in_person: false, deposit_amount: 1288, deposit_paid_at: null, ...before };
    const { PATCH } = await import("../route");
    return PATCH(json("http://localhost/api/admin/bookings", "PATCH", { id: ID, status: "confirmed" }));
  };

  const patchPlace = async (current: Record<string, unknown>) => {
    rows.place_bookings = { id: ID, name: "A", email: "a@b.c", place_name: "Boat trip", status: "pending", pay_in_person: false, deposit_amount: 2400, deposit_paid_at: null, ...current };
    const { PATCH } = await import("../../place-bookings/route");
    return PATCH(json("http://localhost/api/admin/place-bookings", "PATCH", { id: ID, status: "confirmed" }));
  };

  it("rentals: records the deposit as a bank transfer BEFORE the receipt, and audits it", async () => {
    const res = await patchRental({});
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      {
        fn: "admin_record_booking_payment",
        args: { p_kind: "vehicle", p_id: ID, p_amount_rupees: 1288, p_method: "bank_transfer", p_note: "Recorded when confirmed from the desk" },
      },
    ]);
    expect(calls.indexOf("rpc:admin_record_booking_payment")).toBeLessThan(calls.indexOf("receipt:vehicle:Bank transfer"));
    expect(calls).toContain("audit:booking.payment");
    // One receipt, never two.
    expect(calls.filter((c) => c.startsWith("receipt:"))).toEqual(["receipt:vehicle:Bank transfer"]);
  });

  it("rentals: records nothing when money is already recorded, it is paid in person, there is no deposit, or it was completed", async () => {
    for (const before of [
      { deposit_paid_at: "2026-09-01T10:00:00Z" },
      { pay_in_person: true },
      { deposit_amount: null },
      { deposit_amount: 0 },
      { status: "completed" },
    ]) {
      rpcCalls.length = 0;
      await patchRental(before);
      expect(rpcCalls, JSON.stringify(before)).toHaveLength(0);
    }
  });

  it("rentals: a refused record is logged, never a failed status change", async () => {
    rpcReply = { data: null, error: { code: "RR005", message: "That is more than is owed (Rs 0 left to pay)." } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await patchRental({});
    expect(res.status).toBe(200);
    expect(err).toHaveBeenCalled();
    expect(calls).not.toContain("audit:booking.payment");
    // The receipt still goes: the pill still means the transfer arrived.
    expect(calls).toContain("receipt:vehicle:Bank transfer");
    err.mockRestore();
  });

  it("places: records the whole price (deposit_amount, M210) before the receipt", async () => {
    const res = await patchPlace({});
    expect(res.status).toBe(200);
    expect(rpcCalls[0]).toEqual({
      fn: "admin_record_booking_payment",
      args: { p_kind: "place", p_id: ID, p_amount_rupees: 2400, p_method: "bank_transfer", p_note: "Recorded when confirmed from the desk" },
    });
    expect(calls.indexOf("rpc:admin_record_booking_payment")).toBeLessThan(calls.indexOf("receipt:place:Bank transfer"));
    expect(calls).toContain("audit:place_booking.payment");
  });

  it("places: records nothing for a booking paid in person or one already paid", async () => {
    await patchPlace({ pay_in_person: true });
    await patchPlace({ deposit_paid_at: "2026-09-01T10:00:00Z" });
    expect(rpcCalls).toHaveLength(0);
  });
});
