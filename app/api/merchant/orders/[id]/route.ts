import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { getOwnStoreId } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { formatPickupCode } from "@/lib/orders/pickup";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { notifyDriversOfNewOffer } from "@/lib/delivery/notify";

const NOT_FOUND_CODE = "RR003";
const ILLEGAL_TRANSITION_CODE = "RR004";
const SAFE_RPC_ERROR_CODE = "P0001";

const patchSchema = z.object({
  // "paid" is reachable from "pending_payment" as of M5 — confirming a
  // cash/manual order that has no online capture step. The RPC's own state
  // machine is still the real enforcement; this only gates which buttons a
  // request can even attempt.
  status: z.enum(["paid", "preparing", "ready_for_pickup", "collected", "cancelled"]).optional(),
  internalNote: z.string().trim().max(2000).optional(),
});

// Full order detail — items, payments, QR pickup status, and internal_notes
// (merchant-only; app/api/customer/orders/[id]/route.ts is a SEPARATE
// handler that never selects this column, rather than one handler trying to
// remember to strip it per caller).
//
// internal_notes is fetched through order_internal_notes() rather than as a
// column, because M7 revoked the column grant: `authenticated` held a
// table-level SELECT on orders, which meant a customer could read the shop's
// private note about their own order straight through PostgREST. The accessor
// is SECURITY DEFINER and checks store staff membership itself.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, customer_id, customer_name, customer_phone, notes, subtotal, discount, tax, total, currency, commission_amount, placed_at, created_at, updated_at, " +
        "fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, payment_receipt_path, receipt_submitted_at, accepted_at, auto_release_at, " +
        "delivery_zones(name), " +
        "order_items(id, product_name, variant_name, sku, unit_price, quantity, line_total), " +
        "payments(id, provider, provider_ref, amount, currency, status, created_at), " +
        "qr_pickup_tokens(id, issued_at, expires_at, redeemed_at)",
    )
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();

  if (error) {
    console.error("get order failed", error);
    return NextResponse.json({ error: "Failed to load order." }, { status: 500 });
  }
  if (!order) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Ownership was already proven by the .eq("store_id", storeId) above; the RPC
  // re-checks it independently anyway. A failure here is not fatal to the page.
  const { data: internalNotes, error: notesError } = await supabase.rpc("order_internal_notes", {
    p_order_id: id,
  });
  if (notesError) console.error("order_internal_notes failed", notesError);

  return NextResponse.json({
    order: Object.assign({}, order, { internal_notes: (internalNotes as string | null) ?? null }),
  });
}

// Status transitions + internal notes both go through update_order_status()
// — the RPC re-verifies store ownership independently and validates the
// transition against the same state machine as lib/orders/status.ts, so
// this route can't be tricked into an illegal transition even if the client
// UI's own button-gating were somehow bypassed.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "merchant-orders-update", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { status, internalNote } = parsed.data;
  if (!status && !internalNote) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Fetched once, used both as the note-only fallback target AND (below) to
  // detect whether this PATCH is a real status change worth notifying the
  // customer about externally — mirrors the RPC's own "only insert an
  // in-app notification when status actually changes" condition.
  const { data: current } = await supabase
    .from("orders")
    .select("order_number, customer_id, customer_email, status, fulfillment_method")
    .eq("id", id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const targetStatus = status ?? current.status;

  const { data, error } = await supabase
    .rpc("update_order_status", { p_order_id: id, p_new_status: targetStatus, p_internal_note: internalNote ?? null })
    .single();

  if (error) {
    if (error.code === NOT_FOUND_CODE) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error.code === ILLEGAL_TRANSITION_CODE) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.code === SAFE_RPC_ERROR_CODE) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("update_order_status unexpected error", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // Best-effort external notification (email today) — never blocks or fails
  // the response. Only fires on a REAL status change, not a note-only edit,
  // same condition the RPC itself uses for the in-app notification row.
  if (status && status !== current.status && hasServiceRole()) {
    // M49 turned this order into a delivery job inside the status update
    // itself; this wakes the drivers it was offered to. It sits ABOVE the
    // customer-email branch on purpose — a guest order with no address on file
    // must still reach a driver, and nesting it below would have made driver
    // alerts depend on the customer having an email.
    if (targetStatus === "ready_for_pickup") {
      await notifyDriversOfNewOffer(id);
    }
    try {
      const admin = await getPrivileged();
      // A guest order has no auth user, so the address on the order IS the
      // customer. Before M28 this branch required customer_id and silently
      // skipped every guest — i.e. the default checkout path got no status
      // email at all, including the one saying their order was ready.
      let email = current.customer_email ?? null;
      if (current.customer_id) {
        const { data: authUser } = await admin.auth.admin.getUserById(current.customer_id);
        email = authUser?.user?.email ?? email;
      }
      if (email) {
        const label = STATUS_LABEL[targetStatus as OrderStatus] ?? targetStatus;
        // The pickup code belongs IN the email: the customer is usually not
        // looking at the site when the shop marks an order ready, and arriving
        // at the counter is the moment they need it. Read with the service
        // role — no client role can see qr_pickup_tokens.code (M28).
        let extra = "";
        // A delivery customer must NOT be told to collect at the shop. The
        // pickup code is meaningless to them — a driver is bringing the order,
        // and the code they need is the delivery PIN on their order page.
        const isRrDelivery = current.fulfillment_method === "rr_delivery";
        if (targetStatus === "ready_for_pickup" && isRrDelivery) {
          extra = " A driver is on the way to collect it. Track it on your order page for the PIN to give them.";
        } else if (targetStatus === "ready_for_pickup") {

          const { data: token } = await admin
            .from("qr_pickup_tokens")
            .select("code")
            .eq("order_id", id)
            .is("redeemed_at", null)
            .gt("expires_at", new Date().toISOString())
            .order("issued_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const code = (token as { code?: string | null } | null)?.code;
          if (code) extra = ` Show this pickup code at the shop to collect it: ${formatPickupCode(code)}`;
        }
        // "Ready for pickup" and "collected" are distinct email types, not
        // generic status noise: the first carries the pickup code the customer
        // needs at the counter, the second closes the order.
        const emailType =
          targetStatus === "ready_for_pickup"
            ? "marketplace_pickup_ready"
            : targetStatus === "collected"
              ? "marketplace_order_completed"
              : "marketplace_order_status";
        await dispatchNotification({
          recipientType: "customer",
          recipientEmail: email,
          orderNumber: current.order_number,
          type: "order_status_changed",
          title: `Order ${current.order_number}: ${label}`,
          body: `Your order is now: ${label}.${extra}`,
          emailType,
          // Per (order, target status): a retried PATCH cannot re-notify, but a
          // genuine later transition still gets its own email.
          idempotencyKey: `${emailType}:${id}:${targetStatus}`,
          orderId: id,
        });
      }
    } catch (err) {
      console.error("dispatchNotification failed", err);
    }
  }

  return NextResponse.json(data);
}
