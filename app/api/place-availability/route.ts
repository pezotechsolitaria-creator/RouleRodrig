import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";

// ── Public: booked date ranges for a Stay·Eat·Do listing (no personal data) ──
// Powers the independent live calendar shown on each listing's booking form.
export async function GET(req: NextRequest) {
  const place = req.nextUrl.searchParams.get("place");
  const supabase = await getPrivileged();

  let query = supabase
    .from("place_bookings")
    .select("place_id, start_date, end_date, status")
    .in("status", ["pending", "confirmed"])
    .gte("end_date", new Date().toISOString().split("T")[0]);

  if (place) query = query.eq("place_id", place);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranges = (data ?? []).map((b) => ({
    place: b.place_id,
    start: b.start_date,
    end: b.end_date,
    confirmed: b.status === "confirmed",
  }));
  return NextResponse.json(ranges);
}
