import type { OrderStatus } from "@/lib/orders/status";

// Shapes for the marketplace ops desk. Intentionally the same field names as
// app/admin/food/types.ts, except `kitchen*` becomes `store*` — the owner moves
// between the two desks all day, and two vocabularies for one job is how
// mistakes get made.

export type ShopOrderItem = {
  id: string;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type AdminShopOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  storeId: string;
  storeName: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  notes: string | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  fulfillment: string;
  deliveryZone: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryInstructions: string | null;
  placedAt: string;
  autoReleaseAt: string | null;
  hasReceipt?: boolean;
  receiptSubmittedAt?: string | null;
  /** Cash still to be collected on a split payment. Minor units. */
  balanceDue?: number;
  payment: { provider?: string; status?: string } | null;
  items: ShopOrderItem[];
};

export type ShopVariant = {
  id: string;
  name: string | null;
  sku: string | null;
  price: number;
  stock: number | null;
  lowStockThreshold: number | null;
  isActive: boolean;
};

export type ShopProduct = {
  id: string;
  storeId: string;
  storeName: string;
  name: string;
  status: string;
  currency: string;
  /**
   * Where the marketplace files it. Null means the product is missing from
   * /shop/c/*, from the category tiles and from every category count (M96) —
   * still findable by search, invisible on the path most shoppers take.
   */
  categoryId: string | null;
  variants: ShopVariant[];
};

/**
 * One write helper for the whole desk.
 *
 * Returns a discriminated result instead of throwing, so every caller is forced
 * to decide what the operator sees. A silent `.catch(() => ({}))` is what turned
 * a failing request into an empty panel elsewhere in this codebase, and the
 * owner read the empty panel as "there is no data".
 */
export async function shopWrite(
  url: string,
  init: RequestInit,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (body as { error?: string }).error || "That didn't save." };
    return { ok: true, data: body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "That didn't save." };
  }
}
