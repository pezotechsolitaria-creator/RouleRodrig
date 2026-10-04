import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "@/lib/admin/audit";
import { keyFields } from "@/lib/admin/audit-delete";
import { bookingReference } from "@/lib/activity";
import { deleteRefusal, type DeletableKind } from "@/lib/admin/booking-delete";

// ── The one DELETE both booking desks go through (architecture review
//    2026-09-30, item 3) ────────────────────────────────────────────────────
//
// app/api/admin/bookings and app/api/admin/place-bookings each hard-deleted
// by id with no check and no trail. Both now call this, which:
//   1. reads the row and counts its booking_payments ledger rows;
//   2. REFUSES (409, one sentence for the owner) a row lib/admin/booking-delete
//      says must be kept — money, a confirmation, a completed or no-show row;
//   3. deletes only if the facts it checked are STILL true — a PayPal capture
//      or a cash entry landing between the read and the delete stamps
//      deposit_paid_at / amount_paid, and then the delete matches nothing;
//   4. writes an audit row with the deleted row's key fields, because after
//      this the audit row is the only trace the booking existed.
//
// Fails CLOSED: a failed read of the row or of the ledger deletes nothing.

const TABLE: Record<DeletableKind, string> = { vehicle: "bookings", place: "place_bookings" };
const ENTITY: Record<DeletableKind, string> = { vehicle: "booking", place: "place_booking" };
const NOUN: Record<DeletableKind, string> = { vehicle: "booking", place: "reservation" };

/** What the trail keeps of a deleted booking: what it was, whose, and when. */
export const DELETED_BOOKING_FIELDS: Record<DeletableKind, readonly string[]> = {
  vehicle: [
    "status", "name", "email", "phone", "scooter", "asset_label", "start_date", "end_date",
    "total_amount", "deposit_amount", "amount_paid", "pay_in_person", "payment_reported_at",
    "payment_receipt_path", "partner_code", "created_at",
  ],
  place: [
    "status", "name", "email", "phone", "place_id", "place_name", "category", "start_date",
    "end_date", "time_slot", "deposit_amount", "amount_paid", "pay_in_person",
    "payment_reported_at", "payment_receipt_path", "created_at",
  ],
};

export async function deleteBookingIfUnpaid(
  admin: SupabaseClient,
  kind: DeletableKind,
  id: string,
): Promise<NextResponse> {
  const table = TABLE[kind];
  const noun = NOUN[kind];

  // `*` rather than a column list: a misspelt column in a select fails the
  // whole request, and every column this reads is optional to the rule.
  const { data: row, error: readErr } = await admin.from(table).select("*").eq("id", id).maybeSingle();
  if (readErr) {
    console.error(`admin delete: could not read the ${noun}`, { id, readErr });
    return NextResponse.json(
      { error: `Could not read this ${noun}, so nothing was deleted. Try again in a moment.` },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ error: `That ${noun} is no longer there. Refresh the list.` }, { status: 404 });
  }

  // The ledger is the one fact the row itself may not show: booking_payments
  // has no foreign key, so nothing in the database stops the orphan (M220).
  const { count, error: ledgerErr } = await admin
    .from("booking_payments")
    .select("id", { count: "exact", head: true })
    .eq("booking_kind", kind)
    .eq("booking_id", id);
  if (ledgerErr) {
    console.error("admin delete: could not read booking_payments", { id, ledgerErr });
    return NextResponse.json(
      { error: `Could not check the payments on this ${noun}, so nothing was deleted. Try again in a moment.` },
      { status: 500 },
    );
  }

  const refusal = deleteRefusal(kind, row, count ?? 0);
  if (refusal) {
    return NextResponse.json(
      { error: refusal.message, refused: { reason: refusal.reason, canCancel: refusal.canCancel } },
      { status: 409 },
    );
  }

  // Only if nothing that decided "deletable" has moved since the read.
  let del = admin
    .from(table)
    .delete()
    .eq("id", id)
    .is("deposit_paid_at", null)
    .is("paypal_capture_id", null)
    .is("payment_reported_at", null)
    .is("no_show_at", null);
  del = row.status == null ? del.is("status", null) : del.eq("status", row.status);
  del = row.amount_paid == null ? del.is("amount_paid", null) : del.eq("amount_paid", row.amount_paid);
  const { data: gone, error } = await del.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!gone || gone.length === 0) {
    return NextResponse.json(
      { error: `This ${noun} changed while you were looking at it, so it was not deleted. Refresh and check it again.` },
      { status: 409 },
    );
  }

  await audit(admin, {
    action: `${ENTITY[kind]}.delete`,
    entityType: ENTITY[kind],
    entityId: id,
    diff: { reference: bookingReference(id), ...keyFields(row as Record<string, unknown>, DELETED_BOOKING_FIELDS[kind]) },
  });
  return NextResponse.json({ ok: true });
}
