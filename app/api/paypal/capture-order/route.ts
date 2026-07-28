import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { paypalConfigured, captureOrder } from "@/lib/paypal";
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
  const kind = body.kind === "place" ? "place" : "vehicle";
  if (!orderID || !bookingId) return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const supabase = await getPrivileged();
  // Idempotency pre-check — an already-paid deposit returns success without
  // re-capturing. Both tables share the id + deposit_paid_at shape.
  const existing =
    kind === "place"
      ? await supabase.from("place_bookings").select("id, deposit_paid_at").eq("id", bookingId).maybeSingle()
      : await supabase.from("bookings").select("id, deposit_paid_at, scooter, start_date, end_date").eq("id", bookingId).maybeSingle();
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

  // Payment verified by PayPal → record it and confirm the booking.
  const patch = {
    deposit_paid_at: new Date().toISOString(),
    paypal_capture_id: result.captureId,
    status: "confirmed",
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
