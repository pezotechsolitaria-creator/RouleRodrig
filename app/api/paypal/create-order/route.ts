import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { paypalConfigured, createDepositOrder } from "@/lib/paypal";
import { guard } from "@/lib/rate-limit";
import { isVehicleFree } from "@/lib/availability";

// Creates a PayPal order for a booking's deposit. The amount is read from the
// STORED booking (deposit_amount, in MUR) and converted to EUR server-side —
// the client only sends a booking id, never a price, so it can't be tampered.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: "Card payment is not available yet." }, { status: 503 });
  }
  const limited = guard(req, "paypal-create", 12, 60_000);
  if (limited) return limited;

  let body: { bookingId?: string; kind?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const bookingId = (body.bookingId ?? "").toString().trim();
  // "place" = a Stay·Eat·Do reservation; "order" = a marketplace order;
  // anything else = a vehicle booking.
  const kind = body.kind === "place" ? "place" : body.kind === "order" ? "order" : "vehicle";
  // Vehicles may pay the deposit OR the full total; places are deposit-only.
  const mode = body.mode === "full" ? "full" : "deposit";
  if (!bookingId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });

  const supabase = await getPrivileged();

  // Marketplace orders: the amount is always read from the order's own
  // `total` + its payment row, never trusted from the client — same rule as
  // the booking flow below, just against a different table.
  if (kind === "order") {
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, total, status, payments(status)")
      .eq("id", bookingId)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const paymentStatus = Array.isArray(order.payments) ? order.payments[0]?.status : (order.payments as { status?: string } | null)?.status;
    if (paymentStatus !== "pending" || order.status !== "pending_payment") {
      return NextResponse.json({ error: "This order has already been paid or is no longer payable." }, { status: 409 });
    }
    try {
      const result = await createDepositOrder({
        depositMur: order.total,
        referenceId: order.id,
        description: `Order ${order.order_number}`,
      });
      return NextResponse.json({
        orderID: result.id, eur: result.eur, depositMur: result.depositMur,
        feeMur: result.feeMur, totalMur: result.totalMur, mode: "full",
      });
    } catch (e) {
      console.error("[paypal] create-order (marketplace)", e);
      return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
    }
  }

  // The deposit is always read from the STORED booking, converted to EUR
  // server-side — the client only sends an id (+ kind), never a price.
  let depositMur = NaN;
  let depositPaidAt: string | null = null;
  let description = "Deposit";
  if (kind === "place") {
    const { data } = await supabase
      .from("place_bookings")
      .select("id, place_name, deposit_amount, deposit_paid_at")
      .eq("id", bookingId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    depositMur = Number(data.deposit_amount);
    depositPaidAt = data.deposit_paid_at;
    description = `Deposit — ${data.place_name}`;
  } else {
    const { data } = await supabase
      .from("bookings")
      .select("id, scooter, days, deposit_amount, total_amount, deposit_paid_at, start_date, end_date")
      .eq("id", bookingId)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    // First-to-pay-wins: don't let someone start a payment for a vehicle that was
    // already secured (paid) by another customer for these dates.
    if (!data.deposit_paid_at && !(await isVehicleFree(data.scooter, data.start_date, data.end_date, bookingId))) {
      return NextResponse.json({ error: "Sorry — this vehicle was just booked by someone else for these dates." }, { status: 409 });
    }
    depositPaidAt = data.deposit_paid_at;
    const full = Number(data.total_amount);
    if (mode === "full" && Number.isFinite(full) && full > 0) {
      depositMur = full;
      description = `Full payment — ${data.scooter} · ${data.days} day(s)`;
    } else {
      depositMur = Number(data.deposit_amount);
      description = `Deposit — ${data.scooter} · ${data.days} day(s)`;
    }
  }

  if (depositPaidAt) {
    return NextResponse.json({ error: "This deposit has already been paid." }, { status: 409 });
  }
  if (!Number.isFinite(depositMur) || depositMur <= 0) {
    return NextResponse.json({ error: "No deposit is due for this booking." }, { status: 400 });
  }

  try {
    const order = await createDepositOrder({
      depositMur,
      referenceId: bookingId,
      description,
    });
    return NextResponse.json({
      orderID: order.id,
      eur: order.eur,
      depositMur: order.depositMur,
      feeMur: order.feeMur,
      totalMur: order.totalMur,
      mode,
    });
  } catch (e) {
    console.error("[paypal] create-order", e);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
