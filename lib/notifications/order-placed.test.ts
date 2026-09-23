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
// M99 — the SHOP's own phones, which is a different audience from the platform
// owner's. Defaults to 0 devices, because that is the honest state of every
// shop until somebody turns alerts on, and the function must behave correctly
// there.
const pushToMerchant = vi.fn(async (_storeId?: string, _payload?: unknown) => 0);
// M125. Same default of 0: most stores run no events, and the ticket push must
// resolve to "nobody subscribed" without making the order look unreported.
const pushToOrganizer = vi.fn(async (_storeId?: string, _payload?: unknown) => 0);
vi.mock("@/lib/push/send", () => ({
  pushToAdmins: (p: unknown) => pushToAdmins(p),
  pushToMerchant: (s: string, p: unknown) => pushToMerchant(s, p),
  pushToOrganizer: (s: string, p: unknown) => pushToOrganizer(s, p),
}));
vi.mock("@/lib/supabase/admin", () => ({
  hasServiceRole: () => hasServiceRole(),
  getPrivileged: () => getPrivileged(),
}));
// The owner's ntfy/WhatsApp alert, captured so its TEXT can be read — that
// text is where the booked day and the cook's number go (M216). The real
// formatWhatsAppMessage stays, so the assertions read the actual message.
const enqueueNotification = vi.fn(async (_input?: unknown) => 1);
vi.mock("./queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./queue")>()),
  enqueueNotification: (input: unknown) => enqueueNotification(input),
}));

const { notifyOrderPlaced, claimAndNotifyOrderPlaced, cookCallLine } = await import("./order-placed");

// ── Minimal chainable stand-in for the admin client ─────────────────────────
// Each from() chain resolves to a canned per-table result; every .eq() call is
// recorded so tests can assert WHICH merchant's staff were looked up.
type TableResult = { data: unknown; error: unknown };

function mockAdmin(opts: {
  order?: TableResult;
  store?: TableResult;
  items?: TableResult;
  staff?: TableResult;
  /** A food_kitchens row makes the store a kitchen (M50). */
  kitchen?: TableResult;
  /** food_kitchen_ops — the cook's name and number, service-role only. */
  ops?: TableResult;
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
    ...(opts.kitchen ? { food_kitchens: opts.kitchen } : {}),
    ...(opts.ops ? { food_kitchen_ops: opts.ops } : {}),
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
    // The shop that has to make it is woken too, and about ITS own store.
    expect(pushToMerchant).toHaveBeenCalledTimes(1);
    expect(pushToMerchant.mock.calls[0][0]).toBe("store-1");
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

// ── M216 · A BOOKING AT A KITCHEN THAT NEEDS NOTICE ─────────────────────────
//
// Chez Banane, cash, collected Friday 25 September 12:00–12:30 — placed days
// before. Every message leads with that day, none of them carries the 7-day
// cash hold, and the owner's own alert tells him which cook to phone.

describe("cookCallLine", () => {
  it("names the cook and the number", () => {
    expect(cookCallLine({ cooker_name: "Mr Arnaud", cooker_phone: "57000000" })).toBe("Call Mr Arnaud 57000000");
  });

  it("a number with no name still says who to call", () => {
    expect(cookCallLine({ cooker_name: null, cooker_phone: " 57000000 " })).toBe("Call the cook 57000000");
  });

  it("no number, no line — a name alone is nothing to act on", () => {
    expect(cookCallLine({ cooker_name: "Mr Arnaud", cooker_phone: null })).toBeNull();
    expect(cookCallLine({ cooker_name: "Mr Arnaud", cooker_phone: "  " })).toBeNull();
    expect(cookCallLine(null)).toBeNull();
  });
});

describe("notifyOrderPlaced — a booked kitchen order (M216)", () => {
  const SLOT_RANGE = '["2026-09-25 08:00:00+00","2026-09-25 08:30:00+00")';
  const COOK_PHONE = "57000000";
  const KITCHEN_INPUT: OrderPlacedInput = { ...INPUT, provider: "cash", fulfillment: "pickup" };

  const kitchenAdmin = (over: Parameters<typeof mockAdmin>[0] = {}) =>
    mockAdmin({
      order: {
        data: {
          // Still set on a fresh cash order: the hold exists, it just is not
          // the deadline of a booked one and must not be printed.
          auto_release_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          pickup_slot: SLOT_RANGE,
          fulfillment_method: "pickup",
        },
        error: null,
      },
      store: { data: { merchant_id: "merchant-1", name: "Chez Banane" }, error: null },
      kitchen: { data: { store_id: "store-1" }, error: null },
      ops: { data: { cooker_name: "Mr Arnaud", cooker_phone: COOK_PHONE }, error: null },
      emails: { "staff-1": "a@shop.mu" },
      ...over,
    });

  const ownerAlert = () => {
    expect(enqueueNotification).toHaveBeenCalledTimes(1);
    return enqueueNotification.mock.calls[0][0] as { category: string; message: string };
  };

  beforeEach(() => {
    enqueueNotification.mockClear();
    pushToAdmins.mockClear();
    pushToMerchant.mockClear();
    dispatchNotification.mockResolvedValue(true);
  });

  it("the customer's email leads with when and where, says cash, and never the hold", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin().client);
    await expect(notifyOrderPlaced(KITCHEN_INPUT)).resolves.toBe(true);

    const [c] = customerEvents();
    expect(c.title).toBe("Order RR260807-ABCDE booked for Friday 25 September");
    expect(c.body.startsWith("Collect on Friday 25 September, 12:00–12:30 at Chez Banane.")).toBe(true);
    expect(c.body).toContain("Pay in cash when you collect");
    expect(c.body).not.toMatch(/reserved until/i);
    expect(c.details[0]).toEqual(["Collection", "Friday 25 September, 12:00–12:30"]);
    expect(c.details.map((d: [string, string]) => d[0])).not.toContain("Reserved until");
  });

  it("the kitchen's email leads with the slot and has no 'Accept by <hold>'", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin().client);
    await notifyOrderPlaced(KITCHEN_INPUT);

    const [m] = merchantEvents();
    expect(m.body.startsWith("Booked for Friday 25 September, 12:00–12:30.")).toBe(true);
    expect(m.details[0]).toEqual(["Collection", "Friday 25 September, 12:00–12:30"]);
    expect(m.details.map((d: [string, string]) => d[0])).not.toContain("Accept by");
  });

  it("a delivery says the kitchen hands it to the driver — the slot is the handover", async () => {
    getPrivileged.mockResolvedValue(
      kitchenAdmin({
        order: {
          data: { auto_release_at: null, pickup_slot: SLOT_RANGE, fulfillment_method: "rr_delivery" },
          error: null,
        },
      }).client,
    );
    await notifyOrderPlaced({ ...KITCHEN_INPUT, fulfillment: "rr_delivery" });
    const [c] = customerEvents();
    expect(c.body).toContain("the kitchen hands it to the driver at 12:00–12:30");
    expect(c.details[0]).toEqual(["Handed to driver", "Friday 25 September, 12:00–12:30"]);
  });

  it("the owner's alert: the day on line 2, the cook to call, no hold", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin().client);
    await notifyOrderPlaced(KITCHEN_INPUT);

    const alert = ownerAlert();
    expect(alert.category).toBe("food");
    const lines = alert.message.split("\n").filter(Boolean);
    expect(lines[1]).toBe("For FRI 25 SEP 12:00–12:30");
    expect(lines).toContain(`Call Mr Arnaud ${COOK_PHONE}`);
    expect(alert.message).not.toMatch(/Accept by/);
  });

  it("the phone pushes are prefixed with the day and carry no hold", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin().client);
    await notifyOrderPlaced(KITCHEN_INPUT);

    const adminBody = (pushToAdmins.mock.calls[0][0] as { body: string }).body;
    const merchantBody = (pushToMerchant.mock.calls[0][1] as { body: string }).body;
    expect(adminBody.startsWith("For FRI 25 SEP 12:00–12:30 · ")).toBe(true);
    expect(merchantBody.startsWith("For FRI 25 SEP 12:00–12:30 · ")).toBe(true);
    expect(adminBody).not.toMatch(/Accept by/);
  });

  it("the cook's number reaches the owner's alert and NOTHING else", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin().client);
    await notifyOrderPlaced(KITCHEN_INPUT);

    expect(ownerAlert().message).toContain(COOK_PHONE);
    for (const e of dispatchNotification.mock.calls.map((call) => call[0])) {
      expect(JSON.stringify(e)).not.toContain(COOK_PHONE);
      expect(JSON.stringify(e)).not.toContain("Arnaud");
    }
    for (const call of [...pushToAdmins.mock.calls, ...pushToMerchant.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(COOK_PHONE);
    }
  });

  it("no cook row, or no number, leaves the line out", async () => {
    getPrivileged.mockResolvedValue(kitchenAdmin({ ops: { data: null, error: null } }).client);
    await notifyOrderPlaced(KITCHEN_INPUT);
    expect(ownerAlert().message).not.toMatch(/^Call /m);

    enqueueNotification.mockClear();
    getPrivileged.mockResolvedValue(
      kitchenAdmin({ ops: { data: { cooker_name: "Mr Arnaud", cooker_phone: null }, error: null } }).client,
    );
    await notifyOrderPlaced(KITCHEN_INPUT);
    expect(ownerAlert().message).not.toMatch(/^Call /m);
  });

  it("a shop order never gets a cook line, even if an ops row came back", async () => {
    const { client } = mockAdmin({
      ops: { data: { cooker_name: "Someone", cooker_phone: COOK_PHONE }, error: null },
      emails: { "staff-1": "a@shop.mu" },
    });
    getPrivileged.mockResolvedValue(client);
    await notifyOrderPlaced(INPUT);

    const alert = ownerAlert();
    expect(alert.category).toBe("admin");
    expect(alert.message).not.toContain(COOK_PHONE);
    // An order with no slot keeps its hold, exactly as before M216.
    expect(alert.message).toMatch(/Accept by/);
  });
});
