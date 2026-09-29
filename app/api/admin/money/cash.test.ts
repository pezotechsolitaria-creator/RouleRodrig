import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── THE MONEY DESK'S CASH BOOK (M220) ───────────────────────────────────────
//
// "Has anyone paid?" had one half: transfers waiting to be matched. The owner
// takes most of his money by hand, so the desk now also lists what is still to
// collect from bookings he confirmed as paid in person, and what was recorded
// today. Driven through the real GET with a fake privileged client.
//
// The unit is the thing most worth pinning: this route already shipped one
// 100x bug by packing rupees and cents into one field. The cash rows are WHOLE
// RUPEES in fields that say so, and never pass through rupeesToCents.

const tables: Record<string, unknown[]> = {};
const filters: { table: string; op: string; args: unknown[] }[] = [];

function builder(table: string) {
  const record = (op: string) => (...args: unknown[]) => {
    filters.push({ table, op, args });
    return chain;
  };
  const chain: Record<string, unknown> = {
    select: record("select"),
    eq: record("eq"),
    in: record("in"),
    is: record("is"),
    not: record("not"),
    gte: record("gte"),
    lte: record("lte"),
    order: record("order"),
    limit: record("limit"),
    then: (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
  };
  return chain;
}

const fakeAdmin = { from: (t: string) => builder(t) };

vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "admin" }));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => fakeAdmin }));
vi.mock("@/lib/vehicle-name", () => ({
  vehicleName: async (id: string) => ({ "veh-1788973628068": "Suzuki Swift", burgman: "BURGMAN 125cc" })[id] ?? id,
}));

const { GET } = await import("./route");

const get = () => GET(new NextRequest("http://localhost/api/admin/money"));

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  filters.length = 0;
});

describe("GET /api/admin/money — cash to collect", () => {
  it("lists in-person bookings still owing, overdue first, in whole rupees with the vehicle's name", async () => {
    tables.bookings = [
      // Future pickup, nothing paid.
      { id: "11111111-1111-4111-8111-111111111111", name: "A", scooter: "veh-1788973628068", start_date: "2099-11-14", status: "confirmed", pay_in_person: true, total_amount: 5997, amount_paid: null },
      // Past pickup, nothing recorded: overdue.
      { id: "22222222-2222-4222-8222-222222222222", name: "B", scooter: "burgman", start_date: "2026-08-19", status: "confirmed", pay_in_person: true, total_amount: 14252, amount_paid: 2000 },
      // Paid in full: nothing to collect, not listed.
      { id: "33333333-3333-4333-8333-333333333333", name: "C", scooter: "burgman", start_date: "2026-08-01", status: "completed", pay_in_person: true, total_amount: 3000, amount_paid: 3000 },
    ];
    tables.place_bookings = [
      { id: "44444444-4444-4444-8444-444444444444", name: "D", place_name: "Boat trip", start_date: "2026-09-23", status: "confirmed", pay_in_person: true, deposit_amount: 1000, amount_paid: null },
    ];

    const body = await (await get()).json();
    const cash = body.cash as Record<string, unknown>[];
    expect(cash.map((c) => c.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
      "44444444-4444-4444-8444-444444444444",
      "11111111-1111-4111-8111-111111111111",
    ]);
    expect(cash[0]).toMatchObject({
      kind: "vehicle",
      reference: "RR-222222",
      item: "BURGMAN 125cc",
      totalRupees: 14252,
      paidRupees: 2000,
      toCollectRupees: 12252,
      overdue: true,
      desk: "Bookings",
    });
    // A place booking's deposit_amount is its whole price (M210).
    expect(cash[1]).toMatchObject({ kind: "place", toCollectRupees: 1000, overdue: true, desk: "Stay & Activity Bookings" });
    expect(cash[2]).toMatchObject({ item: "Suzuki Swift", toCollectRupees: 5997, overdue: false });
    // Never cents: no field on a cash row carries the other unit's name.
    for (const c of cash) expect(Object.keys(c).some((k) => /cents/i.test(k))).toBe(false);
  });

  it("asks only for in-person bookings that are on", async () => {
    await get();
    for (const table of ["bookings", "place_bookings"]) {
      const inPerson = filters.find((f) => f.table === table && f.op === "eq" && f.args[0] === "pay_in_person");
      expect(inPerson?.args[1], `${table} is not narrowed to pay_in_person`).toBe(true);
    }
  });
});

describe("GET /api/admin/money — payments recorded today", () => {
  it("adds up today's ledger rows in rupees and counts them", async () => {
    tables.booking_payments = [{ amount_rupees: 2500 }, { amount_rupees: 1000 }];
    const body = await (await get()).json();
    expect(body.paymentsToday).toEqual({ rupees: 3500, count: 2 });
  });

  it("starts the day at island midnight, not UTC midnight", async () => {
    await get();
    const since = filters.find((f) => f.table === "booking_payments" && f.op === "gte");
    expect(since?.args[0]).toBe("received_at");
    // 00:00 in Rodrigues is 20:00 UTC the evening before.
    expect(String(since?.args[1])).toMatch(/T20:00:00\.000Z$/);
  });
});

describe("GET /api/admin/money — transfers", () => {
  it("looks for place-booking declarations on approved bookings too (M127)", async () => {
    await get();
    const statuses = filters.find(
      (f) => f.table === "place_bookings" && f.op === "in" && f.args[0] === "status" && (f.args[1] as string[]).includes("pending"),
    );
    expect(statuses?.args[1]).toEqual(["pending", "approved"]);
  });
});
