import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { cartResolveSchema } from "@/lib/schemas/checkout";

export type ResolvedCartItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string | null;
  imageUrl: string | null;
  price: number;
  currency: string;
  stockQuantity: number;
  isActive: boolean;
  productStatus: string;
  storeId: string;
  storeName: string;
  requestedQuantity: number;
};

// The cart itself is just {variantId, quantity} in localStorage — never
// trusted for price or availability. This route re-reads everything live
// from the DB (through the SAME public RLS a product page would use, no
// service role) so the cart UI can show a correct name/price/stock/image
// even if a product changed since it was added. It's read-only and
// intentionally public — no sign-in is required to look at a cart, only to
// actually check out (see /api/checkout).
export async function POST(req: NextRequest) {
  const limited = guard(req, "cart-resolve", 60, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = cartResolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const supabase = await createClient();
  const variantIds = [...new Set(parsed.data.items.map((i) => i.variantId))];

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, name, price, stock_quantity, is_active, " +
        "products(id, name, status, store_id, stores(name, currency, fulfillment), product_media(url, position))",
    )
    .in("id", variantIds);

  if (error) {
    console.error("cart resolve failed", error);
    return NextResponse.json({ error: "Failed to load cart." }, { status: 500 });
  }

  // The untyped Supabase client can't statically parse this 3-level embed
  // (falls back to an unusable GenericStringError type) — same workaround
  // used for CustomerOrderDetail: fetch, then assert the real shape.
  type VariantRow = {
    id: string; name: string | null; price: number; stock_quantity: number; is_active: boolean;
    products: {
      id: string; name: string; status: string; store_id: string;
      stores: (
        { name: string; currency: string; fulfillment: { pickup?: boolean; delivery?: boolean } }
        | { name: string; currency: string; fulfillment: { pickup?: boolean; delivery?: boolean } }[]
        | null
      );
      product_media: { url: string; position: number }[] | null;
    } | null;
  };
  const rows = (data ?? []) as unknown as VariantRow[];
  const byId = new Map(rows.map((v) => [v.id, v]));
  const items: ResolvedCartItem[] = [];
  let fulfillment: { pickup: boolean; delivery: boolean } = { pickup: true, delivery: false };
  for (const line of parsed.data.items) {
    const v = byId.get(line.variantId);
    // Silently drop items that no longer exist (deleted product) — the cart
    // UI shows the remaining valid items rather than erroring the whole cart.
    if (!v || !v.products) continue;
    const store = Array.isArray(v.products.stores) ? v.products.stores[0] : v.products.stores;
    if (store?.fulfillment) {
      fulfillment = { pickup: !!store.fulfillment.pickup, delivery: !!store.fulfillment.delivery };
    }
    const media = (v.products.product_media ?? []).slice().sort((a, b) => a.position - b.position)[0];
    items.push({
      variantId: v.id,
      productId: v.products.id,
      productName: v.products.name,
      variantName: v.name,
      imageUrl: media?.url ?? null,
      price: v.price,
      currency: store?.currency ?? "MUR",
      stockQuantity: v.stock_quantity,
      isActive: v.is_active,
      productStatus: v.products.status,
      storeId: v.products.store_id,
      storeName: store?.name ?? "Shop",
      requestedQuantity: line.quantity,
    });
  }

  return NextResponse.json({ items, fulfillment });
}
