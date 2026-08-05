import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { getOwnStoreId } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { dispatchNotification } from "@/lib/notifications/dispatch";

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
        "fulfillment_method, delivery_fee, delivery_lat, delivery_lng, delivery_instructions, payment_receipt_path, receipt_submitted_at, " +
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
    .select("order_number, customer_id, status")
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
  if (status && status !== current.status && current.customer_id && hasServiceRole()) {
    try {
      const admin = await getPrivileged();
      const { data: authUser } = await admin.auth.admin.getUserById(current.customer_id);
      const email = authUser?.user?.email;
      if (email) {
        const label = STATUS_LABEL[targetStatus as OrderStatus] ?? targetStatus;
        await dispatchNotification({
          recipientType: "customer",
          recipientEmail: email,
          orderNumber: current.order_number,
          type: "order_status_changed",
          title: `Order ${current.order_number}: ${label}`,
          body: `Your order is now: ${label}.`,
        });
      }
    } catch (err) {
      console.error("dispatchNotification failed", err);
    }
  }

  return NextResponse.json(data);
}
