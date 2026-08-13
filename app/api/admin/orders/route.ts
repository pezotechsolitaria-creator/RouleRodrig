import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { audit } from "@/lib/admin/audit";
import { notifyDriversOfNewOffer } from "@/lib/delivery/notify";
import { domainOf, type DeskOrder } from "@/lib/admin/order-desk";
import { type OrderStatus } from "@/lib/orders/status";

// ── EVERY ORDER, ONE ENDPOINT ───────────────────────────────────────────────
//
// The pieces to accept and cancel an order all existed. What did not exist was
// a place to do it: nine open orders were spread across /admin/food,
// /admin/marketplace and /admin/events, with nothing on any screen admitting the
// others were there.
//
// This reads them all and moves any of them, and it does NOT invent a second
// state machine to do it. Every write goes through admin_update_order_status(),
// the same SECURITY DEFINER RPC the two existing desks call, which owns the
// legal transitions, restocks on cancel, notifies the customer and captures a
// pending payment. Six triggers on `orders` do the rest — tickets, financials,
// the delivery job, the pickup code and the refund on cancel — so a status
// change here behaves identically to one made from the specialist screen.

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    "paid",
    "preparing",
    "ready_for_pickup",
    "collected",
    "cancelled",
  ]),
  internalNote: z.string().max(500).optional(),
});

const NOT_FOUND = "RR003";
const ILLEGAL = "RR004";

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const scope = new URL(req.url).searchParams.get("scope") ?? "open";

  let query = admin
    .from("orders")
    .select(
      "id, order_number, status, store_id, customer_name, customer_phone, total, currency, placed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(400);

  if (scope === "open") {
    query = query.not("status", "in", "(collected,cancelled,refunded)");
  }

  const [{ data: rows, error }, kitchens, eventStores, items] = await Promise.all([
    query,
    admin.from("food_kitchens").select("store_id"),
    admin.from("events").select("store_id"),
    admin.from("order_items").select("order_id"),
  ]);

  if (error) return failed(error, "Could not read the orders.");

  const storeIds = [...new Set((rows ?? []).map((o) => o.store_id as string))];
  const { data: stores } = await admin.from("stores").select("id, name").in("id", storeIds.length ? storeIds : [""]);

  const nameById = new Map((stores ?? []).map((s) => [s.id as string, s.name as string]));
  const kitchenIds = new Set((kitchens.data ?? []).map((k) => k.store_id as string));
  const eventIds = new Set((eventStores.data ?? []).map((e) => e.store_id as string));

  // One pass to count line items rather than a query per order.
  const itemCount = new Map<string, number>();
  for (const it of items.data ?? []) {
    const id = it.order_id as string;
    itemCount.set(id, (itemCount.get(id) ?? 0) + 1);
  }

  const orders: DeskOrder[] = (rows ?? []).map((o) => ({
    id: o.id as string,
    orderNumber: (o.order_number as string) ?? "",
    status: o.status as OrderStatus,
    domain: domainOf(kitchenIds.has(o.store_id as string), eventIds.has(o.store_id as string)),
    storeName: nameById.get(o.store_id as string) ?? "Unknown",
    customerName: (o.customer_name as string) ?? null,
    customerPhone: (o.customer_phone as string) ?? null,
    total: Number(o.total ?? 0),
    currency: (o.currency as string) ?? "MUR",
    placedAt: String(o.placed_at ?? o.created_at ?? ""),
    items: itemCount.get(o.id as string) ?? 0,
  }));

  return NextResponse.json({ orders });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { orderId, status, internalNote } = parsed.data;

  const { data: before } = await admin
    .from("orders")
    .select("status, store_id, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const { error } = await admin
    .rpc("admin_update_order_status", {
      p_order_id: orderId,
      p_new_status: status,
      p_internal_note: internalNote ?? null,
    })
    .single();

  if (error) {
    // Refusals, not failures. An illegal transition means somebody else moved
    // the order first — the screen should say so and reload, not show a 500.
    if (error.code === NOT_FOUND) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL) return NextResponse.json({ error: error.message }, { status: 409 });
    return failed(error, "Could not update that order.");
  }

  // A food or shop order set to ready becomes a delivery job through the M49
  // trigger; the drivers still have to be told it exists. Best-effort, after the
  // commit — a quiet notification provider must not make the operator think the
  // status change failed.
  if (status === "ready_for_pickup" && before.status !== "ready_for_pickup") {
    try {
      await notifyDriversOfNewOffer(orderId);
    } catch (err) {
      console.error("notifyDriversOfNewOffer failed", err);
    }
  }

  await audit(admin, {
    action: status === "cancelled" ? "order.cancel" : "order.advance",
    entityType: "order",
    entityId: orderId,
    diff: { from: before.status, to: status, orderNumber: before.order_number, via: "orders desk" },
  });

  return NextResponse.json({ ok: true, status });
}
