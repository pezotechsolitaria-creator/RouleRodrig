import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";
import { isActiveHold } from "@/lib/holds";

// ── Public: booked date ranges for a Stay·Eat·Do listing (no personal data) ──
// Powers the independent live calendar shown on each listing's booking form.
export async function GET(req: NextRequest) {
  const place = req.nextUrl.searchParams.get("place");
  const supabase = await getPrivileged();

  let query = supabase
    .from("place_bookings")
    .select("place_id, start_date, end_date, status, created_at")
    .in("status", ["pending", "confirmed"])
    .gte("end_date", new Date().toISOString().split("T")[0]);

  if (place) query = query.eq("place_id", place);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Drop expired pending holds so abandoned requests stop blocking the calendar.
  const ranges = (data ?? [])
    .filter((b) => isActiveHold(b))
    .map((b) => ({
      place: b.place_id,
      start: b.start_date,
      end: b.end_date,
      confirmed: b.status === "confirmed",
    }));
  return NextResponse.json(ranges);
}
