import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { paypalConfigured, captureOrder } from "@/lib/paypal";
import { guard } from "@/lib/rate-limit";

// Captures an approved PayPal order and — ONLY if PayPal confirms the capture is
// COMPLETED — marks the booking's deposit as paid and confirms it. The browser's
// "approved" is never trusted; the truth comes from PayPal's capture response.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: "Card payment is not available yet." }, { status: 503 });
  }
  const limited = guard(req, "paypal-capture", 12, 60_000);
  if (limited) return limited;

  let body: { orderID?: string; bookingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const orderID = (body.orderID ?? "").toString().trim();
  const bookingId = (body.bookingId ?? "").toString().trim();
  if (!orderID || !bookingId) return NextResponse.json({ error: "Missing details." }, { status: 400 });

  const supabase = await getPrivileged();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, deposit_paid_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.deposit_paid_at) {
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
  await supabase
    .from("bookings")
    .update({
      deposit_paid_at: new Date().toISOString(),
      paypal_capture_id: result.captureId,
      status: "confirmed",
    })
    .eq("id", bookingId);

  return NextResponse.json({ ok: true });
}
