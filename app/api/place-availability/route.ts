import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { HOLDING_STATUSES, isActiveHold } from "@/lib/holds";
import { engineHoldRanges } from "@/lib/reservations/server";

// ── Public: booked date ranges for a Stay·Eat·Do listing (no personal data) ──
// Powers the independent live calendar shown on each listing's booking form.
//
// Two sources, one shape. place_bookings: every status that CAN hold
// (HOLDING_STATUSES — "approved" was missing, so an approved, unpaid booking
// held its date in the owner's eyes and nowhere on the calendar), decided by
// isActiveHold. The reservation engine (M240): confirmed-and-later holds,
// until a payment deadline passes.
export async function GET(req: NextRequest) {
  const place = req.nextUrl.searchParams.get("place");
  const supabase = await getPrivileged();

  let query = supabase
    .from("place_bookings")
    .select("place_id, start_date, end_date, status, created_at, quantity, time_slot, deposit_paid_at, deposit_amount, payment_due_by")
    .in("status", [...HOLDING_STATUSES])
    .gte("end_date", new Date().toISOString().split("T")[0]);

  if (place) query = query.eq("place_id", place);

  const [{ data, error }, engine] = await Promise.all([query, engineHoldRanges(place)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop expired pending holds so abandoned requests stop blocking the calendar.
  const ranges = (data ?? [])
    .filter((b) => isActiveHold(b))
    .map((b) => ({
      place: b.place_id,
      start: b.start_date,
      end: b.end_date,
      confirmed: b.status === "confirmed",
      quantity: b.quantity ?? 1,
      slot: b.time_slot ?? null,
    }));
  return NextResponse.json([...ranges, ...engine]);
}
