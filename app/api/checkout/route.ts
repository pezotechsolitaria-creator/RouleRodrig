import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guardShared } from "@/lib/rate-limit";
import { checkoutSchema, checkoutGroupsSchema } from "@/lib/schemas/checkout";
import { claimAndNotifyOrderPlaced } from "@/lib/notifications/order-placed";
import { placeOrderGroup } from "./group";

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
// This buyer is already sitting on the maximum number of unpaid, unaccepted
// reservations (M21). The inventory-hoarding control — identity-neutral, so it
// reads the same for a guest and an account holder.
const TOO_MANY_OPEN_CODE = "RR013";
// The order-number retry gave up. Transient by construction: a fresh attempt
// draws new numbers, so the customer should be told to try again, not that
// something is broken.
const REFERENCE_CODE = "RR014";
// The VENUE is full (M58) — distinct from RR007, which is one ticket type
// selling out. Without this the buyer of the last seat is told "Something went
// wrong", which reads as a broken site rather than a sold-out event.
const EVENT_FULL_CODE = "RR017";
const SAFE_RPC_ERROR_CODE = "P0001";

// The only thing trusted from the client here is "which variants, how many,
// and how the customer wants to pay/receive it." create_order() re-derives
// every price from the current DB row, re-validates stock under a row lock,
// and re-checks the store's fulfillment options itself — this route is a
// thin, Zod-validated pass-through, not a second source of truth.
export async function POST(req: NextRequest) {
  const limited = await guardShared(req, "checkout", 10, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // ── ONE CHECKOUT, SEVERAL SELLERS (M99) ──────────────────────────────────
  // Recognised by the shape of the request. The single-seller path below is
  // untouched — food, ticketing and any older client still post `storeId` and
  // still get exactly what they got before. A bag with several shops posts
  // `groups` and is placed by create_order_group(), which calls the SAME
  // create_order() once per shop inside ONE transaction: either every order
  // exists or none does.
  if (body && typeof body === "object" && Array.isArray((body as { groups?: unknown }).groups)) {
    const grouped = checkoutGroupsSchema.safeParse(body);
    if (!grouped.success) {
      return NextResponse.json(
        { error: grouped.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    }
    return placeOrderGroup(grouped.data);
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const {
    storeId, items, customerName, customerPhone, fulfillment, notes, provider,
    deliveryLat, deliveryLng, deliveryInstructions, deliveryZoneId, deliverySizeClass, expectedTotal, idempotencyKey,
    guestEmail, pickupDate, pickupTime,
  } = parsed.data;

  // ── Guest checkout (M20) ───────────────────────────────────────────────────
  // The login wall used to live on the line above. It is gone, but the identity
  // rules are stricter than before, not looser:
  //
  //  * SIGNED IN  → the request runs on the CUSTOMER'S OWN session, so
  //    auth.uid() is set inside create_order and RLS applies exactly as before.
  //    guestEmail is ignored; the address is read from auth.users server-side.
  //  * GUEST      → a validated email is mandatory, and the call runs through
  //    the service-role client because create_order is deliberately NOT granted
  //    to `anon`. That keeps order creation unreachable from the public API
  //    surface: the only way in is this route, which is rate-limited (10/min)
  //    and Zod-validated. Every price, stock lock and refusal code inside the
  //    RPC is untouched by which client calls it.
  const isGuest = !user;
  if (isGuest && !guestEmail) {
    return NextResponse.json(
      { error: "Enter your email so we can send your order confirmation." },
      { status: 400 },
    );
  }
  if (isGuest && !hasServiceRole()) {
    // Guest checkout structurally cannot work without the key. Fail loudly
    // rather than silently sending guests back to a login wall.
    console.error("checkout: SUPABASE_SERVICE_ROLE_KEY missing — guest checkout unavailable");
    return NextResponse.json(
      { error: "Guest checkout is temporarily unavailable. Please sign in to complete your order." },
      { status: 503 },
    );
  }
  const rpcClient = isGuest ? await getPrivileged() : supabase;

  // ── M161 · A FOOD ORDER CAN SAY WHEN ──────────────────────────────────────
  // Both or neither, enforced here rather than in the schema so a half-filled
  // picker degrades to ASAP instead of 400-ing a customer who never saw the
  // control. create_food_order is a NEW signature beside create_order, not a
  // replacement: shop and event checkout reach the untouched 14-arg function
  // on exactly the path they always did.
  const wantsSlot = Boolean(pickupDate && pickupTime);

  const orderArgs = {
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
      // For a guest the replay is matched on (email, key) instead of
      // (customer_id, key), since customer_id is null and NULL <> NULL.
      p_idempotency_key: idempotencyKey ?? null,
      // Ignored by the RPC whenever auth.uid() is set — see the identity block
      // at the top of create_order.
      p_guest_email: isGuest ? guestEmail : null,
  };

  const { data, error } = await rpcClient
    .rpc(
      wantsSlot ? "create_food_order" : "create_order",
      wantsSlot
        // The window is re-derived and re-checked inside the RPC; these two
        // are a REQUEST, not a decision. RR030 comes back if it is not a slot
        // the kitchen would have offered.
        ? { ...orderArgs, p_pickup_date: pickupDate, p_pickup_time: pickupTime }
        : orderArgs,
    )
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === VALIDATION_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.code === SUBSCRIPTION_CODE || error.code === METHOD_NOT_ACCEPTED_CODE) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // M161: "The kitchen is closed then." / "That time has passed." The RPC
    // writes these for the customer, so they are passed through unchanged.
    if (error.code === "RR030") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.code === UNAVAILABLE_CODE || error.code === STOCK_CODE) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // 409 for the same reason as stock: the request was well formed, the
    // event's state refused it. The message already names how many are left.
    if (error.code === EVENT_FULL_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
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
    // 409, not 429: the request rate is fine, the buyer's outstanding
    // reservations are what refuses it. A 429 would invite a client retry loop
    // that can never succeed.
    if (error.code === TOO_MANY_OPEN_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error.code === REFERENCE_CODE) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
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

  // ── "This one needs a car" ────────────────────────────────────────────────
  //
  // Written AFTER create_order rather than through it, on purpose. create_order
  // is the price-integrity RPC (RR012): every amount is derived inside it, and
  // its signature is the narrow, audited surface a checkout may touch. Size
  // affects DISPATCH ELIGIBILITY and nothing else — no fee, no total — so
  // widening that signature would push a non-monetary field through the one
  // function whose entire job is refusing to be told what to charge.
  //
  // There is nothing to gain by lying either way: the customer does not ride in
  // the vehicle and the price does not move. It is a statement about the
  // parcel, not a lever on the order.
  //
  // Best-effort, like the notification below it: the order is committed and
  // paid. A delivery that lands as 'standard' is offered to the whole fleet,
  // which is exactly today's behaviour — a worse dispatch, never a lost order.
  if (fulfillment === "rr_delivery" && deliverySizeClass === "large") {
    try {
      await rpcClient.from("orders").update({ delivery_size_class: "large" }).eq("id", order.order_id);
    } catch (err) {
      console.error("delivery_size_class update failed", err);
    }
  }

  try {
    // The claim runs on the SAME client that created the order: a signed-in
    // buyer claims through their own session (auth.uid() proves ownership), a
    // guest through the service role — which is the only principal that can
    // reach a guest order, since customer_id is null and there is no session to
    // match it against. See claim_order_notification's ownership rule.
    await claimAndNotifyOrderPlaced(rpcClient, {
      orderId: order.order_id,
      orderNumber: order.order_number,
      storeId,
      total: order.total,
      provider,
      fulfillment,
      customerName,
      customerPhone,
      // A guest has no auth.users row, so the address comes from the validated
      // request; a signed-in buyer's comes from their session, never the body.
      customerEmail: (isGuest ? guestEmail : user?.email) ?? null,
      isGuest,
    });
  } catch (err) {
    console.error("claimAndNotifyOrderPlaced failed", err);
  }

  // `isGuest` lets the confirmation page offer account creation with this
  // address — the post-purchase prompt — without the client having to guess.
  return NextResponse.json({ ...(data as object), isGuest });
}
