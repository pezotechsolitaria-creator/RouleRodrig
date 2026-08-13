import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { ORDER_COLUMNS, hydrateOrders, balanceDueOf } from "@/lib/admin/order-hydrate";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { formatPickupCode } from "@/lib/orders/pickup";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { channelsForStatus } from "@/lib/orders/email-policy";
import { audit } from "@/lib/admin/audit";
import { notifyDriversOfNewOffer } from "@/lib/delivery/notify";

// ── The marketplace order queue, for the platform owner ────────────────────
//
// The owner: "add the same type of dashboard I added for restaurants in the
// main, with the same function for marketplace — like I can edit all like in
// resto."
//
// Restaurants got two screens: /kitchen for the cook and /admin/food for the
// owner, so a shop that cannot or will not use a computer is still tradeable
// because the owner can run it for them. Marketplace had HALF of that. Sellers
// have /merchant, and the owner had nothing — /admin/stores sets opening hours
// and that is all. A grep of app/api/admin for reads of `orders` or `products`
// returned food, events and subscriptions; no marketplace anywhere. So an
// elderly seller with a phone and no laptop simply could not be onboarded.
//
// This is the missing half. Deliberately the SAME shape as the food desk —
// same statuses, same receipt handling, same balance arithmetic — because the
// owner switches between the two all day and two dialects of one job is how
// mistakes get made.
//
// SCOPE IS THE INVERSE OF THE FOOD DESK. Food scopes to stores that ARE
// kitchens; this scopes to stores that are NOT. The two screens therefore
// partition every store between them, which is what stops this becoming a
// second way to touch a kitchen order and drift from /admin/food.

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
  const gate = await guardAdminApi(req, "The marketplace desk");
  if (gate instanceof NextResponse) return gate;
  const { admin } = gate;

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "open";
  const storeId = url.searchParams.get("storeId");

  const { data: kitchens, error: kErr } = await admin.from("food_kitchens").select("store_id");
  if (kErr) return failed(kErr, "Failed to load shops.");
  const kitchenIds = new Set((kitchens ?? []).map((k) => k.store_id as string));

  const { data: stores, error: sErr } = await admin.from("stores").select("id, name").order("name");
  if (sErr) return failed(sErr, "Failed to load shops.");

  const shops = ((stores ?? []) as { id: string; name: string }[]).filter((s) => !kitchenIds.has(s.id));
  const shopName = new Map(shops.map((s) => [s.id, s.name]));
  const ids = shops.map((s) => s.id);

  if (ids.length === 0) {
    return NextResponse.json({ orders: [], counts: {}, shops: [] });
  }

  // No embeds, same reason as the food desk. See lib/admin/order-hydrate.ts.
  let query = admin
    .from("orders")
    .select(ORDER_COLUMNS)
    .in("store_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);

  if (storeId) query = query.eq("store_id", storeId);
  if (scope === "open") query = query.in("status", OPEN_STATUSES);

  const { data, error } = await query;
  if (error) return failed(error, "Failed to load orders.");

  const hydrated = await hydrateOrders(admin, (data ?? []) as Record<string, unknown>[]);

  // Counts come from a separate, narrow read of ALL open orders regardless of
  // the current filter — the badge on "Preparing" must not drop to zero just
  // because the operator is looking at one shop.
  const { data: countRows } = await admin
    .from("orders")
    .select("status")
    .in("store_id", ids)
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
      storeId: o.store_id as string,
      storeName: shopName.get(o.store_id as string) ?? "Shop",
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
      // the queue.
      hasReceipt: Boolean(o.payment_receipt_path),
      receiptSubmittedAt: o.receipt_submitted_at as string | null,
      // Money still owed on a split payment, summed from the ledger exactly as
      // the kitchen and driver screens do, so the four cannot disagree.
      balanceDue: balanceDueOf(o),
      payment: o.payments[0] ?? null,
      items: o.items,
    })),
    counts,
    shops,
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await guardAdminApi(req, "The marketplace desk");
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
    .select("order_number, customer_id, customer_email, status, store_id, fulfillment_method")
    .eq("id", orderId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  // Scope check, and the mirror image of the food desk's. A kitchen order
  // belongs to /admin/food and must not be reachable from here even with a
  // hand-crafted request — otherwise the two desks become two ways to move the
  // same order and will drift.
  const { data: isKitchen } = await admin
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", current.store_id as string)
    .maybeSingle();
  if (isKitchen) return NextResponse.json({ error: "Order not found." }, { status: 404 });

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
  // response — the status change is already committed, and a mail provider
  // having a bad minute must not make the operator think nothing happened.
  if (status && status !== current.status) {
    // Sits ABOVE the customer-email branch on purpose: a guest order with no
    // address on file must still reach a driver, and nesting it below would
    // make driver alerts depend on the customer having an email.
    if (targetStatus === "ready_for_pickup") {
      await notifyDriversOfNewOffer(orderId);
    }
    try {
      let email = (current.customer_email as string | null) ?? null;
      if (current.customer_id) {
        const { data: authUser } = await admin.auth.admin.getUserById(current.customer_id as string);
        email = authUser?.user?.email ?? email;
      }
      if (email) {
        const label = STATUS_LABEL[targetStatus as OrderStatus] ?? targetStatus;
        let extra = "";
        const isRrDelivery = (current as { fulfillment_method?: string }).fulfillment_method === "rr_delivery";
        if (targetStatus === "ready_for_pickup" && isRrDelivery) {
          extra = " A driver is on the way to collect it. Track it on your order page for the PIN to give them.";
        } else if (targetStatus === "ready_for_pickup") {
          // The pickup code belongs IN the email: the customer is usually not
          // looking at the site when a shop marks an order ready, and arriving
          // at the counter is the moment they need it.
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
          if (code) extra = ` Show this pickup code at the shop to collect it: ${formatPickupCode(code)}`;

          const { data: place } = await admin
            .from("stores")
            .select("name, address, lat, lng")
            .eq("id", current.store_id as string)
            .maybeSingle();
          const where = [
            (place as { name?: string } | null)?.name,
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
        const emailType =
          targetStatus === "ready_for_pickup"
            ? "marketplace_pickup_ready"
            : targetStatus === "collected"
              ? "marketplace_order_completed"
              : "marketplace_order_status";
        await dispatchNotification({
          channels: channelsForStatus(targetStatus),
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
          idempotencyKey: `shop-status:${orderId}:${targetStatus}`,
        });
      }
    } catch (err) {
      console.error("marketplace order status notification failed", err);
    }
  }

  // Order status moves money and stock; every one of them is trail-worthy.
  await audit(admin, {
    action: "order.status",
    entityType: "order",
    entityId: orderId,
    diff: { from: current.status, to: targetStatus, desk: "marketplace" },
  });

  return NextResponse.json({ ok: true, status: targetStatus });
}

/**
 * A short-lived link to a buyer's proof of transfer, for the operator.
 *
 * The bucket is private and stays private. Scoped by the same not-a-kitchen
 * check the PATCH uses, so this cannot become a reader for kitchen receipts.
 */
export async function PUT(req: NextRequest) {
  const gate = await guardAdminApi(req, "The marketplace desk");
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
  if (isKitchen) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const path = (order as { payment_receipt_path?: string | null }).payment_receipt_path;
  if (!path) return NextResponse.json({ error: "No receipt was uploaded." }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from("order-receipts")
    .createSignedUrl(path, 300);
  if (error || !signed?.signedUrl) {
    console.error("sign marketplace receipt failed", error);
    return NextResponse.json({ error: "Could not open that receipt." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
