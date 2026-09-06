import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attentionItems, type AttentionCounts, type AttentionItem, type OrderQueues } from "./ops";

// ── WHAT NEEDS A PERSON, GATHERED ONCE ──────────────────────────────────────
//
// attentionItems() has always been pure: hand it counts, get back the list.
// Gathering those counts lived inside app/admin/page.tsx, which meant the
// answer existed on exactly one screen — you had to be looking AT the command
// centre to learn that something wanted you.
//
// The notification bell needs the same answer from every admin page, so the
// gathering moves here and both callers share it. Deliberately one function
// rather than two similar ones: the moment "what needs attention" has two
// definitions, they start disagreeing, and the bell that says 0 while the
// dashboard says 3 is worse than no bell.
//
// Every read is COUNT-ONLY where it can be. This runs on every admin page load
// via the bell, so it must stay cheap.

/**
 * The statuses that mean "this order is still somebody's problem".
 *
 * EXPORTED (M170) because it had been retyped twice — here, and again at
 * app/admin/page.tsx — and was about to be retyped a third time for the
 * merchant work queue. The comment at the top of this file warns about exactly
 * that: two definitions start disagreeing, and a bell that says 0 while the
 * dashboard says 3 is worse than no bell.
 */
export const OPEN_ORDER_STATUSES = [
  "pending_payment",
  "awaiting_payment_confirmation",
  "paid",
  "preparing",
  "ready_for_pickup",
];

/** Bucket each waiting order by the queue that can actually act on it. */
function byQueue(
  rows: { store_id: string | null }[] | null,
  kitchenIds: Set<string>,
  eventIds: Set<string>,
): OrderQueues {
  const q = { food: 0, shop: 0, events: 0 };
  for (const r of rows ?? []) {
    const id = r.store_id ?? "";
    if (kitchenIds.has(id)) q.food += 1;
    else if (eventIds.has(id)) q.events += 1;
    else q.shop += 1;
  }
  return q;
}

const n = (v: { count: number | null }) => v.count ?? 0;
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

/**
 * The counts behind "requires attention", read live.
 *
 * Never throws: a failed read contributes nothing rather than taking the whole
 * list down. A bell that goes quiet because one query failed is a bell that
 * lies, but a bell that cannot render at all is worse.
 */
export async function loadAttentionCounts(
  admin: SupabaseClient,
): Promise<AttentionCounts> {
  const [
    openOrders,
    awaiting,
    pendingBookings,
    pendingPlaces,
    submissions,
    reviews,
    pendingMerchants,
    ownerApps,
    pendingDrivers,
    deliveriesAdmin,
    variants,
    kitchenStores,
    eventStores,
  ] = await Promise.all([
    // WITH store_id, not a bare count: a shop order and a ticket order must not
    // be counted into an alert whose destination could never show them.
    admin.from("orders").select("store_id").in("status", OPEN_ORDER_STATUSES).limit(2000),
    admin.from("orders").select("store_id").eq("status", "awaiting_payment_confirmation").limit(2000),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("place_bookings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("contact_submissions").select("id", { count: "exact", head: true }).eq("handled", false),
    admin.from("product_reviews").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("owner_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("delivery_drivers").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .in("status", [
        "requires_admin",
        "driver_unresponsive",
        "failed_delivery",
        "returned_to_merchant",
      ]),
    // Low stock needs a column-to-column comparison PostgREST cannot express,
    // so the few hundred variant rows are compared here instead.
    admin.from("product_variants").select("stock_quantity, low_stock_threshold, is_active").limit(1000),
    admin.from("food_kitchens").select("store_id"),
    admin.from("events").select("store_id"),
  ]);

  const kitchenIds = new Set(
    ((kitchenStores.data ?? []) as { store_id: string }[]).map((k) => k.store_id),
  );
  const eventIds = new Set(
    ((eventStores.data ?? []) as { store_id: string }[]).map((e) => e.store_id),
  );

  const lowStock = (
    (variants.data ?? []) as {
      stock_quantity: number;
      low_stock_threshold: number;
      is_active: boolean;
    }[]
  ).filter(
    (v) => v.is_active && v.low_stock_threshold > 0 && v.stock_quantity <= v.low_stock_threshold,
  ).length;

  // The health checks the database answers in one call each. Separate from the
  // batch above because none of them needs anything from it.
  const [
    { data: orderableDishes },
    { data: emptyLiveKitchens },
    { data: paymentBlockedStores },
    { data: refundsOwed },
    { data: taxiNoShows },
    { data: refundsIgnored },
    { data: ridesAwaitingCallback },
    { data: blockedStoreRows },
  ] = await Promise.all([
    admin.rpc("orderable_dish_count"),
    admin.rpc("empty_live_kitchen_count"),
    admin.rpc("payment_blocked_store_count"),
    admin.rpc("outstanding_refund_count"),
    admin.rpc("recent_no_show_count"),
    admin.rpc("ignored_refund_count"),
    admin.rpc("rides_awaiting_callback_count"),
    // The same query as the count, but it says WHO. The count alone was
    // unactionable: four shops cannot trade, work out which four yourself.
    admin.rpc("payment_blocked_stores"),
  ]);

  return {
    openOrders: byQueue(
      openOrders.data as { store_id: string | null }[] | null,
      kitchenIds,
      eventIds,
    ),
    awaitingPaymentConfirmation: byQueue(
      awaiting.data as { store_id: string | null }[] | null,
      kitchenIds,
      eventIds,
    ),
    pendingVehicleBookings: n(pendingBookings),
    pendingPlaceBookings: n(pendingPlaces),
    unhandledSubmissions: n(submissions),
    pendingReviews: n(reviews),
    pendingMerchants: n(pendingMerchants),
    pendingOwnerApplications: n(ownerApps),
    pendingDrivers: n(pendingDrivers),
    deliveriesNeedingAdmin: n(deliveriesAdmin),
    lowStockVariants: lowStock,
    orderableDishes: num(orderableDishes),
    emptyLiveKitchens: num(emptyLiveKitchens),
    paymentBlockedStores: num(paymentBlockedStores),
    paymentBlockedStoreNames: Array.isArray(blockedStoreRows)
      ? (blockedStoreRows as { store_name?: string; is_kitchen?: boolean }[]).map((r) =>
          // A kitchen and a shop are fixed from the same screen but are
          // different things in the owner's head, so the row says which.
          r.is_kitchen ? `${r.store_name} (kitchen)` : String(r.store_name ?? ""),
        )
      : undefined,
    refundsOwed: num(refundsOwed),
    taxiNoShows: num(taxiNoShows),
    refundsIgnored: num(refundsIgnored),
    ridesAwaitingCallback: num(ridesAwaitingCallback),
  };
}

/** The list itself — what the bell and the command centre both render. */
export async function loadAttention(admin: SupabaseClient): Promise<AttentionItem[]> {
  return attentionItems(await loadAttentionCounts(admin));
}
