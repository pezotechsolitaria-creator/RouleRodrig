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
  pickupHint: string | null;
  position: number;
  cookerName: string | null;
  cookerPhone: string | null;
  cookerNotes: string | null;
  dishCount: number;
  liveDishCount: number;
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
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) return { ok: false, error: body?.error || `Request failed (${res.status}).` };
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}
