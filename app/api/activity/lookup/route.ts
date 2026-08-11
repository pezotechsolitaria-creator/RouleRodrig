import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import {
  bookingReference, classifyReference, vehicleStage, placeStage, orderStage,
  activityLabel, type Activity,
} from "@/lib/activity";
import { STATUS_LABEL, type OrderStatus } from "@/lib/orders/status";
import { vehicleName } from "@/lib/vehicle-name";

// ── ONE LOOKUP FOR EVERY KIND OF ACTIVITY ──────────────────────────────────
//
// A customer had to know which of three pages to visit — /manage-booking for a
// rental, /orders/track for an order, and nothing at all for a place booking —
// and had to know which reference format belonged to which. That is the
// platform's filing system leaking into the customer's job.
//
// This takes ONE reference and ONE email and finds whatever it is.
//
// ── THE SECURITY PROPERTY IT PRESERVES ─────────────────────────────────────
// It is still TWO-FACTOR. The obvious "unified tracking" design — look
// everything up by email alone — would mean anyone who knows a customer's email
// address can read their rentals, their home address on a delivery, and what
// they bought. Knowing one reference must not unlock the others either, so this
// returns ONLY the item that matched, never "everything for this email".
//
// Signed-in customers are a different case and get a real list, because
// auth.uid() actually proves who they are.
//
// Both underlying lookups already do the hard part: lookup_booking() compares
// the email with exact case-insensitive equality (never ILIKE — see M11, where
// email='%' matched every row) and reduces the reference to hex, and
// lookup_order() does the same for order numbers.

export async function POST(req: NextRequest) {
  // Deliberately as tight as the two lookups it wraps: this endpoint is the
  // brute-force surface for both reference spaces at once.
  const limited = guard(req, "activity-lookup", 10, 60_000);
  if (limited) return limited;

  let body: { ref?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ref = (body.ref ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim();
  if (!ref || !email) {
    return NextResponse.json(
      { error: "Enter your reference and the email you used." },
      { status: 400 },
    );
  }

  const supabase = await getPrivileged();
  const guess = classifyReference(ref);
  const today = new Date().toISOString().split("T")[0];

  // Order of attempts follows the guess, but an UNKNOWN reference tries
  // everything rather than being rejected — a customer who mistyped their own
  // reference must not be told it does not exist.
  const tryBooking = guess === "vehicle" || guess === "unknown";
  const tryOrder = guess === "order" || guess === "unknown";

  if (tryBooking) {
    const { data, error } = await supabase.rpc("lookup_booking", { p_ref: ref, p_email: email });
    if (error) {
      console.error("activity lookup: lookup_booking failed", error);
      // A database fault must not be reported as "not found" — that would tell
      // a real customer their booking has vanished.
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    if (data) {
      const b = data as Record<string, unknown>;
      const kind = (b.kind as string) === "place" ? "place" : "vehicle";
      const start = (b.start as string | null) ?? null;
      const end = (b.end as string | null) ?? null;
      const stage =
        kind === "vehicle"
          ? vehicleStage(b.status as string, start, end, today)
          : placeStage(b.status as string, start, end, today, b.depositPaid ? "paid" : null);

      const activity: Activity = {
        kind,
        id: String(b.id),
        reference: bookingReference(String(b.id)),
        // bookings.scooter stores the fleet ID ("burgman") because availability
        // matching needs it, and vehicle-name.ts says plainly that nobody
        // outside the database should ever see that slug. The tracking card is
        // about as outside as it gets.
        title:
          kind === "vehicle"
            ? await vehicleName(String(b.item ?? "Rental"))
            : String(b.item ?? "Booking"),
        provider: kind === "place" ? String(b.item ?? "") : null,
        date: start,
        // amount_paid is the truthful figure: what the customer has actually
        // handed over, not what the total says they will owe.
        amount: (b.amountPaid as number | null) ?? (b.deposit as number | null) ?? null,
        currency: "MUR",
        stage,
        statusLabel: activityLabel(kind, stage),
        href: `/manage-booking?ref=${encodeURIComponent(bookingReference(String(b.id)))}`,
      };
      return NextResponse.json({ activity, raw: b });
    }
  }

  if (tryOrder) {
    const { data, error } = await supabase.rpc("lookup_order", { p_order_number: ref, p_email: email });
    if (error) {
      console.error("activity lookup: lookup_order failed", error);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
    if (data) {
      const o = data as Record<string, unknown>;
      const status = String(o.status ?? "");
      const stage = orderStage(status);
      const activity: Activity = {
        kind: "order",
        id: String(o.id ?? ""),
        reference: String(o.orderNumber ?? ref),
        title: String(o.storeName ?? "Order"),
        provider: (o.storeName as string | null) ?? null,
        date: (o.placedAt as string | null) ?? null,
        amount: (o.total as number | null) ?? null,
        currency: (o.currency as string) ?? "MUR",
        stage,
        statusLabel: activityLabel("order", stage, STATUS_LABEL[status as OrderStatus]),
        href: `/orders/track?ref=${encodeURIComponent(String(o.orderNumber ?? ref))}`,
      };
      return NextResponse.json({ activity, raw: o });
    }
  }

  // One message for "wrong reference" and "wrong email", so this cannot be used
  // to confirm that a given reference exists.
  return NextResponse.json(
    { error: "We couldn't find anything with that reference and email. Check both and try again." },
    { status: 404 },
  );
}
