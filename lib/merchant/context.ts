import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { OPEN_ORDER_STATUSES } from "@/lib/admin/attention-load";
import type { MerchantKind } from "./kind";

/** Which store the dashboard is currently acting for. See getAccessibleStores. */
export const STORE_COOKIE = "rr_merchant_store";

export type AccessibleStore = { id: string; name: string; kind: MerchantKind };

export type MerchantDashboard = {
  merchantId: string;
  displayName: string;
  status: string;
  store: { id: string; name: string; kind: MerchantKind } | null;
  productCount: number;
};

/**
 * Everything the dashboard header and home screen need, for the store the
 * person is CURRENTLY acting for.
 *
 * Resolved through getOwnStoreId() rather than by looking up merchant_staff
 * again. That is the bug this replaces: getOwnStoreId honoured the store
 * switcher and this function did not, so picking "Ti Kitchen" moved the nav,
 * the Menu tab and the order queue while the home screen, the shop name and the
 * SUBSCRIPTION BANNER all still described the marketplace shop. The owner saw
 * "Ti Kitchen (DEMO)" in the switcher above "M4 Test Shop — your shop is live"
 * and an expired-subscription warning belonging to a different business.
 *
 * One resolver for the whole dashboard is the fix. Anything that needs to know
 * which store this is must go through getOwnStoreId().
 */
export async function getMerchantDashboard(supabase: SupabaseClient): Promise<MerchantDashboard | null> {
  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return null;

  const { data: store } = await supabase
    .from("stores")
    .select("id, name, merchant_id")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) return null;

  const row = store as { id: string; name: string; merchant_id: string };

  const stores = await getAccessibleStores(supabase);
  const [{ data: merchant }, { data: products }] = await Promise.all([
    supabase.from("merchants").select("display_name, status").eq("id", row.merchant_id).maybeSingle(),
    supabase.from("products").select("status").eq("store_id", storeId),
  ]);

  const m = merchant as { display_name?: string; status?: string } | null;

  return {
    merchantId: row.merchant_id,
    // The STORE's name, not the merchant's. Every kitchen hangs off one
    // platform merchant called "Roulé Rodrigues Kitchen", so showing the
    // merchant name would label every restaurant identically.
    displayName: row.name || m?.display_name || "Your shop",
    status: m?.status ?? "approved",
    // Kind travels WITH the store now, so every page and route downstream can
    // act on it instead of re-deriving a boolean. The resolver already knows —
    // it was being discarded.
    store: { id: row.id, name: row.name, kind: kindOf(stores, row.id) },
    productCount: ((products ?? []) as { status?: string }[]).filter((p) => p.status !== "archived").length,
  };
}

/** The kind of one store, defaulting to the safest label when unknown. */
function kindOf(stores: AccessibleStore[], id: string): MerchantKind {
  return stores.find((st) => st.id === id)?.kind ?? "shop";
}

export type DashboardStats = {
  recentProducts: {
    id: string;
    name: string;
    status: string;
    price: number;
    stockQuantity: number;
    imageUrl: string | null;
  }[];
  lowStockCount: number;
  outOfStockCount: number;
};

const LOW_STOCK_THRESHOLD = 5;

/** Recent products + a lightweight inventory summary for the dashboard home. */
export async function getDashboardStats(supabase: SupabaseClient, storeId: string): Promise<DashboardStats> {
  const { data } = await supabase
    .from("products")
    .select("id, name, status, created_at, product_variants(price, stock_quantity), product_media(url, position)")
    .eq("store_id", storeId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const recentProducts = rows.slice(0, 5).map((p) => {
    const variant = Array.isArray(p.product_variants) ? p.product_variants[0] : p.product_variants;
    const media = (Array.isArray(p.product_media) ? p.product_media : []) as { url: string; position: number }[];
    const cover = media.slice().sort((a, b) => a.position - b.position)[0];
    return {
      id: p.id as string,
      name: p.name as string,
      status: p.status as string,
      price: (variant as { price?: number } | undefined)?.price ?? 0,
      stockQuantity: (variant as { stock_quantity?: number } | undefined)?.stock_quantity ?? 0,
      imageUrl: cover?.url ?? null,
    };
  });

  for (const p of rows) {
    const variant = Array.isArray(p.product_variants) ? p.product_variants[0] : p.product_variants;
    const qty = (variant as { stock_quantity?: number } | undefined)?.stock_quantity ?? 0;
    if (qty === 0) outOfStockCount += 1;
    else if (qty <= LOW_STOCK_THRESHOLD) lowStockCount += 1;
  }

  return { recentProducts, lowStockCount, outOfStockCount };
}

/**
 * One row of work still waiting on the merchant.
 *
 * `dueAt` is the whole idea. It is coalesce(pickup_slot lower bound,
 * auto_release_at, created_at) — a branch on a COLUMN, never on what kind of
 * business this is. A shop's 48-hour bank-transfer deadline, a kitchen's 12:30
 * collection window and (later) a car wash's 09:00 appointment sort into one
 * list through the same expression, which is why this component does not need
 * to know a kitchen from a garage.
 */
export type WorkItem = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  totalCents: number | null;
  itemCount: number;
  /** Postgres tstzrange as text, or null. Present only where a slot was booked. */
  pickupSlot: string | null;
  autoReleaseAt: string | null;
  createdAt: string;
  dueAt: string;
};

export type WorkQueue =
  | { ok: true; items: WorkItem[]; openCount: number; lastCollectedAt: string | null }
  /**
   * A failed read is NOT an empty queue. PostgREST answers an RLS denial with
   * [] and no error, so "quiet evening" and "we lost your orders" would render
   * identically unless the caller can tell them apart. The UI shows a retry for
   * this and reassurance for the other.
   */
  | { ok: false };

/**
 * The orders still waiting on this merchant, soonest deadline first.
 *
 * Replaces getOrderCount(), which counted EVERY order this store had ever
 * taken, at any status, and rendered it as a headline "Orders" figure. A shop
 * with eleven lifetime orders and one customer waiting since Tuesday read
 * "11" — a number that never moves, answers no question, and is the only
 * order-derived figure the merchant home had.
 *
 * The sort is done in TypeScript because PostgREST cannot express a coalesce
 * across three columns in .order(). That is fine at this size — the platform
 * has taken eleven payments in total — but past roughly 200 OPEN orders on one
 * store this should become a view with dueAt as a generated column.
 */
export async function getWorkQueue(
  supabase: SupabaseClient,
  storeId: string,
  limit = 5,
): Promise<WorkQueue> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_name, total, pickup_slot, auto_release_at, created_at, order_items(count)",
    )
    .eq("store_id", storeId)
    .in("status", OPEN_ORDER_STATUSES)
    // Covered by orders_store_status_created_idx (store_id, status, created_at).
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("getWorkQueue failed", error);
    return { ok: false };
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    order_number: string;
    status: string;
    customer_name: string | null;
    total: number | null;
    pickup_slot: string | null;
    auto_release_at: string | null;
    created_at: string;
    order_items: { count: number }[] | null;
  }>;

  const items: WorkItem[] = rows
    .map((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      customerName: r.customer_name,
      totalCents: r.total,
      itemCount: r.order_items?.[0]?.count ?? 0,
      pickupSlot: r.pickup_slot,
      autoReleaseAt: r.auto_release_at,
      createdAt: r.created_at,
      dueAt: slotStart(r.pickup_slot) ?? r.auto_release_at ?? r.created_at,
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  // The empty state distinguishes "never traded" from "quiet today", and only
  // the second one is reassuring. A shop that has never sold anything needs a
  // link to share, not a compliment.
  let lastCollectedAt: string | null = null;
  if (items.length === 0) {
    const { data: last } = await supabase
      .from("orders")
      .select("placed_at")
      .eq("store_id", storeId)
      .eq("status", "collected")
      .order("placed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastCollectedAt = (last as { placed_at?: string } | null)?.placed_at ?? null;
  }

  return { ok: true, items: items.slice(0, limit), openCount: items.length, lastCollectedAt };
}

/**
 * The lower bound of a Postgres tstzrange, as text.
 *
 * pickup_slot arrives over PostgREST as its literal range text —
 * ["2026-09-06 12:30:00+00","2026-09-06 13:00:00+00") — not as an object. Only
 * the start is needed, and only for ordering and display.
 */
function slotStart(range: string | null): string | null {
  if (!range) return null;
  const m = range.match(/[[(]"?([^",)\]]+)/);
  return m ? m[1] : null;
}

/** Cheap existence check for pages that only need to gate on "has a shop yet". */
export async function hasShop(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("merchant_staff").select("merchant_id").limit(1);
  if ((data?.length ?? 0) > 0) return true;
  // A restaurant owner is kitchen_staff, not merchant_staff. Without this the
  // seven pages that gate on hasShop() — Orders, Products, Payments, Hours,
  // Pickup, order detail — would bounce them to /merchant/onboarding and invite
  // them to create a shop they already have.
  return (await getOwnKitchenStoreId(supabase)) !== null;
}

/**
 * The signed-in user's own store id, resolved server-side from their staff
 * membership — never from a client-supplied value. This is the ownership
 * anchor every product API route filters by; RLS is the real backstop, but
 * resolving store_id this way means a query is scoped to "my store" by
 * construction, not by trusting anything the request body claims.
 */
/**
 * The kitchen this person OWNS, if any.
 *
 * Every food kitchen hangs off the single PLATFORM merchant, so the
 * merchant_staff lookup below cannot tell one restaurant from another — it
 * would hand Chez Banane's owner whichever kitchen sorted first. kitchen_staff
 * is the only thing that knows who owns what, so it is asked directly.
 *
 * Ordered by name for a stable answer when someone owns more than one (the
 * platform owner does), so the dashboard does not silently change restaurants
 * between requests.
 */
async function getOwnKitchenStoreId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_kitchen_owner_ids");
  if (error) {
    console.error("my_kitchen_owner_ids failed", error);
    return null;
  }
  const ids = (data as string[] | null) ?? [];
  if (ids.length === 0) return null;
  if (ids.length === 1) return ids[0];

  const { data: rows } = await supabase
    .from("stores")
    .select("id, name")
    .in("id", ids)
    .order("name");
  return ((rows ?? [])[0]?.id as string | undefined) ?? ids[0];
}

/**
 * Every store this person may act for — their shop AND any restaurant they own.
 *
 * The platform owner is both a marketplace merchant and the owner of two
 * kitchens. Without this the dashboard resolved merchant first and they could
 * never reach a restaurant at all; and owning two kitchens, they could never
 * reach the second one either.
 *
 * Shops are listed before kitchens so an existing merchant's default does not
 * change under them.
 */
export const getAccessibleStores = cache(_getAccessibleStores);

/**
 * Every store this person may act for, each with what KIND of business it is.
 *
 * ── KIND IS DERIVED POSITIVELY, WHICH IT WAS NOT ──────────────────────────
 * This used to stamp `kind: "shop"` on anything reached through merchant_staff
 * without checking, and then dedupe the kitchen branch AGAINST that list — so
 * kind was decided by which query found the store first, and "shop" won every
 * tie. It survived only because the platform food merchant's owner is a
 * synthetic auth user that no human is staff on. The first real person added to
 * a kitchen would have turned every kitchen into a shop, and the Menu tab would
 * have vanished with no error anywhere.
 *
 * It was already wrong in production for a different reason: the owner's own
 * login reaches three EVENT box offices through merchant_staff, and all three
 * were labelled "shop".
 *
 * So the branch that finds a store no longer names it. Candidates are collected
 * first, then two bulk probes ask the tables that are actually the authority —
 * the same ones the storefront and the admin attention feed already use — and
 * 'shop' is what is LEFT once a store has been claimed by neither.
 *
 * Wrapped in React cache(): the merchant layout resolves this three times per
 * request through getOwnStoreId and its own call, and a kind-aware home makes
 * it four.
 */
async function _getAccessibleStores(supabase: SupabaseClient): Promise<AccessibleStore[]> {
  const candidates = new Map<string, string>();

  const { data: staffRows } = await supabase
    .from("merchant_staff")
    .select("merchant_id, merchants(stores(id, name))");
  for (const row of (staffRows ?? []) as Record<string, unknown>[]) {
    const merchant = Array.isArray(row.merchants) ? row.merchants[0] : row.merchants;
    const storesRaw = (merchant as { stores?: unknown } | null)?.stores;
    for (const st of (Array.isArray(storesRaw) ? storesRaw : storesRaw ? [storesRaw] : []) as {
      id: string;
      name: string;
    }[]) {
      if (st?.id) candidates.set(st.id, st.name);
    }
  }

  const { data: kitchenIds } = await supabase.rpc("my_kitchen_owner_ids");
  const ownedKitchens = ((kitchenIds as string[] | null) ?? []).filter((id) => !candidates.has(id));
  if (ownedKitchens.length > 0) {
    const { data: rows } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", ownedKitchens);
    for (const st of (rows ?? []) as { id: string; name: string }[]) {
      candidates.set(st.id, st.name);
    }
  }

  const ids = [...candidates.keys()];
  if (ids.length === 0) return [];

  // The authorities. food_kitchens and events are the same tables
  // marketplace_stores excludes on, so a store's kind here and its treatment on
  // the storefront can never disagree.
  const [{ data: kitchenRows }, { data: eventRows }, { data: tradeRows }] = await Promise.all([
    supabase.from("food_kitchens").select("store_id").in("store_id", ids),
    supabase.from("events").select("store_id").in("store_id", ids),
    supabase.from("trade_providers").select("store_id").in("store_id", ids),
  ]);
  const kitchens = new Set(((kitchenRows ?? []) as { store_id: string }[]).map((r) => r.store_id));
  const events = new Set(((eventRows ?? []) as { store_id: string }[]).map((r) => r.store_id));
  const trades = new Set(((tradeRows ?? []) as { store_id: string }[]).map((r) => r.store_id));

  return [...candidates.entries()]
    .map(([id, name]) => ({
      id,
      name,
      // A kitchen that also sells tickets is a kitchen: it cooks every day and
      // runs an event occasionally, so the daily job wins the console.
      // A kitchen that also sells tickets is a kitchen: it cooks every day and
      // runs an event occasionally, so the daily job wins the console. A trade
      // sits below both for the same reason — a car wash that once sold a
      // ticket is still a car wash, but a kitchen that also details cars is
      // primarily feeding people.
      kind: (kitchens.has(id)
        ? "kitchen"
        : events.has(id)
          ? "events"
          : trades.has(id)
            ? "service"
            : "shop") as MerchantKind,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOwnStoreId(supabase: SupabaseClient): Promise<string | null> {
  // A chosen store wins, but only after being checked against the list this
  // person may actually act for — the cookie is client-supplied, so treating it
  // as authoritative would be a store-picker for the whole platform.
  const chosen = (await cookies()).get(STORE_COOKIE)?.value;
  if (chosen) {
    const allowed = await getAccessibleStores(supabase);
    if (allowed.some((st) => st.id === chosen)) return chosen;
  }

  const { data } = await supabase
    .from("merchant_staff")
    .select("merchant_id, merchants(stores(id))")
    .limit(1)
    .maybeSingle();
  // A restaurant owner is not merchant_staff — they are kitchen_staff with
  // role 'owner'. Checked BEFORE giving up, so /merchant works for them.
  if (!data) return getOwnKitchenStoreId(supabase);

  const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
  const storesRaw = merchant?.stores as unknown;
  const storeRow = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  return (storeRow as { id?: string } | undefined)?.id ?? null;
}
