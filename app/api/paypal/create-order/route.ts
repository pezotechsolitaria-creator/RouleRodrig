import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { paypalConfigured, createDepositOrder } from "@/lib/paypal";
import { guard } from "@/lib/rate-limit";

// Creates a PayPal order for a booking's deposit. The amount is read from the
// STORED booking (deposit_amount, in MUR) and converted to EUR server-side —
// the client only sends a booking id, never a price, so it can't be tampered.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: "Card payment is not available yet." }, { status: 503 });
  }
  const limited = guard(req, "paypal-create", 12, 60_000);
  if (limited) return limited;

  let body: { bookingId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const bookingId = (body.bookingId ?? "").toString().trim();
  if (!bookingId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });

  const supabase = await getPrivileged();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, scooter, days, deposit_amount, deposit_paid_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.deposit_paid_at) {
    return NextResponse.json({ error: "This deposit has already been paid." }, { status: 409 });
  }
  const depositMur = Number(booking.deposit_amount);
  if (!Number.isFinite(depositMur) || depositMur <= 0) {
    return NextResponse.json({ error: "No deposit is due for this booking." }, { status: 400 });
  }

  try {
    const order = await createDepositOrder({
      depositMur,
      referenceId: booking.id,
      description: `Deposit — ${booking.scooter} · ${booking.days} day(s)`,
    });
    return NextResponse.json({
      orderID: order.id,
      eur: order.eur,
      depositMur: order.depositMur,
      feeMur: order.feeMur,
      totalMur: order.totalMur,
    });
  } catch (e) {
    console.error("[paypal] create-order", e);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
