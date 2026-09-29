import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged } from "@/lib/supabase/admin";
import { isVehicleFree } from "@/lib/availability";
import { audit } from "@/lib/admin/audit";
import { PAYMENT_METHODS } from "@/lib/bookings/in-person";
import { sendInPersonConfirmation, sendInPersonPaymentReceipt } from "@/lib/bookings/in-person-notify";
import { islandToday, receivedAtFor } from "@/lib/admin/booking-money";

// ── ACCEPT A BOOKING THE CUSTOMER PAYS IN PERSON (M220) ─────────────────────
//
// The owner: "accept a booking directly without paying on the website as
// people tend to pay on cash by hand". He was doing it with the 'Confirmed'
// pill, which on this desk means "the bank transfer arrived" — so the customer
// was told nothing in writing, every reminder printed a balance that assumed a
// deposit nobody paid, and the cash, when it came, could not be recorded.
//
// Three actions, one route, for rentals AND stays/activities/tours:
//   confirm  — confirmed, pays in person. Holds the vehicle/slot, clears any
//              pay-by deadline, emails the customer what to bring. Optionally
//              records cash taken at the same moment (a deposit at the counter).
//   payment  — money received (cash by default): a ledger row dated the day it
//              changed hands (M222), the running total, and — unless the owner
//              says not to — a receipt for THIS payment.
//   no_show  — they never came: cancelled, marked, no refund language anywhere.
//
// The database does the deciding (admin_confirm_in_person,
// admin_record_booking_payment, admin_mark_no_show — M220, service role only);
// this route adds what SQL cannot: the vehicle clash check, the audit trail and
// the customer's email.

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const bodySchema = z.object({
  kind: z.enum(["vehicle", "place"]),
  id: z.string().uuid(),
  action: z.enum(["confirm", "payment", "no_show"]),
  /** WHOLE RUPEES. confirm: cash taken now (optional); payment: required. */
  amountRupees: z.number().int().positive().max(10_000_000).optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  note: z.string().trim().max(300).optional(),
  /** Confirm even though the vehicle looks taken — for a known duplicate request. */
  force: z.boolean().optional(),
  /**
   * payment: the island day the money changed hands, YYYY-MM-DD (M222). Cash
   * from August recorded today must not be receipted "received today".
   */
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the day the money was received.").optional(),
  /** payment: email the customer a receipt. Default yes; the desk turns it off for old cash. */
  notify: z.boolean().optional(),
});

/**
 * SQLSTATEs the M220 functions raise with a sentence written for the owner —
 * including M222's "The customer says they already sent a transfer", which
 * the desk must print word for word (it tells him what to check).
 */
function mapRpcError(error: { code?: string; message: string }) {
  if (error.code === "RR003") return NextResponse.json({ error: error.message }, { status: 404 });
  if (error.code === "RR004" || error.code === "RR005") {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
  }
  console.error("in-person booking action failed", error);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  const { kind, id, action, amountRupees, method, note, force, receivedOn, notify } = parsed.data;
  const admin = await getPrivileged();
  const entityType = kind === "vehicle" ? "booking" : "place_booking";

  if (action === "confirm") {
    // ── The clash check the old pill never made ──────────────────────────
    // A confirmed booking holds its vehicle unconditionally (lib/holds.ts),
    // so the owner's click is now the only gate. RR-87E663 and RR-BEFCA8 were
    // both confirmed for the same one-unit car on the same dates this way.
    if (kind === "vehicle" && !force) {
      const { data: row, error: readErr } = await admin
        .from("bookings")
        .select("scooter, start_date, end_date")
        .eq("id", id)
        .maybeSingle();
      if (readErr) return mapRpcError(readErr);
      if (!row) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
      const r = row as { scooter: string | null; start_date: string | null; end_date: string | null };
      if (r.scooter && r.start_date && r.end_date) {
        const free = await isVehicleFree(r.scooter, r.start_date, r.end_date, id);
        if (!free) {
          return NextResponse.json(
            {
              error:
                "That vehicle is already held for those dates by another booking. Confirm anyway only if the other one is a duplicate you will cancel.",
              code: "CLASH",
            },
            { status: 409 },
          );
        }
      }
    }

    const { data, error } = await admin.rpc("admin_confirm_in_person", {
      p_kind: kind,
      p_id: id,
      p_cash_now_rupees: amountRupees ?? null,
      p_note: note ?? null,
    });
    if (error) return mapRpcError(error);
    const result = data as { already?: boolean; paid?: number; balance?: number; total?: number | null };

    await audit(admin, {
      action: `${entityType}.confirm_in_person`,
      entityType,
      entityId: id,
      diff: { cashNowRupees: amountRupees ?? 0, balanceRupees: result.balance ?? null, forced: !!force },
    });

    // A repeat press changes nothing and must not email twice.
    if (result.already) return NextResponse.json({ ok: true, result, emailed: false, repeat: true });

    const told = await sendInPersonConfirmation(admin, kind, id);

    // Cash taken at the counter as it was confirmed gets its receipt too.
    let receipt: { emailed: boolean } | null = null;
    if (amountRupees && amountRupees > 0) {
      const { data: pay } = await admin
        .from("booking_payments")
        .select("id")
        .eq("booking_kind", kind)
        .eq("booking_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const paymentId = (pay as { id?: string } | null)?.id;
      if (paymentId) receipt = await sendInPersonPaymentReceipt(admin, kind, id, paymentId);
    }

    return NextResponse.json({ ok: true, result, emailed: told.emailed, hasEmail: told.hasEmail, receipt });
  }

  if (action === "payment") {
    if (!amountRupees) {
      return NextResponse.json({ error: "Enter the amount received." }, { status: 400 });
    }
    // M222: the day it changed hands, as noon on that island day (never later
    // than now — the RPC refuses a future date). Omitted = the RPC's now().
    let receivedAt: string | null = null;
    if (receivedOn) {
      const when = receivedAtFor(receivedOn);
      if (!when.ok) return NextResponse.json({ error: when.error }, { status: 400 });
      receivedAt = when.at;
    }
    const { data, error } = await admin.rpc("admin_record_booking_payment", {
      p_kind: kind,
      p_id: id,
      p_amount_rupees: amountRupees,
      p_method: method ?? "cash",
      p_note: note ?? null,
      p_received_at: receivedAt,
    });
    if (error) return mapRpcError(error);
    const result = data as { paymentId: string; paid: number; balance: number; total: number | null };
    const sendReceipt = notify !== false;

    await audit(admin, {
      action: `${entityType}.payment`,
      entityType,
      entityId: id,
      diff: {
        amountRupees,
        method: method ?? "cash",
        receivedOn: receivedOn ?? islandToday(),
        receiptRequested: sendReceipt,
        paidAfterRupees: result.paid,
        balanceAfterRupees: result.balance,
      },
    });

    // The owner may choose no receipt — for cash weeks old, an email saying
    // "received" long after the customer went home (M222). Said back as a
    // choice, never as "no email on file".
    if (!sendReceipt) {
      return NextResponse.json({ ok: true, result, emailed: false, hasEmail: null, receiptSkipped: true });
    }
    const receipt = await sendInPersonPaymentReceipt(admin, kind, id, result.paymentId);
    return NextResponse.json({ ok: true, result, emailed: receipt.emailed, hasEmail: receipt.hasEmail });
  }

  // no_show
  const { data, error } = await admin.rpc("admin_mark_no_show", { p_kind: kind, p_id: id });
  if (error) return mapRpcError(error);
  await audit(admin, { action: `${entityType}.no_show`, entityType, entityId: id, diff: null });
  // Deliberately no email: a no-show is not a cancellation the customer asked
  // for, and nothing is refunded.
  return NextResponse.json({ ok: true, result: data });
}
