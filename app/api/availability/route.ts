import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { isActiveHold, HOLDING_STATUSES } from "@/lib/holds";
import { blocksOverlapping } from "@/lib/availability/blocks";

// ── Public: booked date ranges for a scooter (no personal data) ─────
// Returns confirmed + pending ranges so customers can avoid requesting
// dates that are already taken. Only date fields are exposed. Uses the
// privileged client (bookings are locked to admin-only at the DB level).
export async function GET(req: NextRequest) {
  const scooter = req.nextUrl.searchParams.get("scooter");
  const supabase = await getPrivileged();

  let query = supabase
    .from("bookings")
    .select(
      "scooter, start_date, end_date, status, created_at, deposit_paid_at, payment_due_by",
    )
    .in("status", [...HOLDING_STATUSES])
    .gte("end_date", new Date().toISOString().split("T")[0]);

  if (scooter) query = query.eq("scooter", scooter);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop expired pending holds so abandoned requests stop blocking the calendar.
  const ranges = (data ?? [])
    .filter((b) => isActiveHold(b))
    .map((b) => ({
      scooter: b.scooter,
      start: b.start_date,
      end: b.end_date,
      confirmed: b.status === "confirmed",
    }));
  // ── THE OFFLINE HALF OF THE TRUTH ─────────────────────────────
  // Until this existed, the calendar could only know about dates a customer had
  // booked THROUGH THE SITE. A scooter lent to a friend or rented over the
  // counter showed as free, which is precisely the "12 September looks
  // available but it is gone" the owner reported.
  //
  // The reason is deliberately NOT exposed. A customer needs to know a date is
  // taken; where the owner's scooter actually is, is nobody else's business.
  const today = new Date().toISOString().split("T")[0];
  const blocks = await blocksOverlapping(
    today,
    "2100-01-01",
    scooter ?? undefined,
  );
  if (blocks === null) {
    // Fail closed rather than quietly showing an over-optimistic calendar.
    return NextResponse.json(
      { error: "Availability is temporarily unavailable." },
      { status: 503 },
    );
  }

  for (const b of blocks) {
    ranges.push({
      scooter: b.scooter,
      start: b.start_date,
      end: b.end_date,
      // Shown to the customer exactly like a confirmed booking, because to them
      // it is the same fact: the vehicle is not free.
      confirmed: true,
    });
  }

  return NextResponse.json(ranges);
}
