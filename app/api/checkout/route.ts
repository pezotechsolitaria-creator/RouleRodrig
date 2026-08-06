import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";
import { checkoutSchema } from "@/lib/schemas/checkout";
import { claimAndNotifyOrderPlaced } from "@/lib/notifications/order-placed";

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const UNAVAILABLE_CODE = "RR006";
const STOCK_CODE = "RR007";
const SUBSCRIPTION_CODE = "RR008";
const METHOD_NOT_ACCEPTED_CODE = "RR009";
// Opening hours, raised by store_schedule_status() inside create_order().
// Without these two the RPC's precise refusal fell through to the generic
// handler and the customer was told "Something went wrong" while the shop was
// simply shut — the enforcement worked, the explanation did not.
const SHOP_CLOSED_CODE = "RR010";
const DELIVERY_WINDOW_CODE = "RR011";
// The derived total no longer matches what the customer was shown — a price
// moved between the quote and the button. Never charge it silently.
const PRICE_CHANGED_CODE = "RR012";
const SAFE_RPC_ERROR_CODE = "P0001";

// The only thing trusted from the client here is "which variants, how many,
// and how the customer wants to pay/receive it." create_order() re-derives
// every price from the current DB row, re-validates stock under a row lock,
// and re-checks the store's fulfillment options itself — this route is a
// thin, Zod-validated pass-through, not a second source of truth.
export async function POST(req: NextRequest) {
  const limited = guard(req, "checkout", 10, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to check out." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const {
    storeId, items, customerName, customerPhone, fulfillment, notes, provider,
    deliveryLat, deliveryLng, deliveryInstructions, deliveryZoneId, expectedTotal, idempotencyKey,
  } = parsed.data;

  const { data, error } = await supabase
    .rpc("create_order", {
      p_store_id: storeId,
      p_items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      p_customer_name: customerName,
      p_customer_phone: customerPhone,
      p_fulfillment: fulfillment,
      p_notes: notes ?? null,
      p_provider: provider,
      // GPS is passed through but never trusted for pricing — the RPC decides
      // the delivery fee from marketplace_settings, not from anything here.
      p_delivery_lat: deliveryLat ?? null,
      p_delivery_lng: deliveryLng ?? null,
      p_delivery_instructions: deliveryInstructions ?? null,
      p_delivery_zone_id: deliveryZoneId ?? null,
      // NOT a price the client dictates — create_order still derives every
      // amount itself. This is the total the customer was looking at, and the
      // RPC refuses (RR012) if what it derives disagrees.
      p_expected_total: expectedTotal ?? null,
      // Retries and double-taps carry the same key; create_order returns the
      // order that already exists rather than reserving stock a second time.
      p_idempotency_key: idempotencyKey ?? null,
    })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === SUBSCRIPTION_CODE || error.code === METHOD_NOT_ACCEPTED_CODE) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.code === UNAVAILABLE_CODE || error.code === STOCK_CODE) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // 409, not 400: the request was well formed, the shop's state refused it.
    // The message already names the reason and, for delivery, the alternatives.
    if (error.code === SHOP_CLOSED_CODE || error.code === DELIVERY_WINDOW_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    // 409 with the code so the form can re-quote and show the new figure rather
    // than leaving the customer staring at a price that no longer exists.
    if (error.code === PRICE_CHANGED_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error.code === SAFE_RPC_ERROR_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("create_order unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // M17: exactly-once placement notifications. claim_order_notification()
  // returns true to a single caller per order — an idempotent retry or a
  // concurrent duplicate submit claims false and sends nothing; a failed send
  // releases the claim so the order stays visible as "owed a notification".
  // Best-effort by construction (same shape as the try/catch in
  // app/api/merchant/orders/[id]/route.ts): the order is already committed,
  // and no email failure may ever fail or roll back this response.
  const order = data as { order_id: string; order_number: string; total: number };
  try {
    await claimAndNotifyOrderPlaced(supabase, {
      orderId: order.order_id,
      orderNumber: order.order_number,
      storeId,
      total: order.total,
      provider,
      fulfillment,
      customerName,
      customerPhone,
      customerEmail: user.email ?? null,
    });
  } catch (err) {
    console.error("claimAndNotifyOrderPlaced failed", err);
  }

  return NextResponse.json(data);
}
