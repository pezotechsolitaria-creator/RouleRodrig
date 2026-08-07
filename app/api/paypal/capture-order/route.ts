import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import {
  paypalConfigured, captureOrder, captureRefusalReason, resolvePaidAmountMur, murToEur, withPayPalFee,
} from "@/lib/paypal";
import { guard } from "@/lib/rate-limit";
import { isVehicleFree } from "@/lib/availability";
import { sendVehicleUnavailableEmail } from "@/lib/email";
import { getContent } from "@/lib/content";

// Captures an approved PayPal order and — ONLY if PayPal confirms the capture is
// COMPLETED — marks the booking's deposit as paid and confirms it. The browser's
// "approved" is never trusted; the truth comes from PayPal's capture response.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: "Card payment is not available yet." }, { status: 503 });
  }
  const limited = guard(req, "paypal-capture", 12, 60_000);
  if (limited) return limited;

  let body: { orderID?: string; bookingId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orderID = (body.orderID ?? "").toString().trim();
  const bookingId = (body.bookingId ?? "").toString().trim();
  // VEHICLE RENTALS AND PLACE BOOKINGS ONLY. Marketplace product orders are
  // never settled here — per the marketplace business rules they are paid by
  // cash, bank transfer or merchant QR and confirmed manually by the merchant.
  //
  // A kind:"order" branch used to live here and was a P0: this route is
  // deliberately unauthenticated (PayPal's approval is the only credential),
  // and it holds a service-role client, so any anonymous caller who knew an
  // order UUID from an /orders/[id] URL could POST a junk orderID, force
  // captureOrder() to throw, and have the catch call
  // mark_order_payment_failed() on someone else's order — cancelling it and
  // dumping its reserved stock. The branch is removed rather than patched
  // because marketplace orders must not reach PayPal at all.
  const kind = body.kind === "place" ? "place" : "vehicle";
  if (!orderID || !bookingId) return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const supabase = await getPrivileged();

  // Idempotency pre-check — an already-paid deposit returns success without
  // re-capturing. Both tables share the id + deposit_paid_at shape.
  const existing =
    kind === "place"
      ? await supabase.from("place_bookings").select("id, deposit_paid_at, deposit_amount").eq("id", bookingId).maybeSingle()
      : await supabase
          .from("bookings")
          .select("id, deposit_paid_at, deposit_amount, total_amount, scooter, start_date, end_date")
          .eq("id", bookingId)
          .maybeSingle();
  if (!existing.data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (existing.data.deposit_paid_at) {
    // Idempotent: already captured on a previous attempt.
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }

  let result;
  try {
    result = await captureOrder(orderID);
  } catch (e) {
    console.error("[paypal] capture", e);
    return NextResponse.json({ error: "Payment could not be confirmed. You have not been charged twice — please contact us." }, { status: 502 });
  }

  if (result.status !== "COMPLETED") {
    return NextResponse.json({ error: `Payment not completed (${result.status}).` }, { status: 402 });
  }

  // ── The payment must belong to THIS booking, and cover what is owed ────────
  // Without this, an approved order was just a bearer token for "some money
  // changed hands": a customer could pay the smallest deposit on a cheap
  // booking, then replay that same orderID against an expensive booking — or a
  // stranger's, whose UUID leaks from a shared confirmation link — and have it
  // confirmed for free. This route is deliberately unauthenticated and holds a
  // service-role client, so PayPal's own reference_id is the ONLY thing that
  // can tie the money to the row we are about to mark paid.
  const owedMur = Number((existing.data as { deposit_amount?: number | null }).deposit_amount);
  let expectedEur: number | null = null;
  if (Number.isFinite(owedMur) && owedMur > 0) {
    try {
      expectedEur = Number(await murToEur(withPayPalFee(owedMur).total));
    } catch (e) {
      // An FX outage must not block a payment PayPal already reference-matched.
      console.error("[paypal] capture amount check skipped (FX unavailable)", e);
    }
  }
  const refusal = captureRefusalReason(result, bookingId, expectedEur);
  if (refusal) {
    console.error(
      `[paypal] capture REFUSED (${refusal}) — order ${orderID} references ${result.referenceId ?? "nothing"}, ` +
        `booking ${bookingId}, captured ${result.amount ?? "?"} ${result.currency ?? "?"}, expected ~€${expectedEur ?? "?"}`,
    );
    const message =
      refusal === "amount"
        ? "The amount paid does not cover this booking's deposit — please contact us."
        : "This payment does not match this booking. It has not been applied — please contact us.";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  // ── Record WHAT WAS PAID, not merely that something was ───────────────────
  // "Pay in full" and "pay the deposit" used to write an identical row, so a
  // customer who paid 100% was still shown a balance due at pickup — and the
  // owner, reading the same row, would ask for it. The amount is derived from
  // the capture itself (see resolvePaidAmountMur): the client never states how
  // much it paid. null means "couldn't be sure", and every reader then falls
  // back to the old deposit display rather than inventing a figure.
  let amountPaidMur: number | null = null;
  const capturedEur = Number(result.amount);
  if (Number.isFinite(capturedEur) && Number.isFinite(owedMur) && owedMur > 0) {
    try {
      const rateEurPerMur = Number(await murToEur(10_000)) / 10_000;
      amountPaidMur = resolvePaidAmountMur(
        capturedEur,
        {
          depositMur: owedMur,
          fullMur: Number((existing.data as { total_amount?: number | null }).total_amount) || null,
        },
        (mur) => mur * rateEurPerMur,
      );
    } catch (e) {
      console.error("[paypal] could not resolve amount paid", e);
    }
  }

  // Payment verified by PayPal → record it and confirm the booking.
  const patch = {
    deposit_paid_at: new Date().toISOString(),
    paypal_capture_id: result.captureId,
    status: "confirmed",
    ...(amountPaidMur !== null ? { amount_paid: amountPaidMur } : {}),
  };
  if (kind === "place") await supabase.from("place_bookings").update(patch).eq("id", bookingId);
  else await supabase.from("bookings").update(patch).eq("id", bookingId);

  // First-to-pay-wins: this deposit just secured the vehicle, so release any
  // OTHER pending, unpaid requests for the same vehicle whose dates are now
  // fully taken — and email those customers that it's gone (they were not
  // charged). Best-effort; never fails the payment.
  if (kind !== "place") {
    try {
      const b = existing.data as { scooter?: string | null; start_date?: string | null; end_date?: string | null };
      if (b.scooter && b.start_date && b.end_date) {
        const { data: rivals } = await supabase
          .from("bookings")
          .select("id, name, email, scooter, start_date, end_date")
          .eq("scooter", b.scooter)
          .eq("status", "pending")
          .is("deposit_paid_at", null)
          .neq("id", bookingId)
          .gte("end_date", b.start_date)
          .lte("start_date", b.end_date);
        const list = (rivals ?? []) as { id: string; name: string | null; email: string | null; scooter: string; start_date: string; end_date: string }[];
        if (list.length) {
          const content = await getContent();
          const vehName = content.fleet.find((f) => f.id === b.scooter || f.name === b.scooter)?.name ?? b.scooter;
          for (const r of list) {
            // Only bump a rival if its dates are now genuinely full (units > 1
            // may still leave room for it).
            if (await isVehicleFree(r.scooter, r.start_date, r.end_date, r.id)) continue;
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", r.id);
            if (r.email) {
              const ref = "RR-" + r.id.replace(/-/g, "").slice(0, 6).toUpperCase();
              try {
                await sendVehicleUnavailableEmail({ to: r.email, name: r.name, vehicle: vehName, start: r.start_date, end: r.end_date, ref });
              } catch { /* ignore email errors */ }
            }
          }
        }
      }
    } catch (e) {
      console.error("[paypal] release rivals", e);
    }
  }

  return NextResponse.json({ ok: true });
}
