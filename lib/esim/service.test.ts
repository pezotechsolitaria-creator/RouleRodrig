import { beforeEach, describe, expect, it, vi } from "vitest";

// ── The order engine, end to end, against fakes ──────────────────────────────
//
// There is no eSIM Access sandbox and no service-role key on a developer's
// machine (see the rr-local-env memory), so the purchase path cannot be clicked
// through locally. This drives the REAL lib/esim/service.ts against an
// in-memory database, a fake PayPal and a fake wholesaler, and pins the money
// rules: capture first, buy second, never twice, never for the wrong order.

// ── In-memory Supabase (just the query shapes service.ts uses) ───────────────
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const UNIQUE: Record<string, string[]> = { esim_webhook_events: ["event_key"], esim_orders: ["id", "ref"] };

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" = "select";
  let patch: Row = {};
  let insertRow: Row | null = null;
  let returning = false;
  let single = false;
  const rows = () => (tables[table] ??= []);
  const run = () => {
    if (op === "insert") {
      for (const key of UNIQUE[table] ?? []) {
        if (rows().some((r) => r[key] === insertRow![key])) return { data: null, error: { message: `duplicate key value violates unique constraint (${key})` } };
      }
      rows().push({ ...insertRow });
      return { data: null, error: null };
    }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") {
      hit.forEach((r) => Object.assign(r, patch));
      return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }
    if (single) return { data: hit[0] ? { ...hit[0] } : null, error: null };
    return { data: hit.map((r) => ({ ...r })), error: null };
  };
  const b = {
    select: () => ((op === "select" ? null : (returning = true)), b),
    insert: (r: Row) => ((op = "insert"), (insertRow = r), b),
    update: (p: Row) => ((op = "update"), (patch = p), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    order: () => b,
    limit: () => b,
    maybeSingle: () => ((single = true), Promise.resolve(run())),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
const db = { from: (t: string) => query(t) };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => db, hasServiceRole: () => true }));
vi.mock("@/lib/supabase/anon", () => ({ createAnonClient: () => db }));

// ── Fake PayPal ──────────────────────────────────────────────────────────────
const paypal = {
  orders: new Map<string, { referenceId: string; value: string; captured: boolean }>(),
  captureCalls: 0,
  captureAmountOverride: null as string | null,
};
vi.mock("@/lib/paypal", () => ({
  PAYPAL_CURRENCY: "EUR",
  paypalConfigured: () => true,
  createEurOrder: async (o: { referenceId: string; eurValue: string }) => {
    const id = `PP-${paypal.orders.size + 1}`;
    paypal.orders.set(id, { referenceId: o.referenceId, value: o.eurValue, captured: false });
    return { id };
  },
  captureOrder: async (id: string) => {
    paypal.captureCalls++;
    const o = paypal.orders.get(id)!;
    if (o.captured) throw new Error("PayPal capture failed: 422 ORDER_ALREADY_CAPTURED");
    o.captured = true;
    return { status: "COMPLETED", captureId: `CAP-${id}`, amount: paypal.captureAmountOverride ?? o.value, currency: "EUR", referenceId: o.referenceId };
  },
  fetchOrder: async (id: string) => {
    const o = paypal.orders.get(id)!;
    return { status: o.captured ? "COMPLETED" : "APPROVED", captureStatus: o.captured ? "COMPLETED" : null, captureId: `CAP-${id}`, amount: o.value, currency: "EUR", referenceId: o.referenceId };
  },
  refundCapture: async () => ({ id: "RF-1", status: "COMPLETED" }),
}));

// ── Fake email ───────────────────────────────────────────────────────────────
const mail = { delivered: [] as string[], problem: [] as string[], owner: [] as string[] };
vi.mock("@/lib/email", () => ({
  sendEsimDelivered: async (o: { id: string }) => (mail.delivered.push(o.id), true),
  sendEsimOrderProblem: async (o: { id: string }) => (mail.problem.push(o.id), true),
  sendOwnerEsimAlert: async (a: { key: string }) => (mail.owner.push(a.key), true),
}));
vi.mock("./qr", () => ({ qrPngBase64: async () => null }));
vi.mock("./fx", () => ({ eurPerUsd: async () => 0.86 }));

// ── Fake wholesaler ──────────────────────────────────────────────────────────
import { ProviderError } from "./providers/types";
const wholesale = {
  orders: new Map<string, string>(), // transactionId → orderNo
  orderCalls: 0,
  readyAfterQueries: 0,
  queries: 0,
  failOrder: null as ProviderError | null,
  unitMicros: 11_400_000,
};
const fakeProvider = {
  id: "esimaccess",
  configured: () => true,
  listPackages: async () => [],
  getPackage: async (code: string) => (code === "GONE" ? null : { code, wholesaleUsdMicros: wholesale.unitMicros }),
  order: async (req: { transactionId: string }) => {
    wholesale.orderCalls++;
    if (wholesale.failOrder) throw wholesale.failOrder;
    // Idempotent on transactionId, like the real one.
    if (!wholesale.orders.has(req.transactionId)) wholesale.orders.set(req.transactionId, `B${wholesale.orders.size + 1}`);
    return { orderNo: wholesale.orders.get(req.transactionId)! };
  },
  queryOrder: async (orderNo: string) => {
    wholesale.queries++;
    if (wholesale.queries <= wholesale.readyAfterQueries) return null;
    return {
      orderNo,
      profileId: `T-${orderNo}`,
      iccid: "8999000000000000001",
      lpa: `LPA:1$rsp.example.com$CODE${orderNo}`,
      qrCodeUrl: null,
      esimStatus: "GOT_RESOURCE",
      smdpStatus: "RELEASED",
      expiresAt: null,
      totalBytes: 3221225472,
      usedBytes: 0,
      apn: null,
    };
  },
  balanceUsdMicros: async () => 50_000_000,
  cancelProfile: async () => {},
  parseWebhook: (b: unknown) => (b as { __ev?: unknown }).__ev ?? null,
};
vi.mock("./providers", async () => {
  const types = await import("./providers/types");
  return { activeProvider: () => fakeProvider, providerById: () => fakeProvider, ProviderError: types.ProviderError };
});

process.env.ESIM_LINK_SECRET = "test-secret";
process.env.ESIM_CAPTURE_WAIT_MS = "0";
// These tests are the engine of an OPEN store; sales are closed by default
// until the owner is licensed (M229, lib/esim/state.ts).
process.env.ESIM_SALES_OPEN = "true";

const { startCheckout, completePayment, provisionOrder, viewOrder, lookupOrder, handleWebhook, loadOrder } = await import("./service");

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const FR_PLAN_ID = "22222222-2222-4222-8222-222222222222";
function seedPlan(over: Row = {}) {
  tables.esim_listings = [
    { country_code: "MU", plan_id: PLAN_ID, badge: "popular", sort_order: 10, auto: false },
    { country_code: "FR", plan_id: FR_PLAN_ID, badge: null, sort_order: 10, auto: true },
  ];
  tables.esim_plans = [
    {
      id: FR_PLAN_ID,
      name: "France 1GB/Day × 7 days",
      provider_code: "FR_1_Daily",
      period_num: 7,
      data_mb: 1024,
      per_day: true,
      validity_days: 7,
      country_codes: ["FR"],
      networks: [],
      networks_by_country: { FR: [{ name: "Orange", type: "5G" }] },
      wholesale_usd_micros: 4_550_000,
      retail_eur_cents: 990,
      active: true,
      available: true,
      covers_rodrigues: false,
    },
    {
      id: PLAN_ID,
      name: "Global 3GB 30Days",
      provider_code: "GL-120_3_30",
      period_num: null,
      data_mb: 3072,
      per_day: false,
      validity_days: 30,
      country_codes: ["MU", "FR", "ZA"],
      networks: [{ name: "my.t", type: "4G" }],
      networks_by_country: { MU: [{ name: "my.t", type: "4G" }] },
      wholesale_usd_micros: 11_400_000,
      retail_eur_cents: 1590,
      active: true,
      available: true,
      covers_rodrigues: true,
      ...over,
    },
  ];
}
const muPlan = () => tables.esim_plans.find((p) => p.id === PLAN_ID)!;

async function buy(planId = PLAN_ID, destination?: string) {
  const c = await startCheckout({ planId, destination, email: "guest@example.com", language: "en", source: {} });
  return c;
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  paypal.orders.clear();
  paypal.captureCalls = 0;
  paypal.captureAmountOverride = null;
  wholesale.orders.clear();
  wholesale.orderCalls = 0;
  wholesale.queries = 0;
  wholesale.readyAfterQueries = 0;
  wholesale.failOrder = null;
  wholesale.unitMicros = 11_400_000;
  mail.delivered = [];
  mail.problem = [];
  mail.owner = [];
  seedPlan();
});

describe("the happy path", () => {
  it("captures, buys once, delivers, emails once, and the link opens the QR", async () => {
    const c = await buy();
    expect(tables.esim_orders[0]).toMatchObject({ status: "pending_payment", retail_eur_cents: 1590, paypal_order_id: c.paypalOrderId });
    // PayPal was asked for exactly the plan's price, in EUR, tied to our id.
    expect(paypal.orders.get(c.paypalOrderId)).toMatchObject({ value: "15.90", referenceId: c.orderId });

    const r = await completePayment(c.orderId, c.paypalOrderId);
    expect(r.status).toBe("delivered");
    const o = (await loadOrder(c.orderId))!;
    expect(o).toMatchObject({ status: "delivered", paid_eur_cents: 1590, provider_order_no: "B1", activation_code: "CODEB1", smdp_address: "rsp.example.com" });
    expect(wholesale.orderCalls).toBe(1);
    expect(mail.delivered).toEqual([c.orderId]);
    expect(mail.owner.some((k) => k.includes(":sold:"))).toBe(true);

    const key = new URL(`https://x${r.url}`).searchParams.get("k");
    const view = await viewOrder(r.ref, key);
    expect(view?.activation?.lpa).toBe("LPA:1$rsp.example.com$CODEB1");
    expect(view?.activation?.appleUrl).toContain("esimsetup.apple.com");
    // Wrong key → nothing, not even the status.
    expect(await viewOrder(r.ref, "x".repeat(32))).toBeNull();
  });
});

describe("idempotency — the double tap", () => {
  it("a second capture call neither charges again nor buys a second eSIM nor re-emails", async () => {
    const c = await buy();
    await completePayment(c.orderId, c.paypalOrderId);
    const again = await completePayment(c.orderId, c.paypalOrderId);
    expect(again.status).toBe("delivered");
    expect(paypal.captureCalls).toBe(1);
    expect(wholesale.orderCalls).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it("recovers when PayPal says ORDER_ALREADY_CAPTURED on a retry after a lost response", async () => {
    const c = await buy();
    // Simulate: money captured at PayPal, but our row never heard about it.
    paypal.orders.get(c.paypalOrderId)!.captured = true;
    const r = await completePayment(c.orderId, c.paypalOrderId);
    expect(r.status).toBe("delivered");
    expect((await loadOrder(c.orderId))!.paid_eur_cents).toBe(1590);
  });
});

describe("money guards", () => {
  it("refuses a PayPal order that belongs to a different eSIM order", async () => {
    const a = await buy();
    const b = await buy();
    await expect(completePayment(b.orderId, a.paypalOrderId)).rejects.toMatchObject({ status: 409 });
    expect(wholesale.orderCalls).toBe(0);
  });

  it("refuses an under-payment and issues nothing", async () => {
    const c = await buy();
    paypal.captureAmountOverride = "4.90";
    await expect(completePayment(c.orderId, c.paypalOrderId)).rejects.toMatchObject({ status: 409 });
    expect((await loadOrder(c.orderId))!.status).toBe("pending_payment");
    expect(wholesale.orderCalls).toBe(0);
    expect(mail.owner.some((k) => k.includes(":mismatch:"))).toBe(true);
  });

  it("refuses to START a checkout when the wholesaler's price has made the plan a loss-maker", async () => {
    wholesale.unitMicros = 19_000_000; // $19 cost against a €15.90 price
    await expect(buy()).rejects.toMatchObject({ status: 409 });
    expect(paypal.orders.size).toBe(0);
    expect(mail.owner.some((k) => k.includes(":below_cost:"))).toBe(true);
  });

  it("hides a plan the wholesaler has withdrawn, before anyone pays", async () => {
    seedPlan({ provider_code: "GONE" });
    await expect(buy()).rejects.toMatchObject({ status: 409 });
    expect(muPlan().available).toBe(false);
  });

  it("never sells a plan that does not cover Rodrigues, even if marked active", async () => {
    seedPlan({ covers_rodrigues: false });
    await expect(buy()).rejects.toMatchObject({ status: 404 });
  });
});

describe("the wholesaler being slow or broken", () => {
  it("a slow profile leaves the order provisioning; the page poll then finishes it, once", async () => {
    wholesale.readyAfterQueries = 1_000; // never ready during the capture call
    const c = await buy();
    const r = await (async () => {
      // Shorten the capture wait: provisionOrder is what completePayment calls.
      const p = completePayment(c.orderId, c.paypalOrderId);
      return p;
    })();
    expect(["provisioning", "delivered"]).toContain(r.status);
    wholesale.readyAfterQueries = 0;
    const after = await provisionOrder(c.orderId, { waitMs: 0 });
    expect(after.status).toBe("delivered");
    await provisionOrder(c.orderId, { waitMs: 0 });
    expect(wholesale.orderCalls).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  }, 40_000);

  it("a definitive refusal (no balance) marks it failed, tells the customer and the owner", async () => {
    wholesale.failOrder = new ProviderError("eSIM Access 200007: insufficient balance", "200007", false);
    const c = await buy();
    const r = await completePayment(c.orderId, c.paypalOrderId);
    expect(r.status).toBe("failed");
    expect(mail.problem).toEqual([c.orderId]);
    expect(mail.owner.some((k) => k.includes(":failed:"))).toBe(true);

    // Owner tops up and presses Retry → delivered, same single wholesale order.
    wholesale.failOrder = null;
    const retried = await provisionOrder(c.orderId, { waitMs: 0, retryFailed: true });
    expect(retried.status).toBe("delivered");
    expect(wholesale.orders.size).toBe(1);
  });

  it("a retryable blip leaves it paid (not failed) for the next poll to retry", async () => {
    wholesale.failOrder = new ProviderError("eSIM Access unreachable", null, true);
    const c = await buy();
    const r = await completePayment(c.orderId, c.paypalOrderId);
    expect(r.status).toBe("paid");
    expect(mail.problem).toHaveLength(0);
    wholesale.failOrder = null;
    expect((await provisionOrder(c.orderId, { waitMs: 0 })).status).toBe("delivered");
  }, 20_000);
});

describe("webhooks", () => {
  it("are a doorbell: they finish a pending order by re-reading it, and dedupe", async () => {
    wholesale.readyAfterQueries = 1_000;
    const c = await buy();
    await completePayment(c.orderId, c.paypalOrderId).catch(() => {});
    wholesale.readyAfterQueries = 0;
    const ev = { key: "esimaccess:n1", type: "ORDER_STATUS", orderNo: "B1", iccid: null, transactionId: c.orderId, esimStatus: "GOT_RESOURCE", smdpStatus: null, totalBytes: null, usedBytes: null, expiresAt: null };
    await handleWebhook("esimaccess", { __ev: ev }, { trustedSender: false });
    expect((await loadOrder(c.orderId))!.status).toBe("delivered");
    const dup = await handleWebhook("esimaccess", { __ev: ev }, { trustedSender: false });
    expect(dup.duplicate).toBe(true);
    expect(mail.delivered).toHaveLength(1);
  }, 40_000);

  it("only write usage figures when they come from the wholesaler's IPs", async () => {
    const c = await buy();
    await completePayment(c.orderId, c.paypalOrderId);
    const usage = (key: string) => ({ key, type: "DATA_USAGE", orderNo: "B1", iccid: "89", transactionId: c.orderId, esimStatus: "IN_USE", smdpStatus: null, totalBytes: 100, usedBytes: 99, expiresAt: null });
    await handleWebhook("esimaccess", { __ev: usage("u1") }, { trustedSender: false });
    expect((await loadOrder(c.orderId))!.used_bytes).toBe(0);
    await handleWebhook("esimaccess", { __ev: usage("u2") }, { trustedSender: true });
    expect((await loadOrder(c.orderId))!.used_bytes).toBe(99);
  });
});

describe("destinations (M224)", () => {
  it("sells a France plan on the France shelf, without the Rodrigues rule, and records where it is for", async () => {
    const getPackage = fakeProvider.getPackage;
    fakeProvider.getPackage = async (code: string) => ({ code, wholesaleUsdMicros: 650_000 }); // $0.65/day
    try {
      const c = await buy(FR_PLAN_ID, "FR");
      const o = tables.esim_orders.find((r) => r.id === c.orderId)!;
      expect(o.destination).toBe("FR");
      expect((o.plan_snapshot as { destination: string; networks: { name: string }[] }).destination).toBe("FR");
      expect((o.plan_snapshot as { networks: { name: string }[] }).networks[0].name).toBe("Orange");
      const r = await completePayment(c.orderId, c.paypalOrderId);
      expect(r.status).toBe("delivered");
      const key = new URL(`https://x${r.url}`).searchParams.get("k");
      const view = await viewOrder(r.ref, key);
      expect(view?.destination).toMatchObject({ code: "FR", en: "France", home: false });
    } finally {
      fakeProvider.getPackage = getPackage;
    }
  });

  it("refuses a plan bought through a shelf it is not on", async () => {
    // The MU plan also works in South Africa, but it is not on the ZA shelf.
    await expect(buy(PLAN_ID, "ZA")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a plan for a country it does not cover", async () => {
    await expect(buy(FR_PLAN_ID, "MU")).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an unknown destination", async () => {
    await expect(buy(PLAN_ID, "ZZ")).rejects.toMatchObject({ status: 400 });
  });

  it("orders from before M224 read as Mauritius", async () => {
    const c = await buy();
    const o = tables.esim_orders.find((r) => r.id === c.orderId)!;
    delete o.destination;
    delete (o.plan_snapshot as Row).destination;
    await completePayment(c.orderId, c.paypalOrderId);
    const view = await viewOrder(c.ref, new URL(`https://x${(await lookupOrder(c.ref, "guest@example.com"))!}`).searchParams.get("k"));
    expect(view?.destination.code).toBe("MU");
  });
});

describe("lost link lookup", () => {
  it("needs the ref AND the email, and never opens an unpaid order", async () => {
    const c = await buy();
    expect(await lookupOrder(c.ref, "guest@example.com")).toBeNull(); // not paid yet
    await completePayment(c.orderId, c.paypalOrderId);
    expect(await lookupOrder(c.ref.toLowerCase(), " Guest@Example.com ")).toMatch(/^\/esim\/order\/ES-[0-9A-F]{6}\?k=/);
    expect(await lookupOrder(c.ref, "someone@else.com")).toBeNull();
  });
});
