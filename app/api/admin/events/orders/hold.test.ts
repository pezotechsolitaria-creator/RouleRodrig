import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── "HOLD — PAYS AT THE DOOR" MOVES NO MONEY AND ISSUES NO TICKET (M220) ─────
//
// A cash "pay at the door" ticket order is released 168h after it is placed
// unless somebody accepts it. Before this, the only button on the box office
// that saved it was "Money received — issue tickets": money recorded weeks
// before anybody handed it over.
//
// These drive the real POST handler with a fake privileged client and pin the
// property that matters: "hold" calls admin_accept_order() (M217/M219 — it sets
// accepted_at and touches no payment) and NEVER admin_confirm_event_payment().

const ORDER_ID = "7c1f3e2a-8b4d-4e6f-9a0b-1c2d3e4f5a6b";
const EVENT_STORE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

type Row = Record<string, unknown> | null;

const state: {
  order: Row;
  event: Row;
  rpcResult: { data: unknown; error: { code?: string; message: string } | null };
  rpcCalls: { name: string; args: unknown }[];
  writes: string[];
} = { order: null, event: null, rpcResult: { data: null, error: null }, rpcCalls: [], writes: [] };

function builder(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
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
      data: table === "orders" ? state.order : table === "events" ? state.event : null,
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
};

const audit = vi.fn(async () => {});

vi.mock("@/lib/auth", () => ({ verifySession: () => true, COOKIE_NAME: "admin" }));
vi.mock("@/lib/supabase/admin", () => ({ getPrivileged: async () => fakeAdmin, hasServiceRole: () => true }));
vi.mock("@/lib/admin/audit", () => ({ audit }));
const notifyTicketsIssued = vi.fn(async () => true);
vi.mock("@/lib/notifications/ticket-delivery", () => ({ notifyTicketsIssued }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/admin/events/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  state.order = { order_number: "EV-0042", status: "pending_payment", store_id: EVENT_STORE, accepted_at: null };
  state.event = { store_id: EVENT_STORE };
  state.rpcResult = { data: { order_id: ORDER_ID, accepted_at: "2026-09-29T09:00:00+00:00" }, error: null };
  state.rpcCalls = [];
  state.writes = [];
  audit.mockClear();
  notifyTicketsIssued.mockClear();
});

describe("POST { action: 'hold' } — pays at the door", () => {
  it("calls admin_accept_order, and never the payment confirmation", async () => {
    const res = await post({ orderId: ORDER_ID, action: "hold" });
    expect(res.status).toBe(200);
    expect(state.rpcCalls).toEqual([{ name: "admin_accept_order", args: { p_order_id: ORDER_ID } }]);
    expect(await res.json()).toMatchObject({ ok: true, acceptedAt: "2026-09-29T09:00:00+00:00", alreadyHeld: false });
  });

  it("writes nothing itself and issues no ticket", async () => {
    await post({ orderId: ORDER_ID, action: "hold" });
    expect(state.writes).toEqual([]);
    expect(notifyTicketsIssued).not.toHaveBeenCalled();
  });

  it("is audited, once", async () => {
    await post({ orderId: ORDER_ID, action: "hold" });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      fakeAdmin,
      expect.objectContaining({ action: "event.order_held", entityType: "order", entityId: ORDER_ID }),
    );
  });

  it("a second tap changes nothing and logs nothing", async () => {
    state.order = { ...state.order, accepted_at: "2026-09-29T09:00:00+00:00" };
    const res = await post({ orderId: ORDER_ID, action: "hold" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyHeld: true });
    expect(audit).not.toHaveBeenCalled();
  });

  it("refuses an order that is not an event's — this door is not a way into a shop", async () => {
    state.event = null;
    const res = await post({ orderId: ORDER_ID, action: "hold" });
    expect(res.status).toBe(404);
    expect(state.rpcCalls).toEqual([]);
  });

  it("maps RR004 (already paid or cancelled) to 409", async () => {
    state.rpcResult = { data: null, error: { code: "RR004", message: "This order can no longer be confirmed." } };
    const res = await post({ orderId: ORDER_ID, action: "hold" });
    expect(res.status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("'Money received' is still its own action", () => {
  it("confirm goes through admin_confirm_event_payment, not admin_accept_order", async () => {
    state.rpcCalls = [];
    const rpc = fakeAdmin.rpc;
    // The confirm branch awaits rpc() directly rather than .single().
    fakeAdmin.rpc = ((name: string, args: unknown) => {
      state.rpcCalls.push({ name, args });
      return Promise.resolve({ data: { ok: true, ticketsIssued: 2 }, error: null });
    }) as unknown as typeof fakeAdmin.rpc;
    try {
      await post({ orderId: ORDER_ID, action: "confirm" });
    } finally {
      fakeAdmin.rpc = rpc;
    }
    expect(state.rpcCalls.map((c) => c.name)).toEqual(["admin_confirm_event_payment"]);
  });
});
