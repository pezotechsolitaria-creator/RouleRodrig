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
  // What the checkout may offer. This deliberately does NOT come from
  // stores.fulfillment: nothing in the product ever writes that column, so its
  // default left every real shop pickup-only. create_order() gates rr_delivery
  // on store_payment_settings.offers_rr_delivery, and this mirrors that so the
  // UI and the RPC agree. Pickup and a customer's own driver are always allowed
  // — both are collections as far as the shop is concerned.
  let fulfillment: { pickup: boolean; delivery: boolean } = { pickup: true, delivery: true };
  for (const line of parsed.data.items) {
    const v = byId.get(line.variantId);
    // Silently drop items that no longer exist (deleted product) — the cart
    // UI shows the remaining valid items rather than erroring the whole cart.
    if (!v || !v.products) continue;
    const store = Array.isArray(v.products.stores) ? v.products.stores[0] : v.products.stores;
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

  // Whether the Roulé Rodrigues delivery network is available for this cart:
  // the shop must take part, and the platform must not have paused delivery.
  // Mirrors create_order()'s gate exactly so the UI never offers an option the
  // RPC will reject.
  const storeId = items[0]?.storeId;
  let offersRrDelivery = false;
  let schedule = null;
  // Is this a FOOD order? Decided here, server-side, from whether the cart's
  // store has a food_kitchens row — never from the route the customer came in
  // by, which they control. /cart and /checkout are shared by both products and
  // take their nouns from this (see lib/food/vocabulary.ts), so a customer
  // buying dinner is never told to "continue shopping" or that "this shop is
  // closed".
  let isFood = false;
  let isEvent = false;
  // WHERE the customer would collect. Returned so checkout can show the place
  // BEFORE payment — the pickup flow used to name the seller and never the
  // address, so people bought food without knowing where to go and get it.
  let pickup: {
    storeName: string | null; address: string | null; hint: string | null;
    lat: number | null; lng: number | null; phone: string | null;
  } | null = null;
  // The value returned when there is no store to ask about (an empty or fully
  // stale cart). Fails closed for the same reason the RPC fallback below does:
  // this object reaches the checkout form, and "cash is fine" is not a safe
  // thing to say when nobody has been asked.
  let payment = { acceptsCash: false, acceptsBankTransfer: false, requiresReceipt: true };
  if (storeId) {
    const [
      { data: pay }, { data: settings }, { data: status },
      { data: kitchen }, { data: event }, { data: store }, { data: kitchenHint },
    ] = await Promise.all([
      // offers_rr_delivery only — the payment columns come from an RPC below.
      supabase
        .from("store_payment_settings")
        .select("offers_rr_delivery")
        .eq("store_id", storeId)
        .maybeSingle(),
      supabase.from("marketplace_settings").select("delivery_enabled").eq("id", "main").maybeSingle(),
      // The SAME function create_order() and quote_order() gate on, so the UI
      // can never offer an option the RPC is about to refuse.
      supabase.rpc("store_schedule_status", { p_store_id: storeId }).single(),
      // food_kitchens is publicly readable for visible stores, so the anon
      // client can answer this without a privileged call.
      supabase.from("food_kitchens").select("store_id").eq("store_id", storeId).maybeSingle(),
      // Same question for ticketing. Both are publicly readable for visible
      // stores, so the anon client can answer without a privileged call.
      supabase.from("events").select("store_id").eq("store_id", storeId).maybeSingle(),
      supabase.from("stores").select("name, address, lat, lng, phone").eq("id", storeId).maybeSingle(),
      supabase.from("food_kitchens").select("pickup_hint").eq("store_id", storeId).maybeSingle(),
    ]);
    isFood = Boolean(kitchen);
    isEvent = Boolean(event);
    if (store) {
      pickup = {
        storeName: (store as { name?: string }).name ?? null,
        address: (store as { address?: string | null }).address ?? null,
        hint: (kitchenHint as { pickup_hint?: string | null } | null)?.pickup_hint ?? null,
        lat: (store as { lat?: number | null }).lat ?? null,
        lng: (store as { lng?: number | null }).lng ?? null,
        phone: (store as { phone?: string | null }).phone ?? null,
      };
    }
    offersRrDelivery = (pay?.offers_rr_delivery ?? true) && (settings?.delivery_enabled ?? false);
    schedule = status ?? null;
    // Which payment methods this shop actually takes. create_order() rejects an
    // unaccepted method with RR009, so without these the form was happily
    // offering Bank transfer — which DEFAULTS TO OFF — at shops that would
    // refuse it. The defaults here mirror the column defaults, so a shop with no
    // settings row behaves the same in the UI as it does in the RPC.
    //
    // requiresReceipt is here for a GUEST-only reason (M21): a receipt is a
    // file upload, storage RLS derives ownership from a session, and a guest
    // has none — so create_order refuses guest bank transfer at these shops
    // with RR009. Surfacing the flag lets the form say so up front instead of
    // letting the customer fill everything in and be refused at the button.
    // Through store_payment_options(), NOT a table read.
    //
    // store_payment_settings is deliberately unreadable by anon and
    // authenticated (M8): it holds bank_name, account_holder and account_number,
    // and a table grant would publish every live shop's bank account —
    // marketplace-wide harvesting of exactly the fields an impersonation scam
    // needs. Column-level revokes cannot help, because a REVOKE on a column is a
    // no-op while a table grant exists.
    //
    // Selecting the table here therefore returned NOTHING for every customer,
    // and the `?? true` / `?? false` defaults below made that silence look like
    // an answer: everyone was shown "Cash" whatever the shop actually accepts,
    // and never offered a transfer even where it was the only method (M83/M84).
    //
    // The RPC returns the three booleans and no bank details. The details stay
    // with store_bank_details(), which releases them only to a customer who
    // already has an order with that shop.
    const { data: opts, error: optsError } = await supabase
      .rpc("store_payment_options", { p_store_id: storeId })
      .maybeSingle();
    if (optsError) console.error("store_payment_options failed", optsError);
    const o = opts as
      | { accepts_cash?: boolean; accepts_bank_transfer?: boolean; require_receipt?: boolean }
      | null;
    // EVERY FALLBACK HERE FAILS CLOSED. `?? true` on cash was the last
    // remnant of the M83/M84 bug in a new form: when the RPC returns nothing —
    // an error, or a store that stopped being visible mid-checkout — that
    // default would offer CASH after M89 turned it off platform-wide, which is
    // the one outcome this whole change exists to prevent. A missing answer is
    // not a yes. The worst case is now "this shop cannot take orders", which is
    // visible and true, instead of a payment method nobody authorised.
    payment = {
      acceptsCash: o?.accepts_cash ?? false,
      acceptsBankTransfer: o?.accepts_bank_transfer ?? false,
      requiresReceipt: o?.require_receipt ?? true,
    };
  }

  return NextResponse.json({ items, fulfillment, offersRrDelivery, schedule, payment, isFood, isEvent, pickup });
}
