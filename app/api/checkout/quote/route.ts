import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { cartItemSchema, FULFILLMENT_METHODS } from "@/lib/schemas/checkout";

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const SUBSCRIPTION_CODE = "RR008";
// Opening hours. quote_order() refuses a closed shop and a shut delivery window
// with these; mapping them lets the checkout form say WHY the price is missing
// instead of showing a bare "Could not price your cart."
const SHOP_CLOSED_CODE = "RR010";
const DELIVERY_WINDOW_CODE = "RR011";

const quoteSchema = z.object({
  storeId: z.string().uuid(),
  items: z.array(cartItemSchema).min(1).max(50),
  fulfillment: z.enum(FULFILLMENT_METHODS),
  deliveryZoneId: z.string().uuid().optional(),
});

// The authoritative price the customer will be charged, computed by the same
// SQL policy (order_amounts) that create_order uses when it actually charges.
// The checkout UI displays THIS and nothing it computed itself — under bank
// transfer the figure on screen is the amount the customer wires, so a
// client-side estimate is not acceptable.
export async function POST(req: NextRequest) {
  const limited = guard(req, "checkout-quote", 60, 60_000);
  if (limited) return limited;

  // GUEST CHECKOUT (M20): no session required.
  //
  // This is the SECOND login wall — easy to miss, because it fails silently:
  // the checkout form simply sits on "Waiting for the shop to confirm your
  // price…" forever, with the Place order button dark and no error shown. A
  // guest could fill the whole form and never learn why they could not buy.
  //
  // Removing the gate discloses nothing that isn't already public: quote_order
  // is a pure pricing function over PUBLIC catalogue data (it never touches
  // auth.uid() — verified) and returns the same figures the product page and
  // cart already show anyone. It is rate-limited at 60/min per IP.
  //
  // quote_order is granted to anon (M20d): it is a pure, STABLE pricing
  // function over PUBLIC catalogue data that never reads auth.uid(), and every
  // figure it returns is already visible on the product page and in
  // /api/cart/resolve. Pricing therefore does not depend on the service-role
  // key — if it did, a missing env var would leave guests staring at
  // "Waiting for the shop to confirm your price…" forever.
  //
  // create_order stays closed to anon by contrast, because it MUTATES.
  const supabase = await createClient();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { data, error } = await supabase
    .rpc("quote_order", {
      p_store_id: parsed.data.storeId,
      p_items: parsed.data.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      p_fulfillment: parsed.data.fulfillment,
      p_zone_id: parsed.data.deliveryZoneId ?? null,
    })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === SUBSCRIPTION_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === SHOP_CLOSED_CODE || error.code === DELIVERY_WINDOW_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("quote_order failed", error);
    return NextResponse.json({ error: "Could not price your cart." }, { status: 500 });
  }

  return NextResponse.json(data);
}
