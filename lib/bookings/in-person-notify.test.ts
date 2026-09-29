import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── THE ROUTE'S TWO CALLS, AGAINST ROWS SHAPED LIKE THE LIVE ONES (M220) ────
//
// app/api/admin/bookings/in-person/route.ts calls these after the database
// has committed and reports `emailed` / `hasEmail` to the desk, which says
// "phone them" when there is no address. So what matters here is: the right
// row is read, a booking that is not confirmed-in-person is never told to
// bring cash, and a ledger row is receipted against its OWN booking only.

type Captured = { type: string; to: string; subject: string; html: string; idempotencyKey?: string | null };
const sent: Captured[] = [];
const pushes: { title: string; body: string }[] = [];

vi.mock("@/lib/email/send", () => ({
  sendTransactionalEmail: async (input: Captured) => {
    sent.push(input);
    return { ok: true };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => {
    throw new Error("no database in tests");
  },
  hasServiceRole: () => false,
}));
vi.mock("@/lib/vehicle-name", () => ({
  vehicleName: async (id: string) => (id === "swift" ? "Suzuki Swift" : id),
  vehicleCategory: async (id: string) => (id === "swift" ? "car" : "scooter"),
  withVehicleName: async <T extends { scooter: string }>(b: T) => ({
    ...b,
    scooter: b.scooter === "swift" ? "Suzuki Swift" : b.scooter,
  }),
}));
vi.mock("@/lib/push/send", () => ({
  pushToCustomer: async (_who: unknown, p: { title: string; body: string }) => {
    pushes.push({ title: p.title, body: p.body });
    return 1;
  },
}));

/** Just enough of supabase-js for `.from().select().eq().maybeSingle()`. */
function fakeAdmin(tables: Record<string, Record<string, unknown>[]>): SupabaseClient {
  return {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filters.push([col, val]);
          return q;
        },
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
          error: null,
        }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const VID = "329d8100-aaaa-4bbb-8ccc-dddddddddddd";
const PID = "c0c05100-aaaa-4bbb-8ccc-eeeeeeeeeeee";

const rental = (extra: Record<string, unknown> = {}) => ({
  id: VID,
  name: "Marie Perrine",
  email: "marie@example.com",
  phone: "+230 5123 4567",
  scooter: "swift",
  start_date: "2026-10-01",
  end_date: "2026-10-05",
  days: 4,
  pickup_time: "09:00",
  total_amount: 5152,
  delivery_fee: 0,
  deposit_amount: 1288,
  deposit_pct: 25,
  amount_paid: null,
  status: "confirmed",
  pay_in_person: true,
  ...extra,
});

const reservation = (extra: Record<string, unknown> = {}) => ({
  id: PID,
  name: "Sandrine Baltz",
  email: "sandrine@example.com",
  phone: null,
  place_name: "Îles aux Cocos boat trip",
  category: "boat",
  start_date: "2026-10-02",
  end_date: "2026-10-02",
  time_slot: "09:00",
  guests: 2,
  quantity: 2,
  deposit_amount: 3600,
  amount_paid: null,
  status: "confirmed",
  pay_in_person: true,
  ...extra,
});

beforeEach(() => {
  sent.length = 0;
  pushes.length = 0;
  // The rentals pick up on 1 Oct 2026. From that day a receipt says "Still to
  // pay (cash)" instead of "at pickup" (M220 review), so "today" is pinned
  // before it rather than left to the calendar. Only Date is faked.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-29T08:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sendInPersonConfirmation", () => {
  it("emails and pushes a rental confirmed as paid in person", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    const out = await sendInPersonConfirmation(fakeAdmin({ bookings: [rental()] }), "vehicle", VID);
    expect(out).toEqual({ emailed: true, hasEmail: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("Rs 5,152 in cash");
    expect(sent[0].idempotencyKey).toBe(`booking_confirmed_in_person:${VID}`);
    expect(pushes).toEqual([
      {
        title: "Confirmed — pay in cash at pickup",
        body: "RR-329D81 is confirmed. Pay Rs 5,152 in cash at pickup — nothing to pay online.",
      },
    ]);
  });

  it("the amount is what is still owed after cash taken at confirmation", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    await sendInPersonConfirmation(fakeAdmin({ bookings: [rental({ amount_paid: 2000 })] }), "vehicle", VID);
    expect(sent[0].html).toContain("Rs 3,152 in cash");
    expect(pushes[0].body).toContain("Rs 3,152");
  });

  it("says 'phone them' when there is no address", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    const out = await sendInPersonConfirmation(fakeAdmin({ bookings: [rental({ email: null })] }), "vehicle", VID);
    expect(out).toEqual({ emailed: false, hasEmail: false });
    expect(sent).toHaveLength(0);
  });

  it("never tells a booking that is not confirmed-in-person to bring cash", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    for (const extra of [{ pay_in_person: false }, { status: "cancelled" }, { status: "pending" }]) {
      const out = await sendInPersonConfirmation(fakeAdmin({ bookings: [rental(extra)] }), "vehicle", VID);
      expect(out.emailed).toBe(false);
    }
    expect(sent).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  it("confirms a reservation, paid on arrival", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    const out = await sendInPersonConfirmation(fakeAdmin({ place_bookings: [reservation()] }), "place", PID);
    expect(out).toEqual({ emailed: true, hasEmail: true });
    expect(sent[0].html).toContain("Rs 3,600 on arrival (cash)");
    expect(pushes[0].title).toBe("Confirmed — pay on arrival");
  });

  it("a missing row sends nothing", async () => {
    const { sendInPersonConfirmation } = await import("./in-person-notify");
    expect(await sendInPersonConfirmation(fakeAdmin({}), "vehicle", VID)).toEqual({ emailed: false, hasEmail: false });
  });
});

describe("sendInPersonPaymentReceipt", () => {
  const ledger = (extra: Record<string, unknown> = {}) => ({
    id: "pay-1",
    booking_kind: "vehicle",
    booking_id: VID,
    amount_rupees: 2000,
    method: "cash",
    // 01:30 on Rodrigues, 29 Sept = 21:30 UTC on the 28th: the receipt must
    // say the island's day.
    received_at: "2026-09-28T21:30:00Z",
    ...extra,
  });

  it("receipts THIS payment with its method, day and the balance after every payment", async () => {
    const { sendInPersonPaymentReceipt } = await import("./in-person-notify");
    const admin = fakeAdmin({
      booking_payments: [ledger()],
      bookings: [rental({ amount_paid: 2000 })],
    });
    const out = await sendInPersonPaymentReceipt(admin, "vehicle", VID, "pay-1");
    expect(out).toEqual({ emailed: true, hasEmail: true });
    const m = sent[0];
    expect(m.idempotencyKey).toBe("payment_receipt:pay-1");
    expect(m.html).toContain("Rs 2,000</strong> in cash on 29 September 2026");
    expect(m.html).toContain("Still to pay: <strong>Rs 3,152</strong>, in cash at pickup");
    expect(m.html).toContain(">Cash<");
  });

  it("uses the owner's label for every method", async () => {
    const { sendInPersonPaymentReceipt } = await import("./in-person-notify");
    const admin = fakeAdmin({
      booking_payments: [ledger({ id: "pay-2", method: "mcb_juice", amount_rupees: 3152 })],
      bookings: [rental({ amount_paid: 5152 })],
    });
    await sendInPersonPaymentReceipt(admin, "vehicle", VID, "pay-2");
    expect(sent[0].html).toContain("by MCB Juice");
    expect(sent[0].html).toContain("Paid in full");
  });

  it("refuses a payment that belongs to a different booking", async () => {
    const { sendInPersonPaymentReceipt } = await import("./in-person-notify");
    const admin = fakeAdmin({
      booking_payments: [ledger({ booking_id: "someone-else" })],
      bookings: [rental({ amount_paid: 2000 })],
    });
    expect(await sendInPersonPaymentReceipt(admin, "vehicle", VID, "pay-1")).toEqual({
      emailed: false,
      hasEmail: false,
    });
    expect(sent).toHaveLength(0);
  });

  it("receipts a reservation's cash on arrival", async () => {
    const { sendInPersonPaymentReceipt } = await import("./in-person-notify");
    const admin = fakeAdmin({
      booking_payments: [ledger({ id: "pay-3", booking_kind: "place", booking_id: PID, amount_rupees: 3600 })],
      place_bookings: [reservation({ amount_paid: 3600 })],
    });
    const out = await sendInPersonPaymentReceipt(admin, "place", PID, "pay-3");
    expect(out.emailed).toBe(true);
    expect(sent[0].idempotencyKey).toBe("payment_receipt:pay-3");
    expect(sent[0].html).toContain("Paid in full");
  });
});
