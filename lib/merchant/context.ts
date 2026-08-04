import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MerchantDashboard = {
  merchantId: string;
  displayName: string;
  status: string;
  store: { id: string; name: string } | null;
  productCount: number;
};

/**
 * Whether the signed-in user already has a shop, and if so, everything the
 * dashboard needs to render — in one round trip via nested PostgREST embeds
 * instead of four sequential queries. RLS (staff_read / stores_public_read /
 * products_public_read) still applies per-table exactly as it would for
 * separate queries; embedding doesn't bypass row security.
 */
export async function getMerchantDashboard(supabase: SupabaseClient): Promise<MerchantDashboard | null> {
  const { data } = await supabase
    .from("merchant_staff")
    .select(
      // Fetch each product's status (not a count(*) embed) so the dashboard
      // can exclude archived (soft-deleted) products from the headline
      // count — a plain products(count) embed counts every row regardless
      // of status, which double-counts a merchant's deleted history.
      "merchant_id, merchants(display_name, status, stores(id, name, products(status)))",
    )
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Supabase types this as an array via the FK relationship name even though
  // it's a single row per staff membership (merchant_id is not-null unique
  // per row) — narrow it defensively rather than assume the shape.
  const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
  if (!merchant) return null;

  const storesRaw = merchant.stores as unknown;
  const storeRow = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  const store = storeRow ? { id: storeRow.id as string, name: storeRow.name as string } : null;

  const productRows = (storeRow?.products as { status?: string }[] | undefined) ?? [];
  const productCount = productRows.filter((p) => p.status !== "archived").length;

  return {
    merchantId: data.merchant_id as string,
    displayName: merchant.display_name as string,
    status: merchant.status as string,
    store,
    productCount,
  };
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

/** Cheap headline count for the dashboard's Orders stat card. */
export async function getOrderCount(supabase: SupabaseClient, storeId: string): Promise<number> {
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId);
  return count ?? 0;
}

/** Cheap existence check for pages that only need to gate on "has a shop yet". */
export async function hasShop(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("merchant_staff").select("merchant_id").limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * The signed-in user's own store id, resolved server-side from their staff
 * membership — never from a client-supplied value. This is the ownership
 * anchor every product API route filters by; RLS is the real backstop, but
 * resolving store_id this way means a query is scoped to "my store" by
 * construction, not by trusting anything the request body claims.
 */
export async function getOwnStoreId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("merchant_staff")
    .select("merchant_id, merchants(stores(id))")
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
  const storesRaw = merchant?.stores as unknown;
  const storeRow = Array.isArray(storesRaw) ? storesRaw[0] : storesRaw;
  return (storeRow as { id?: string } | undefined)?.id ?? null;
}
