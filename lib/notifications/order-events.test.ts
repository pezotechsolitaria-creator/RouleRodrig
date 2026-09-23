import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSlotRange } from "@/lib/orders/slot";

// ── M216/M217 · WHAT THE CUSTOMER IS TOLD AFTER A BOOKED ORDER MOVES ────────
//
// Chez Banane takes orders a day or two ahead, and since M217 the owner can
// confirm one on the Wednesday for Friday's lunch. "Chez Banane accepted your
// order and is preparing it" is false on that Wednesday, and "no longer on a
// reservation clock" names a hold the customer was never shown. These pin the
// slotted copy, and the engine call the admin route relies on after
// admin_accept_order().

const notify = vi.fn(async (..._args: unknown[]) => ({ inApp: true, emailed: true, pushed: 0, fresh: true }));
vi.mock("./engine", () => ({ notify: (...args: unknown[]) => notify(...args) }));

let orderRow: Record<string, unknown> | null = null;
const client = {
  from: () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: orderRow, error: null }),
    };
    return builder;
  },
  auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
};
vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => true,
  getPrivileged: async () => client,
}));
vi.mock("@/lib/receipts/order-document", () => ({ orderDocumentAttachments: async () => [] }));

const { compose, notifyOrderCustomer } = await import("./order-events");

// Friday 25 September 2026, 12:00–12:30 on Rodrigues (UTC+4).
const RANGE = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';
const WINDOW = parseSlotRange(RANGE)!;
const slot = (fulfillment: string, provider: "cash" | "bank_transfer" = "cash") => ({
  window: WINDOW,
  fulfillment,
  provider,
});

describe("compose — a booked order", () => {
  it("accepted: confirmed FOR the day, never 'preparing it' as if today", () => {
    const c = compose("accepted", "RR260925-AB", "Chez Banane", slot("pickup"));
    expect(c.title).toBe("Chez Banane confirmed order RR260925-AB for Friday 25 September");
    expect(c.body).toContain("Collect on Friday 25 September, 12:00–12:30 at Chez Banane.");
    expect(c.body).toContain("Pay in cash when you collect");
    expect(c.body).not.toMatch(/preparing|reservation clock|today|tomorrow/i);
  });

  it("accepted, Roulé delivery: promises the handover to the driver, not an arrival", () => {
    const c = compose("accepted", "RR1", "Chez Banane", slot("rr_delivery"));
    expect(c.body).toContain("the kitchen hands it to the driver at 12:00–12:30");
    expect(c.body).toContain("Pay in cash when it reaches you");
  });

  it("accepted, bank transfer: no cash sentence", () => {
    const c = compose("accepted", "RR1", "Chez Banane", slot("pickup", "bank_transfer"));
    expect(c.body).not.toMatch(/cash/i);
  });

  it("payment due names the slot, not a lapsing reservation", () => {
    const c = compose("payment_due", "RR1", "Chez Banane", slot("pickup", "bank_transfer"));
    expect(c.title).toBe("Order RR1 for Friday 25 September is waiting for your transfer");
    expect(c.body).toContain("booked for Friday 25 September, 12:00–12:30");
    expect(c.body).not.toMatch(/reserved|reservation/i);
  });

  it("payment confirmed repeats when and where", () => {
    const c = compose("payment_confirmed", "RR1", "Chez Banane", slot("pickup", "bank_transfer"));
    expect(c.body).toContain("Nothing further is owed.");
    expect(c.body).toContain("Collect on Friday 25 September, 12:00–12:30");
  });

  it("expired names the slot it was for, and sends them back to the food", () => {
    const c = compose("expired", "RR1", "Chez Banane", slot("pickup"));
    expect(c.body).toContain("your order for Friday 25 September, 12:00–12:30");
    expect(c.body).not.toMatch(/reservation|released/i);
    expect(c.cta).toBe("See what’s cooking →");
  });

  it("no copy carries an HTML entity", () => {
    for (const e of ["accepted", "payment_due", "payment_confirmed", "expired"] as const) {
      for (const f of ["pickup", "rr_delivery", "customer_delivery"]) {
        expect(JSON.stringify(compose(e, "RR1", "Chez Banane", slot(f)))).not.toMatch(/&[a-z]+;|&#/);
      }
    }
  });

  it("an order with no slot keeps the shop wording", () => {
    const c = compose("accepted", "RR1", "Ti Boutique");
    expect(c.body).toContain("is preparing it");
  });
});

describe("notifyOrderCustomer — the call the admin route makes after admin_accept_order", () => {
  beforeEach(() => {
    notify.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    orderRow = {
      id: "order-1",
      order_number: "RR260925-AB",
      customer_id: "user-1",
      customer_email: "marie@example.com",
      total: 45000,
      store_id: "d522e765-78c3-43da-ab4e-db2b7977acaa",
      pickup_slot: RANGE,
      fulfillment_method: "pickup",
      stores: { name: "Chez Banane" },
      payments: [{ provider: "cash" }],
    };
  });

  it("raises order.accepted with the slot, leads the email details with it", async () => {
    await expect(notifyOrderCustomer("order-1", "accepted")).resolves.toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    const [type, target, ctx, opts] = notify.mock.calls[0] as [
      string,
      { userId: string | null; email: string },
      { when: string | null },
      { email: { title: string; details: [string, string][]; cta: { url: string } }; dedupeKey: string },
    ];
    expect(type).toBe("order.accepted");
    expect(target).toEqual({ userId: "user-1", email: "marie@example.com" });
    expect(ctx.when).toBe("Friday 25 September, 12:00–12:30");
    expect(opts.email.title).toBe("Chez Banane confirmed order RR260925-AB for Friday 25 September");
    expect(opts.email.details[0]).toEqual(["Collection", "Friday 25 September, 12:00–12:30"]);
    expect(opts.email.cta.url).toMatch(/\/orders\/order-1$/);
    // A double tap on the owner's Confirm is deduped by the engine on this key.
    expect(opts.dedupeKey).toBe("marketplace_order_status:order-1:accepted");
  });

  it("an expired booked order sends the customer back to /food, not the shop directory", async () => {
    await notifyOrderCustomer("order-1", "expired");
    const opts = notify.mock.calls[0][3] as { email: { cta: { url: string } } };
    expect(opts.email.cta.url).toMatch(/\/food$/);
  });

  it("an order with no slot carries no `when` and no slot row", async () => {
    orderRow = { ...orderRow!, pickup_slot: null };
    await notifyOrderCustomer("order-1", "accepted");
    const [, , ctx, opts] = notify.mock.calls[0] as [
      string,
      unknown,
      { when: string | null },
      { email: { details: [string, string][] } },
    ];
    expect(ctx.when).toBeNull();
    expect(opts.email.details.map((d) => d[0])).toEqual(["Total"]);
  });
});
