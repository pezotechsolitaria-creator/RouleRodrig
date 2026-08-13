import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Loading orders without PostgREST embeds ────────────────────────────────
//
// Embeds have now broken this codebase in production three times:
//
//   1. food_kitchens embedding its SIBLINGS (no FK between them) — the whole
//      query failed and the admin menu panel said "Add a kitchen first" while
//      four kitchens were live.
//   2. payments embedded TWICE in one select — PostgREST answers the entire
//      request with 42803, so the admin food queue showed only "Failed to load
//      orders".
//   3. The owner, again, after (2) was fixed: "still cannot view orders and in
//      admin it says failed to load orders".
//
// Every one of them was invisible to tsc, to the production build and to the
// whole unit suite, because none of those ever issues the query. And every one
// of them failed TOTALLY: a bad embed does not degrade a field, it 400s the
// request, so one wrong relation name empties the most important screen the
// owner has.
//
// So the order queues stop using embeds. Four plain reads, joined here in code.
// It is one extra round trip against a database in the same region, and in
// exchange no relationship name, no missing foreign key and no duplicate embed
// can ever blank the screen again. If `order_items` fails, the orders still
// render — with their items missing and the reason logged — instead of the
// operator being told there are no orders at all.
//
// The same reasoning as lib/supabase/select-embeds.test.ts, taken further:
// that test guards the rule that is decidable from the string, this removes the
// need to decide anything.

export type HydratedOrder = Record<string, unknown> & {
  id: string;
  items: {
    id: string;
    name: string;
    variantName: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  payments: { provider?: string; status?: string; amount?: number }[];
  deliveryZoneName: string | null;
};

/**
 * Every scalar column both order desks need. No relations — that is the point.
 *
 * ONE unbroken literal with `as const`, deliberately. supabase-js type-checks a
 * select string against the generated schema, but only when it can see a
 * literal type: concatenating with `+` widens it to `string` and the checking
 * silently turns off (it surfaces as GenericStringError downstream). Since this
 * file exists to stop select strings failing in production, losing the one
 * compile-time check that catches a misspelled COLUMN would be a poor trade.
 * Keep it on a single line.
 */
export const ORDER_COLUMNS =
  "id, order_number, status, store_id, customer_name, customer_phone, customer_email, notes, subtotal, delivery_fee, total, currency, fulfillment_method, placed_at, created_at, delivery_lat, delivery_lng, delivery_instructions, auto_release_at, delivery_zone_id, payment_receipt_path, receipt_submitted_at" as const;

/**
 * Attach items, payments and the delivery-zone name to a page of orders.
 *
 * Never throws and never returns partial-looking success: a failed child read
 * is logged and leaves that collection empty, because an order with no items
 * listed is a visible, reportable oddity, while an empty screen reads as "there
 * is nothing here" and gets believed.
 */
export async function hydrateOrders(
  admin: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<HydratedOrder[]> {
  const ids = rows.map((o) => o.id as string);
  if (ids.length === 0) return [];

  const [itemsRes, paymentsRes, zonesRes] = await Promise.all([
    admin
      .from("order_items")
      .select("id, order_id, product_name, variant_name, unit_price, quantity, line_total")
      .in("order_id", ids),
    admin.from("payments").select("order_id, provider, status, amount").in("order_id", ids),
    (async () => {
      const zoneIds = [...new Set(rows.map((o) => o.delivery_zone_id).filter(Boolean))] as string[];
      if (zoneIds.length === 0) return { data: [], error: null };
      return admin.from("delivery_zones").select("id, name").in("id", zoneIds);
    })(),
  ]);

  // Logged, not swallowed and not fatal. A silent catch here is what turns a
  // broken read into a confident-looking empty state.
  if (itemsRes.error) console.error("hydrateOrders: order_items failed", itemsRes.error);
  if (paymentsRes.error) console.error("hydrateOrders: payments failed", paymentsRes.error);
  if (zonesRes.error) console.error("hydrateOrders: delivery_zones failed", zonesRes.error);

  const itemsBy = new Map<string, HydratedOrder["items"]>();
  for (const raw of (itemsRes.data ?? []) as Record<string, unknown>[]) {
    const key = raw.order_id as string;
    const list = itemsBy.get(key) ?? [];
    list.push({
      id: raw.id as string,
      name: raw.product_name as string,
      variantName: (raw.variant_name as string | null) ?? null,
      unitPrice: Number(raw.unit_price ?? 0),
      quantity: Number(raw.quantity ?? 0),
      lineTotal: Number(raw.line_total ?? 0),
    });
    itemsBy.set(key, list);
  }

  const paymentsBy = new Map<string, HydratedOrder["payments"]>();
  for (const raw of (paymentsRes.data ?? []) as Record<string, unknown>[]) {
    const key = raw.order_id as string;
    const list = paymentsBy.get(key) ?? [];
    list.push({
      provider: raw.provider as string | undefined,
      status: raw.status as string | undefined,
      amount: raw.amount == null ? undefined : Number(raw.amount),
    });
    paymentsBy.set(key, list);
  }

  const zoneName = new Map(
    ((zonesRes.data ?? []) as { id: string; name: string }[]).map((z) => [z.id, z.name]),
  );

  return rows.map((o) => ({
    ...o,
    id: o.id as string,
    items: itemsBy.get(o.id as string) ?? [],
    payments: paymentsBy.get(o.id as string) ?? [],
    deliveryZoneName: zoneName.get(o.delivery_zone_id as string) ?? null,
  }));
}

/**
 * Cash still owed. Summed from the ledger, the one arithmetic every screen shares.
 *
 * CASH only, and that qualifier is the whole point (M85). A pending BANK row is
 * a transfer nobody has verified yet, not money owed at the counter — counting
 * it told a cook to collect Rs 320 from a customer who had already paid, on the
 * very same card that was asking them to approve that customer's receipt.
 */
export function balanceDueOf(order: HydratedOrder): number {
  if (["cancelled", "refunded"].includes(String(order.status))) return 0;
  return order.payments
    .filter((p) => p.status === "pending" && p.provider === "cash")
    .reduce((n, p) => n + (p.amount ?? 0), 0);
}
