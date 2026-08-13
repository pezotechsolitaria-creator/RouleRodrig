import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// Public: list active taxi drivers, featured first, with aggregated ratings.
export async function GET(req: NextRequest) {
  const limited = guard(req, "taxi", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  // ── M96: read through the accessor, never the table ──────────────────────
  //
  // This used to select("*") from taxi_drivers directly and always came back
  // EMPTY — "Aucun chauffeur pour le moment" with two active drivers on file.
  // There is an RLS policy for anon, but no SELECT grant behind it, and a
  // policy without a grant returns no rows and no error.
  //
  // The missing grant was protecting the site, not breaking it: taxi_drivers
  // holds driver_token and whatsapp_api_key, both bearer credentials, and this
  // route asked for every column. Granting anon access would have published
  // each driver's private link and CallMeBot key to anyone opening the network
  // tab. public_taxi_drivers() returns the publishable columns only, so the
  // secrets are absent by construction rather than by remembering to exclude
  // them here.
  const { data, error } = await supabase.rpc("public_taxi_drivers");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The RPC is untyped in the generated client, so name the shape once here
  // rather than sprinkling `any` through the mapping below.
  type PublicDriver = Record<string, unknown> & { id: string };
  const drivers = (data ?? []) as PublicDriver[];

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
