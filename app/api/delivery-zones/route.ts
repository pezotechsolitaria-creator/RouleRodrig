import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// The delivery regions a customer can choose from, with their prices.
// Public and read-only: a shopper needs to see what delivery costs before
// committing, and these are published prices, not secrets. The fee shown here
// is never what gets charged — order_amounts() re-reads it from the same table
// when the order is priced — so a stale or tampered response cannot change the
// amount a customer actually pays.
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const limited = guard(req, "delivery-zones", 120, 60_000);
  if (limited) return limited;

  const supabase = await createClient();

  const [{ data: zones, error }, { data: settings }] = await Promise.all([
    supabase
      .from("delivery_zones")
      .select("id, name, covers, fee")
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("marketplace_settings")
      .select("delivery_enabled, delivery_max_minutes")
      .eq("id", "main")
      .maybeSingle(),
  ]);

  if (error) {
    console.error("list delivery zones failed", error);
    return NextResponse.json({ error: "Could not load delivery areas." }, { status: 500 });
  }

  return NextResponse.json({
    zones: zones ?? [],
    deliveryEnabled: settings?.delivery_enabled ?? false,
    // An upper bound for wording only — Roulé Rodrigues does not promise a
    // delivery time; the customer and driver agree it between themselves.
    maxMinutes: settings?.delivery_max_minutes ?? 120,
  });
}
