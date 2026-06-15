import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// Public: list active taxi drivers, featured first, with aggregated ratings.
export async function GET(req: NextRequest) {
  const limited = guard(req, "taxi", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("taxi_drivers")
    .select("*")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const drivers = data ?? [];

  // Attach approved-review aggregates (avg + count) per driver.
  const { data: reviews } = await supabase
    .from("taxi_driver_reviews")
    .select("driver_id, rating")
    .eq("status", "approved");

  const agg = new Map<string, { sum: number; count: number }>();
  for (const r of reviews ?? []) {
    if (!r.driver_id) continue;
    const a = agg.get(r.driver_id) ?? { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    agg.set(r.driver_id, a);
  }

  const withRatings = drivers.map((d) => {
    const a = agg.get(d.id);
    return {
      ...d,
      rating_avg: a ? Math.round((a.sum / a.count) * 10) / 10 : null,
      rating_count: a ? a.count : 0,
    };
  });

  return NextResponse.json(withRatings);
}
