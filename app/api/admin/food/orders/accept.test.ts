import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

// ── "CONFIRMED WITH COOK" MOVES NO MONEY (M217) ─────────────────────────────
//
// Chez Banane's orders are booked a day or two ahead and paid in cash at the
// handover. Before M217 the only "confirm" on /admin/food was the status move
// to 'paid' — admin_update_order_status(), which CAPTURES the pending cash row:
// money recorded on Wednesday for a Friday lunch nobody had paid for.
//
// These tests drive the real PATCH handler with a fake privileged client and
// pin the one property that matters: the accept action calls
// admin_accept_order() and NEVER admin_update_order_status().

const ORDER_ID = "0b6f3f7e-5a55-4d51-9d6c-6a8f0f1a2b3c";
const KITCHEN = "d522e765-78c3-43da-ab4e-db2b7977acaa";

type Row = Record<string, unknown> | null;

const state: {
  order: Row;
  kitchen: Row;
  rpcResult: { data: unknown; error: { code?: string; message: string } | null };
  rpcCalls: { name: string; args: unknown }[];
  writes: string[];
} = {
  order: null,
  kitchen: null,
  rpcResult: { data: null, error: null },
  rpcCalls: [],
  writes: [],
};

/** A PostgREST builder just deep enough for the routes' reads. */
function builder(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => chain,
    update: () => {
      state.writes.push(`update:${table}`);
      return chain;
    },
    insert: () => {
      state.writes.push(`insert:${table}`);
      return chain;
    },
    maybeSingle: async () => ({
      data: table === "orders" ? state.order : table === "food_kitchens" ? state.kitchen : null,
      error: null,
    }),
  };
  return chain;
}

const fakeAdmin = {
  from: (table: string) => builder(table),
  rpc: (name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return { single: async () => state.rpcResult };
  },
  auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
};

const notifyOrderCustomer = vi.fn(async () => true);
const audit = vi.fn(async () => {});
const dispatchNotification = vi.fn(async () => {});
const pushToCustomer = vi.fn(async () => 0);

vi.mock("@/lib/food/guard", () => ({
  guardFoodAdmin: async () => ({ admin: fakeAdmin }),
  readJson: async (req: Request) => req.json(),
  failed: (_err: unknown, fallback: string) => NextResponse.json({ error: fallback }, { status: 500 }),
}));
vi.mock("@/lib/notifications/order-events", () => ({ notifyOrderCustomer }));
vi.mock("@/lib/admin/audit", () => ({ audit }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification }));
vi.mock("@/lib/push/send", () => ({ pushToCustomer }));
vi.mock("@/lib/delivery/notify", () => ({ notifyDriversOfNewOffer: vi.fn(async () => {}) }));
vi.mock("@/lib/notifications/queue", () => ({
  enqueueNotification: vi.fn(async () => {}),
  formatWhatsAppMessage: () => "",
}));

const { PATCH } = await import("./route");

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/admin/food/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.order = { order_number: "RR-1042", status: "pending_payment", store_id: KITCHEN, accepted_at: null };
  state.kitchen = { store_id: KITCHEN };
  state.rpcResult = {
    data: { order_id: ORDER_ID, accepted_at: "2026-09-23T10:05:00+00:00" },
    error: null,
  };
  state.rpcCalls = [];
  state.writes = [];
  notifyOrderCustomer.mockClear();
  audit.mockClear();
  dispatchNotification.mockClear();
  pushToCustomer.mockClear();
});

describe("PATCH { action: 'accept' } — Confirmed with cook", () => {
  it("calls admin_accept_order, and never admin_update_order_status", async () => {
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: "admin_accept_order", args: { p_order_id: ORDER_ID } }]);
    expect(state.rpcCalls.map((c) => c.name)).not.toContain("admin_update_order_status");
    expect(await res.json()).toMatchObject({ ok: true, acceptedAt: "2026-09-23T10:05:00+00:00" });
  });

  it("writes nothing itself — no payment, no order row — the RPC does it all", async () => {
    await patch({ orderId: ORDER_ID, action: "accept" });
    expect(state.writes).toEqual([]);
  });

  it("emails the customer through the order-events notifier's 'accepted' event", async () => {
    await patch({ orderId: ORDER_ID, action: "accept" });
    expect(notifyOrderCustomer).toHaveBeenCalledTimes(1);
    expect(notifyOrderCustomer).toHaveBeenCalledWith(ORDER_ID, "accepted");
    // Not the status-change mail: that one says "Your order is now: Paid".
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(fakeAdmin, expect.objectContaining({ action: "order.accepted" }));
  });

  it("a second tap tells nobody twice (the RPC is idempotent, so is the route)", async () => {
    state.order = { ...state.order, accepted_at: "2026-09-23T10:05:00+00:00" };
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyConfirmed: true });
    expect(notifyOrderCustomer).not.toHaveBeenCalled();
  });

  it("a notifier that throws cannot undo a confirmation that committed", async () => {
    notifyOrderCustomer.mockRejectedValueOnce(new Error("mail down"));
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(200);
  });

  it("maps RR004 (wrong state) to 409 and tells nobody", async () => {
    state.rpcResult = { data: null, error: { code: "RR004", message: "This order can no longer be confirmed." } };
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This order can no longer be confirmed.");
    expect(notifyOrderCustomer).not.toHaveBeenCalled();
  });

  it("maps RR003 (not found) to 404", async () => {
    state.rpcResult = { data: null, error: { code: "RR003", message: "Order not found." } };
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(404);
  });

  it("refuses a shop's order — food only, like every action on this screen", async () => {
    state.kitchen = null;
    const res = await patch({ orderId: ORDER_ID, action: "accept" });
    expect(res.status).toBe(404);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuses to ride along with a status, which would go through admin_update_order_status", async () => {
    const res = await patch({ orderId: ORDER_ID, action: "accept", status: "paid" });
    expect(res.status).toBe(400);
    expect(state.rpcCalls).toEqual([]);
  });
});

describe("'Confirm payment' is still its own action", () => {
  it("a status move still goes through admin_update_order_status, not admin_accept_order", async () => {
    state.rpcResult = { data: { order_id: ORDER_ID, status: "paid" }, error: null };
    await patch({ orderId: ORDER_ID, status: "paid" });
    expect(state.rpcCalls.map((c) => c.name)).toEqual(["admin_update_order_status"]);
  });
});

describe("the queue offers it", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("OrderQueue sends { action: 'accept' } and labels it for the cook, not the money", () => {
    const src = read("app/admin/food/OrderQueue.tsx");
    expect(src).toContain('action: "accept"');
    expect(src).toContain("Confirmed with cook");
    // The payment button keeps its own words.
    expect(src).toContain('paid: "Confirm payment"');
  });

  it("the queue reads accepted_at, so a confirmed card can say so", () => {
    expect(read("lib/admin/order-hydrate.ts")).toMatch(/ORDER_COLUMNS =\n?\s*".*\baccepted_at\b.*\bpickup_slot\b/);
  });
});
