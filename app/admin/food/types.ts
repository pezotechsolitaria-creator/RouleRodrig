// Shapes exchanged between the Food Operations screens and /api/admin/food/*.
// Kept in one file so the four panels cannot drift into four slightly
// different ideas of what a dish looks like.

export type AdminKitchen = {
  storeId: string;
  name: string;
  slug: string;
  tagline: string | null;
  status: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  prepMinutesMin: number;
  prepMinutesMax: number;
  /**
   * M216 — hours ahead this kitchen must be booked (0 = walk-up, 0–72), and
   * how many days ahead customers can book (0–3). Notice can never exceed
   * days × 24: that kitchen would have no bookable time at all.
   */
  minNoticeHours: number;
  preorderDays: number;
  /**
   * marketplace_settings.food_preorder_enabled. While it is off every kitchen
   * is walk-up whatever the two numbers above say, so the card must say so or
   * a saved "24 h notice" would change nothing and read as if it had.
   */
  preorderLive?: boolean;
  pickupHint: string | null;
  position: number;
  /** Halal certification is a property of the kitchen, and of whoever issued it. */
  halalCertified: boolean;
  halalCertifier: string | null;
  /** Last valid day. Past this the catalog stops reporting the kitchen certified. */
  halalCertifiedUntil: string | null;
  cookerName: string | null;
  cookerPhone: string | null;
  cookerNotes: string | null;
  offersRrDelivery: boolean;
  dishCount: number;
  liveDishCount: number;
  /** Accepts at least one payment method. Without it checkout has nothing to offer. */
  hasPayment?: boolean;
  /** Has any opening hours at all. With none, the shop is shut every hour of every day. */
  hasHours?: boolean;
  /**
   * M95 — the PUBLIC number shown on every dish this kitchen cooks.
   *
   * Not cookerPhone: that one is operational and deliberately lives in the
   * RLS-protected ops table. This is the number a customer is invited to
   * message, which since M89 is the only route for a visitor who cannot make
   * a local bank transfer.
   */
  whatsapp?: string | null;
  /**
   * The merchant that owns this kitchen is archived/suspended (M95).
   *
   * store_is_visible() needs the MERCHANT approved as well as the store active,
   * so while this is true the kitchen cannot appear no matter how many times
   * its own status is set to live — which is exactly what happened on 13 Aug.
   */
  merchantArchived?: boolean;
};

export type AdminVariant = {
  id?: string;
  name: string | null;
  price: number;
  stock: number;
  isActive: boolean;
  position: number;
};

export type AdminDish = {
  productId: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  price: number;
  currency: string;
  kitchenId: string;
  kitchenName: string;
  kitchenStatus: string;
  descriptor: string | null;
  spiceLevel: number;
  dietary: string[];
  mealTimes: string[];
  allergens: string | null;
  serves: number | null;
  prepMinutesMin: number | null;
  prepMinutesMax: number | null;
  isSignature: boolean;
  position: number;
  availableDays: number[] | null;
  availableFrom: string | null;
  availableUntil: string | null;
  dailyCapacity: number | null;
  soldOutUntil: string | null;
  soldOutReason: string | null;
  categories: string[];
  stock: number;
  variants: AdminVariant[];
  images: string[];
};

export type AdminFoodCategory = {
  id: string;
  slug: string;
  name: string;
  nameFr: string | null;
  nameCr: string | null;
  emoji: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  dishCount: number;
};

export type AdminOrderItem = {
  id: string;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type AdminFoodOrder = {
  id: string;
  orderNumber: string;
  status: string;
  kitchenId: string;
  kitchenName: string;
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
  /**
   * M216 — the booked 30-minute slot as ISO bounds, or null for an ASAP order.
   * Parsed from orders.pickup_slot on the server, so no screen ever has to
   * read Postgres range text (the shape that silently defeated the merchant
   * home). For a delivery order it is when the food leaves the kitchen.
   */
  pickupFrom: string | null;
  pickupTo: string | null;
  /** M14. Set by accept_order(); an accepted order is never auto-cancelled. */
  acceptedAt: string | null;
  /** A proof of transfer exists. The path itself never leaves the server. */
  hasReceipt?: boolean;
  /** Cash still to be collected on a split payment. Minor units. */
  balanceDue?: number;
  receiptSubmittedAt?: string | null;
  payment: { provider?: string; status?: string } | null;
  items: AdminOrderItem[];
};

/**
 * Every admin write goes through this rather than a bare fetch.
 *
 * The reason is the one already documented on the main dashboard: a `await
 * fetch(...)` with no response check followed by an optimistic state update
 * leaves the screen showing "ready" while the database is untouched — and the
 * operator then tells a customer their food is waiting on the strength of a
 * write that never happened. A 401 from the 30-day session quietly expiring is
 * the most common way that happens.
 */
export async function foodWrite(
  input: string,
  init?: RequestInit,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    // The STATUS travels with the error. A 409 is not a failure — it is the
    // server refusing on purpose and offering an alternative (hide the kitchen
    // rather than delete it), and the caller cannot tell those apart from a
    // message alone.
    if (!res.ok) return { ok: false, error: body?.error || `Request failed (${res.status}).`, status: res.status };
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error.", status: 0 };
  }
}
