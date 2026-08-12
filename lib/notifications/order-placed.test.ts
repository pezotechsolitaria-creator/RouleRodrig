import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OrderPlacedInput } from "./order-placed";

const dispatchNotification = vi.fn();
const hasServiceRole = vi.fn();
const getPrivileged = vi.fn();

vi.mock("./dispatch", () => ({ dispatchNotification: (...args: unknown[]) => dispatchNotification(...args) }));
// The owner's new-order alert is PUSH, not WhatsApp. WhatsApp is now reserved
// for "the food is ready" alone — a ping per order buried the one message that
// actually has to interrupt someone, and spent a free hobby service doing it.
const pushToAdmins = vi.fn(async (_payload?: unknown) => 1);
vi.mock("@/lib/push/send", () => ({ pushToAdmins: (p: unknown) => pushToAdmins(p) }));
vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => hasServiceRole(),
  getPrivileged: () => getPrivileged(),
}));

const { notifyOrderPlaced, claimAndNotifyOrderPlaced } = await import("./order-placed");

// ── Minimal chainable stand-in for the admin client ─────────────────────────
// Each from() chain resolves to a canned per-table result; every .eq() call is
// recorded so tests can assert WHICH merchant's staff were looked up.
type TableResult = { data: unknown; error: unknown };

function mockAdmin(opts: {
  order?: TableResult;
  store?: TableResult;
  items?: TableResult;
  staff?: TableResult;
  /** user_id → email (null = account without an address). */
  emails?: Record<string, string | null>;
  getUserById?: (id: string) => Promise<unknown>;
}) {
  const eqCalls: [string, string, unknown][] = [];
  const results: Record<string, TableResult> = {
    // RELATIVE, not a fixed date. This was "2026-08-09T12:00:00Z", which was in
    // the future when written and silently became the past — at which point
    // holdInfo() correctly reported `expired` and customerHoldCopy() returned
    // the "this reservation has lapsed" text instead of the payment
    // instructions the assertions look for. The test was not wrong about the
    // behaviour; it was wrong about the clock. A hold is only ever asserted
    // against "some time from now", so the fixture must say that.
    orders: opts.order ?? {
      data: { auto_release_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString() },
      error: null,
    },
    stores: opts.store ?? { data: { merchant_id: "merchant-1", name: "Ti Boutique" }, error: null },
    order_items:
      opts.items ??
      ({
        data: [
          { product_name: "Local honey", variant_name: "500g", quantity: 2, line_total: 40000 },
          { product_name: "Chili paste", variant_name: null, quantity: 1, line_total: 10000 },
        ],
        error: null,
      } as TableResult),
    merchant_staff: opts.staff ?? { data: [{ user_id: "staff-1" }, { user_id: "staff-2" }], error: null },
  };
  const from = (table: string) => {
    const result = results[table] ?? { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        eqCalls.push([table, col, val]);
        return builder;
      },
      maybeSingle: async () => result,
      then: (onOk: (v: TableResult) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(onOk, onErr),
    };
    return builder;
  };
  const getUserById = vi.fn(
    opts.getUserById ??
      (async (id: string) => ({
        data: { user: opts.emails?.[id] ? { email: opts.emails[id] } : null },
        error: null,
      })),
  );
  return { client: { from, auth: { admin: { getUserById } } }, eqCalls, getUserById };
}

const INPUT: OrderPlacedInput = {
  orderId: "order-1",
  orderNumber: "RR260807-ABCDE",
  storeId: "store-1",
  total: 50000,
  provider: "bank_transfer",
  fulfillment: "pickup",
  customerName: "Marie Payet",
  customerPhone: "+230 5 123 4567",
  customerEmail: "marie@example.com",
};

const merchantEvents = () =>
  dispatchNotification.mock.calls.map((c) => c[0]).filter((e) => e.recipientType === "merchant");
const customerEvents = () =>
  dispatchNotification.mock.calls.map((c) => c[0]).filter((e) => e.recipientType === "customer");

beforeEach(() => {
  dispatchNotification.mockReset();
  hasServiceRole.mockReset().mockReturnValue(true);
  getPrivileged.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyOrderPlaced", () => {
  it("emails EVERY staff member, pings the owner WhatsApp once, and emails the customer", async () => {
    const { client } = mockAdmin({ emails: { "staff-1": "a@shop.mu", "staff-2": "b@shop.mu" } });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(true);

    const staffEmails = merchantEvents().filter((e) => e.channels?.includes("email"));
    expect(staffEmails.map((e) => e.recipientEmail).sort()).toEqual(["a@shop.mu", "b@shop.mu"]);
    for (const e of staffEmails) {
      expect(e.type).toBe("order_created");
      // Order facts a merchant needs to act: items, total, payment,
      // fulfillment, customer, acceptance deadline, dashboard link.
      expect(e.details).toEqual(
        expect.arrayContaining([
          ["2× Local honey (500g)", "Rs 400.00"],
          ["1× Chili paste", "Rs 100.00"],
          ["Total", "Rs 500.00"],
          ["Payment", "Bank transfer"],
          ["Fulfillment", "Pickup from shop"],
          ["Customer", "Marie Payet — +230 5 123 4567"],
        ]),
      );
      expect(e.details.map((d: [string, string]) => d[0])).toContain("Accept by");
      expect(e.cta.url).toContain("/merchant/orders/order-1");
    }

    // Exactly ONE owner alert regardless of staff count — and it is a PUSH.
    expect(pushToAdmins).toHaveBeenCalledTimes(1);
    // A new order must never spend WhatsApp: that channel is reserved for
    // "food is ready", and email is capped at ~400/day platform-wide.
    expect(merchantEvents().filter((e) => e.channels?.includes("whatsapp"))).toHaveLength(0);

    const customer = customerEvents();
    expect(customer).toHaveLength(1);
    expect(customer[0].recipientEmail).toBe("marie@example.com");
    expect(customer[0].body).toContain("upload your proof of payment");
    expect(customer[0].details.map((d: [string, string]) => d[0])).toContain("Reserved until");
    expect(customer[0].cta.url).toContain("/orders/order-1");
  });

  it("fails loudly and returns false when the service-role key is absent — nothing is even attempted", async () => {
    hasServiceRole.mockReturnValue(false);
    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(false);
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(getPrivileged).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"));
  });

  it("one staff member without an address cannot block the others", async () => {
    const { client } = mockAdmin({ emails: { "staff-1": null, "staff-2": "b@shop.mu" } });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(true);
    const staffEmails = merchantEvents().filter((e) => e.channels?.includes("email"));
    expect(staffEmails.map((e) => e.recipientEmail)).toEqual(["b@shop.mu"]);
  });

  it("one crashing address lookup cannot block the others (Promise.allSettled)", async () => {
    const { client } = mockAdmin({
      getUserById: async (id: string) => {
        if (id === "staff-1") throw new Error("auth API hiccup");
        return { data: { user: { email: "b@shop.mu" } }, error: null };
      },
    });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(true);
    const staffEmails = merchantEvents().filter((e) => e.channels?.includes("email"));
    expect(staffEmails.map((e) => e.recipientEmail)).toEqual(["b@shop.mu"]);
  });

  it("returns false when nothing merchant-side delivers (Resend + WhatsApp outage) so the claim is released", async () => {
    const { client } = mockAdmin({ emails: { "staff-1": "a@shop.mu", "staff-2": "b@shop.mu" } });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(false);

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(false);
  });

  it("a customer send failure also returns false — retrying may duplicate a merchant email, which costs nothing", async () => {
    const { client } = mockAdmin({ emails: { "staff-1": "a@shop.mu" } });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockImplementation(async (e: { recipientType: string }) => e.recipientType === "merchant");

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(false);
  });

  it("a customer with no email address is a skip, not a failure — no retry could ever fix it", async () => {
    const { client } = mockAdmin({ emails: { "staff-1": "a@shop.mu" } });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await expect(notifyOrderPlaced({ ...INPUT, customerEmail: null })).resolves.toBe(true);
    expect(customerEvents()).toHaveLength(0);
  });

  it("only ever looks up staff of the merchant that owns the ordered-from store", async () => {
    const { client, eqCalls } = mockAdmin({
      store: { data: { merchant_id: "merchant-OWNER", name: "Ti Boutique" }, error: null },
      emails: { "staff-1": "a@shop.mu", "staff-2": "b@shop.mu" },
    });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await notifyOrderPlaced(INPUT);
    expect(eqCalls).toContainEqual(["merchant_staff", "merchant_id", "merchant-OWNER"]);
    expect(eqCalls).toContainEqual(["stores", "id", "store-1"]);
  });

  it("returns false when the store row cannot be found", async () => {
    const { client } = mockAdmin({ store: { data: null, error: null } });
    getPrivileged.mockResolvedValue(client);

    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(false);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("escapes HTML in customer- and merchant-supplied strings", async () => {
    const { client } = mockAdmin({
      emails: { "staff-1": "a@shop.mu" },
      items: {
        data: [{ product_name: "<b>Honey</b>", variant_name: null, quantity: 1, line_total: 100 }],
        error: null,
      },
    });
    getPrivileged.mockResolvedValue(client);
    dispatchNotification.mockResolvedValue(true);

    await notifyOrderPlaced({ ...INPUT, customerName: "<script>x</script>" });
    const [event] = merchantEvents().filter((e) => e.channels?.includes("email"));
    const flat = JSON.stringify(event.details);
    expect(flat).not.toContain("<script>");
    expect(flat).not.toContain("<b>");
    expect(flat).toContain("&lt;b&gt;Honey&lt;/b&gt;");
  });

  it("never throws, even when the admin client itself explodes", async () => {
    getPrivileged.mockRejectedValue(new Error("network down"));
    await expect(notifyOrderPlaced(INPUT)).resolves.toBe(false);
  });
});

describe("claimAndNotifyOrderPlaced", () => {
  type RpcResult = { data: unknown; error: { message?: string } | null };
  const rpcClient = (impl: (fn: string) => RpcResult) => {
    const rpc = vi.fn(async (fn: string): Promise<RpcResult> => impl(fn));
    return { rpc };
  };

  it("a false claim (idempotent retry / concurrent duplicate) sends nothing and never releases", async () => {
    const client = rpcClient(() => ({ data: false, error: null }));
    await claimAndNotifyOrderPlaced(client, INPUT);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("claim_order_notification", { p_order_id: "order-1" });
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it("a true claim sends, and a successful delivery keeps the claim", async () => {
    const { client: admin } = mockAdmin({ emails: { "staff-1": "a@shop.mu", "staff-2": "b@shop.mu" } });
    getPrivileged.mockResolvedValue(admin);
    dispatchNotification.mockResolvedValue(true);
    const client = rpcClient(() => ({ data: true, error: null }));

    await claimAndNotifyOrderPlaced(client, INPUT);
    expect(dispatchNotification).toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith("release_order_notification", expect.anything());
  });

  it("releases the claim when the send fails wholesale", async () => {
    const { client: admin } = mockAdmin({ emails: { "staff-1": "a@shop.mu" } });
    getPrivileged.mockResolvedValue(admin);
    dispatchNotification.mockResolvedValue(false);
    const client = rpcClient(() => ({ data: true, error: null }));

    await claimAndNotifyOrderPlaced(client, INPUT);
    expect(client.rpc).toHaveBeenCalledWith("release_order_notification", { p_order_id: "order-1" });
  });

  it("releases the claim when the service-role key is missing — the failure stays observable", async () => {
    hasServiceRole.mockReturnValue(false);
    const client = rpcClient(() => ({ data: true, error: null }));

    await claimAndNotifyOrderPlaced(client, INPUT);
    expect(client.rpc).toHaveBeenCalledWith("release_order_notification", { p_order_id: "order-1" });
  });

  it("a claim RPC error is logged and nothing more happens — no send, no release", async () => {
    const client = rpcClient(() => ({ data: null, error: { message: "boom" } }));
    await claimAndNotifyOrderPlaced(client, INPUT);
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("never throws and never releases a claim it did not take, even when the claim call itself explodes", async () => {
    const rpc = vi.fn(async (): Promise<RpcResult> => {
      throw new Error("connection reset");
    });
    await expect(claimAndNotifyOrderPlaced({ rpc }, INPUT)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1); // no release attempt
  });

  it("survives even the release call failing", async () => {
    hasServiceRole.mockReturnValue(false); // forces delivered=false → release path
    const rpc = vi.fn(async (fn: string): Promise<RpcResult> => {
      if (fn === "release_order_notification") return { data: null, error: { message: "boom" } };
      return { data: true, error: null };
    });
    await expect(claimAndNotifyOrderPlaced({ rpc }, INPUT)).resolves.toBeUndefined();
  });
});
