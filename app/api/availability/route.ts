import { NextRequest, NextResponse } from "next/server";
import { getPrivileged } from "@/lib/supabase/admin";

// ── Public: booked date ranges for a scooter (no personal data) ─────
// Returns confirmed + pending ranges so customers can avoid requesting
// dates that are already taken. Only date fields are exposed. Uses the
// privileged client (bookings are locked to admin-only at the DB level).
export async function GET(req: NextRequest) {
  const scooter = req.nextUrl.searchParams.get("scooter");
  const supabase = await getPrivileged();

  let query = supabase
    .from("bookings")
    .select("scooter, start_date, end_date, status")
    .in("status", ["pending", "confirmed"])
    .gte("end_date", new Date().toISOString().split("T")[0]);

  if (scooter) query = query.eq("scooter", scooter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ranges = (data ?? []).map((b) => ({
    scooter: b.scooter,
    start: b.start_date,
    end: b.end_date,
    confirmed: b.status === "confirmed",
  }));
  return NextResponse.json(ranges);
}
