import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import type { checkoutGroupsSchema } from "@/lib/schemas/checkout";
import { claimAndNotifyOrderPlaced } from "@/lib/notifications/order-placed";

// ── Placing a bag that spans several shops (M99) ────────────────────────────
//
// A sibling of the single-seller handler in ./route.ts rather than a branch
// tangled through it, because the two differ in exactly one place — which RPC
// they call — and everything around that (identity, refusal codes, the
// best-effort notification) has to stay identical or the two paths start
// telling customers different things about the same failure.
//
// The RPC does the real work: create_order_group() calls create_order() once
// per shop inside ONE transaction, so every price, stock lock, opening-hours
// gate and refusal code is the same code that has always run — and a refusal
// from the third shop means the first two orders never existed.

type GroupedCheckout = z.infer<typeof checkoutGroupsSchema>;

const NOT_FOUND_CODE = "RR003";
const VALIDATION_CODE = "RR005";
const UNAVAILABLE_CODE = "RR006";
const STOCK_CODE = "RR007";
const SUBSCRIPTION_CODE = "RR008";
const METHOD_NOT_ACCEPTED_CODE = "RR009";
const SHOP_CLOSED_CODE = "RR010";
const DELIVERY_WINDOW_CODE = "RR011";
const PRICE_CHANGED_CODE = "RR012";
const TOO_MANY_OPEN_CODE = "RR013";
const REFERENCE_CODE = "RR014";
const SAFE_RPC_ERROR_CODE = "P0001";

type PlacedOrder = {
  orderId: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  total: number;
  currency: string;
  deliveryFee: number;
};

export async function placeOrderGroup(input: GroupedCheckout): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Identity, resolved exactly as the single-seller path resolves it (M20/M21).
  const isGuest = !user;
  if (isGuest && !input.guestEmail) {
    return NextResponse.json(
      { error: "Enter your email so we can send your order confirmation." },
      { status: 400 },
    );
  }
  if (isGuest && !hasServiceRole()) {
    console.error("checkout: SUPABASE_SERVICE_ROLE_KEY missing — guest checkout unavailable");
    return NextResponse.json(
      { error: "Guest checkout is temporarily unavailable. Please sign in to complete your order." },
      { status: 503 },
    );
  }
  const rpcClient = isGuest ? await getPrivileged() : supabase;

  const { data, error } = await rpcClient.rpc("create_order_group", {
    p_groups: input.groups.map((g) => ({
      store_id: g.storeId,
      items: g.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      fulfillment: g.fulfillment,
      delivery_zone_id: g.deliveryZoneId ?? null,
      // NOT a price the client dictates — create_order still derives every
      // amount itself. This is the total the customer was looking at for THIS
      // shop, and the RPC refuses the whole bag (RR012) if what it derives
      // disagrees. Per shop, because a price only ever moves in one of them.
      expected_total: g.expectedTotal ?? null,
    })),
    p_customer_name: input.customerName,
    p_customer_phone: input.customerPhone,
    p_provider: input.provider,
    p_notes: input.notes ?? null,
    p_delivery_lat: input.deliveryLat ?? null,
    p_delivery_lng: input.deliveryLng ?? null,
    p_delivery_instructions: input.deliveryInstructions ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_guest_email: isGuest ? input.guestEmail : null,
  });

  if (error) {
    // The RPC's messages are written for the customer, and every one of them
    // now names a shop where it matters, so they are passed through unchanged.
    const code = error.code;
    if (code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    // 409 everywhere below: the request was well formed and a SHOP's state
    // refused it. A 4xx that reads as "you did it wrong" would be untrue.
    if (
      code === SUBSCRIPTION_CODE ||
      code === METHOD_NOT_ACCEPTED_CODE ||
      code === UNAVAILABLE_CODE ||
      code === STOCK_CODE ||
      code === SHOP_CLOSED_CODE ||
      code === DELIVERY_WINDOW_CODE ||
      code === PRICE_CHANGED_CODE ||
      code === TOO_MANY_OPEN_CODE
    ) {
      return NextResponse.json({ error: error.message, code }, { status: 409 });
    }
    // Transient by construction: a fresh attempt draws new order numbers.
    if (code === REFERENCE_CODE) return NextResponse.json({ error: error.message, code }, { status: 503 });
    if (code === SAFE_RPC_ERROR_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("create_order_group unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const result = data as { groupId: string; orders: PlacedOrder[]; total: number; replayed: boolean };
  const orders = result.orders ?? [];

  // M17's exactly-once notification, once PER ORDER — each shop has to be told
  // about its own order, and each claim is independent. Best-effort by
  // construction: the orders are already committed and no email failure may
  // fail or roll back this response.
  //
  // Sequential rather than Promise.all: this is a handful of orders, and a
  // burst of parallel sends against the same rate-limited mail provider is how
  // the last one silently goes missing.
  for (const o of orders) {
    try {
      await claimAndNotifyOrderPlaced(rpcClient, {
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        storeId: o.storeId,
        total: o.total,
        provider: input.provider,
        fulfillment: input.groups.find((g) => g.storeId === o.storeId)?.fulfillment ?? "pickup",
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: (isGuest ? input.guestEmail : user?.email) ?? null,
        isGuest,
      });
    } catch (err) {
      console.error("claimAndNotifyOrderPlaced failed", o.orderNumber, err);
    }
  }

  return NextResponse.json({ ...result, isGuest });
}
