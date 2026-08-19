import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pushToCustomer } from "@/lib/push/send";
import { guardFoodAdmin, readJson, failed } from "@/lib/food/guard";
import { ORDER_COLUMNS, hydrateOrders, balanceDueOf } from "@/lib/admin/order-hydrate";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { formatPickupCode } from "@/lib/orders/pickup";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { channelsForStatus } from "@/lib/orders/email-policy";
import { audit } from "@/lib/admin/audit";
import { notifyDriversOfNewOffer } from "@/lib/delivery/notify";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";

// The live food order queue.
//
// This is the operational centre of the whole feature: a cooker has no screen,
// so the only place an order becomes real is here. It reads the SAME orders
// table as the merchant dashboard, scoped to kitchen stores, and it moves
// status through admin_update_order_status() (M53) — which exists because
// update_order_status() opens with `if auth.uid() is null then raise` and
// /admin has a cookie session with no Supabase user.

const patchSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum(["paid", "preparing", "ready_for_pickup", "collected", "cancelled"]).optional(),
  internalNote: z.string().trim().max(2000).optional(),
});

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_TRANSITION_CODE = "RR004";
const SAFE_RPC_ERROR_CODE = "P0001";

/** Which statuses count as "still needs someone" for the queue's default view. */
const OPEN_STATUSES = [
  "pending_payment",
  "awaiting_payment_confirmation",
  "paid",
  "preparing",
  "ready_for_pickup",
];

export async function GET(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "open";
  const kitchenId = url.searchParams.get("kitchenId");

  // Kitchen store ids first, so the query is scoped to food and can never show
  // a real merchant's orders to the food operator.
  const { data: kitchens, error: kitchensError } = await admin
    .from("food_kitchens")
    .select("store_id, stores(name)");
  if (kitchensError) return failed(kitchensError, "Failed to load kitchens.");

  // PostgREST returns an embedded to-one as an object on some versions and a
  // one-element array on others, so this is normalised rather than trusted.
  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);
  const kitchenIds = (kitchens ?? []).map((k) => k.store_id as string);
  const kitchenName = new Map(
    (kitchens ?? []).map((k) => [
      k.store_id as string,
      ((one(k.stores) as { name?: string } | null)?.name ?? "Kitchen"),
    ]),
  );

  if (kitchenIds.length === 0) {
    return NextResponse.json({ orders: [], counts: {}, kitchens: [] });
  }

  // No embeds. See lib/admin/order-hydrate.ts — a bad relation name does not
  // degrade a field, it 400s the whole request, and this screen going blank is
  // the difference between the owner running the platform and not.
  let query = admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("store_id", kitchenIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (kitchenId) query = query.eq("store_id", kitchenId);
  if (scope === "open") query = query.in("status", OPEN_STATUSES);

  const { data, error } = await query;
  if (error) return failed(error, "Failed to load orders.");

  const hydrated = await hydrateOrders(admin, (data ?? []) as Record<string, unknown>[]);

  // Counts come from a separate, narrow read of ALL open orders regardless of
  // the current filter — the badge on "Preparing" must not drop to zero just
  // because the operator is looking at one kitchen.
  const { data: countRows } = await admin
    .from("orders")
    .select("status")
    .in("store_id", kitchenIds)
    .in("status", OPEN_STATUSES);
  const counts: Record<string, number> = {};
  for (const row of (countRows ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }


  return NextResponse.json({
    orders: hydrated.map((o) => ({
      id: o.id as string,
      orderNumber: o.order_number as string,
      status: o.status as OrderStatus,
      kitchenId: o.store_id as string,
      kitchenName: kitchenName.get(o.store_id as string) ?? "Kitchen",
      customerName: o.customer_name as string | null,
      customerPhone: o.customer_phone as string | null,
      customerEmail: o.customer_email as string | null,
      notes: o.notes as string | null,
      subtotal: Number(o.subtotal ?? 0),
      deliveryFee: Number(o.delivery_fee ?? 0),
      total: Number(o.total ?? 0),
      currency: (o.currency as string) ?? "MUR",
      fulfillment: o.fulfillment_method as string,
      deliveryZone: o.deliveryZoneName,
      deliveryLat: o.delivery_lat as number | null,
      deliveryLng: o.delivery_lng as number | null,
      deliveryInstructions: o.delivery_instructions as string | null,
      placedAt: (o.placed_at as string) ?? (o.created_at as string),
      autoReleaseAt: o.auto_release_at as string | null,
      // A boolean, not the path: the storage key is minted into a short-lived
      // signed URL on demand rather than shipped to every browser that opens
      // the queue. The admin could not see a proof of payment AT ALL before
      // this — the column was never even selected.
      hasReceipt: Boolean(o.payment_receipt_path),
      // M79 — money still owed on a split payment. Summed from the ledger, the
      // same way the kitchen screen does it, so the two can never disagree.
      balanceDue: balanceDueOf(o),
      receiptSubmittedAt: o.receipt_submitted_at as string | null,
      payment: o.payments[0] ?? null,
      items: o.items,
    })),
    counts,
    kitchens: kitchenIds.map((id) => ({ id, name: kitchenName.get(id) ?? "Kitchen" })),
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { orderId, status, internalNote } = parsed.data;
  if (!status && !internalNote) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: current } = await admin
    .from("orders")
    .select("order_number, customer_id, customer_email, status, store_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // Scope check. The food operator manages FOOD; a shop's order is the
  // merchant's business and must not be reachable from this screen even with a
  // hand-crafted request.
  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", current.store_id as string)
    .maybeSingle();
  if (!isKitchen) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const targetStatus = status ?? (current.status as string);

  const { error } = await admin
    .rpc("admin_update_order_status", {
      p_order_id: orderId,
      p_new_status: targetStatus,
      p_internal_note: internalNote ?? null,
    })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_TRANSITION_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === SAFE_RPC_ERROR_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    return failed(error, "Could not update that order.");
  }

  // Best-effort external notification. Never blocks and never fails the
  // response — the status change is already committed, and an email provider
  // being down must not make the operator think the kitchen was not told.
  if (status && status !== current.status) {
    // The kitchen is a store like any other, so a food order set to
    // `rr_delivery` becomes a delivery job through the same M49 trigger. Kept
    // above the email branch for the same reason as the marketplace route: a
    // driver alert must not depend on the customer having left an address.
    if (targetStatus === "ready_for_pickup") {
      await notifyDriversOfNewOffer(orderId);

      // The kitchen's name, read here because the GET handler's lookup map is
      // out of scope in this request.
      const { data: kitchenStore } = await admin
        .from("stores")
        .select("name")
        .eq("id", current.store_id as string)
        .maybeSingle();
      const readyKitchenName = (kitchenStore as { name?: string } | null)?.name ?? "the kitchen";

      // THE ONE WhatsApp a kitchen order sends. Every other event on this order
      // reaches the owner by push, which is free and instant; WhatsApp is
      // reserved for the single moment that has to interrupt whatever someone
      // is doing — the food is cooked and going cold. A ping per new order (the
      // old behaviour) buried exactly this message in noise.
      await enqueueNotification({
        type: "food_ready",
        category: "system",
        message: formatWhatsAppMessage({
          title: "Food is ready",
          lines: [
            `Order ${current.order_number} is ready at ${readyKitchenName}.`,
            "https://roulerodrig.com/admin/food",
          ],
        }),
        // One per order, so a status toggled back and forth cannot re-ping.
        dedupeKey: `food:ready:${orderId}`,
        orderId,
      });
    }
    // ── THE CUSTOMER'S OWN PHONE, BEFORE THE EMAIL (M124) ──────────────────
    //
    // Every other party already learned about this status change: the driver
    // by push, the owner by WhatsApp, the customer by EMAIL only. So the one
    // person waiting for the food got the slowest channel on the platform, and
    // one that costs quota — the free tier is ~400 a day shared with Supabase
    // auth mail.
    //
    // Push first, email still after: they are not alternatives. A customer who
    // never granted permission, or is on a desktop that is asleep, must still
    // be told. Failure here is logged and swallowed for the same reason the
    // email is — a notification that throws must not roll back a status the
    // kitchen has already acted on.
    try {
      const pushed = await pushToCustomer(
        {
          email: current.customer_email as string | null,
          userId: current.customer_id as string | null,
        },
        targetStatus === "ready_for_pickup"
          ? {
              title: "Your food is ready",
              // No pickup code here on purpose: a push sits on a lock screen
              // anyone can read. The code is in the email and on the order.
              body: `Order ${current.order_number} is ready to collect.`,
              url: `/orders/track?ref=${encodeURIComponent(String(current.order_number))}`,
              tag: `order:${orderId}`,
            }
          : {
              title: "Order update",
              body: `Order ${current.order_number} is now ${
                (STATUS_LABEL[targetStatus as OrderStatus] ?? targetStatus).toLowerCase()
              }.`,
              url: `/orders/track?ref=${encodeURIComponent(String(current.order_number))}`,
              tag: `order:${orderId}`,
            },
      );
      if (pushed === 0) {
        // Not an error — most customers never subscribe. Logged so "they said
        // they never got told" can be answered with a fact.
        console.info("food order push: no subscribed device", orderId);
      }
    } catch (err) {
      console.error("food order push failed", err);
    }

    try {
      let email = (current.customer_email as string | null) ?? null;
      if (current.customer_id) {
        const { data: authUser } = await admin.auth.admin.getUserById(current.customer_id as string);
        email = authUser?.user?.email ?? email;
      }
      if (email) {
        const label = STATUS_LABEL[targetStatus as OrderStatus] ?? targetStatus;
        // The pickup code belongs IN the email. The customer is almost never
        // looking at the site at the moment food becomes ready, and arriving at
        // the kitchen is exactly when they need it.
        let extra = "";
        if (targetStatus === "ready_for_pickup") {
          const { data: token } = await admin
            .from("qr_pickup_tokens")
            .select("code")
            .eq("order_id", orderId)
            .is("redeemed_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("issued_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const code = (token as { code?: string | null } | null)?.code;
          if (code) extra = ` Show this pickup code at the kitchen: ${formatPickupCode(code)}`;

          // WHERE to collect, in the email itself. This is the message that
          // says "your food is ready" — a customer reading it on a phone,
          // about to leave the house, needs the address more than anything
          // else on the screen. Sending only a code told them WHEN to go and
          // never WHERE, which is the gap the owner reported.
          const { data: place } = await admin
            .from("stores")
            .select("name, address, lat, lng")
            .eq("id", current.store_id as string)
            .maybeSingle();
          const { data: kitchen } = await admin
            .from("food_kitchens")
            .select("pickup_hint")
            .eq("store_id", current.store_id as string)
            .maybeSingle();

          const where = [
            (place as { name?: string } | null)?.name,
            (kitchen as { pickup_hint?: string | null } | null)?.pickup_hint,
            (place as { address?: string | null } | null)?.address,
          ]
            .map((x) => x?.trim())
            .filter(Boolean)
            .join(" — ");
          if (where) extra += ` Collect from: ${where}.`;

          const lat = (place as { lat?: number | null } | null)?.lat;
          const lng = (place as { lng?: number | null } | null)?.lng;
          if (lat != null && lng != null) {
            extra += ` Directions: https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
          }
        }
        // Push always; email only for the three statuses that leave something
        // the customer needs later. See lib/orders/email-policy.ts for why.
        const channels = channelsForStatus(targetStatus);

        const emailType =
          targetStatus === "ready_for_pickup"
            ? "marketplace_pickup_ready"
            : targetStatus === "collected"
              ? "marketplace_order_completed"
              : "marketplace_order_status";
        await dispatchNotification({
          channels,
          recipientType: "customer",
          recipientEmail: email,
          orderNumber: current.order_number as string,
          type: "order_status_changed",
          title: `Order ${current.order_number}: ${label}`,
          body: `Your order is now: ${label}.${extra}`,
          emailType,
          orderId,
          // Per (order, target status): a retried PATCH cannot re-email the
          // customer, but a genuine later transition still gets its own.
          idempotencyKey: `food-status:${orderId}:${targetStatus}`,
        });
      }
    } catch (err) {
      console.error("food order status notification failed", err);
    }
  }

  // Order status moves money and stock; every one of them is trail-worthy.
  await audit(admin, {
    action: "order.status",
    entityType: "order",
    entityId: orderId,
    diff: { from: current.status, to: targetStatus },
  });

  return NextResponse.json({ ok: true, status: targetStatus });
}

/**
 * A short-lived link to a buyer's proof of transfer, for the operator.
 *
 * The bucket is private and stays private. Scoped to KITCHEN stores by the same
 * check the PATCH uses, so this screen cannot be turned into a reader for a
 * real merchant's receipts.
 */
export async function PUT(req: NextRequest) {
  const gate = await guardFoodAdmin(req);
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const parsed = z.object({ orderId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { data: order } = await admin
    .from("orders")
    .select("payment_receipt_path, store_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", (order as { store_id: string }).store_id)
    .maybeSingle();
  if (!isKitchen) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const path = (order as { payment_receipt_path?: string | null }).payment_receipt_path;
  if (!path) return NextResponse.json({ error: "No receipt was uploaded." }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from("order-receipts")
    .createSignedUrl(path, 300);
  if (error || !signed?.signedUrl) {
    console.error("sign food receipt failed", error);
    return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
