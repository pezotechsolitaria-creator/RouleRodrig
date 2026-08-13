import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { RIDE_SERVICES } from "@/lib/rides/model";

// ── WHAT WILL THIS COST? ────────────────────────────────────────────────────
//
// The number shown on the booking screen before anyone commits. It comes from
// quote_ride() — the SAME function create_ride_request() calls when the booking
// is actually written — so the price on the screen and the price on the ride can
// never disagree. The client is told a number it cannot influence.
//
// Read-only and cheap, so the rate limit is loose: a customer dragging a pin
// around the map re-quotes on every move, and that is the point.

export const dynamic = "force-dynamic";

const quoteSchema = z.object({
  service: z.enum(RIDE_SERVICES),
  pickupLat: z.number().min(-90).max(90).nullable().optional(),
  pickupLng: z.number().min(-180).max(180).nullable().optional(),
  dropoffLat: z.number().min(-90).max(90).nullable().optional(),
  dropoffLng: z.number().min(-180).max(180).nullable().optional(),
  passengers: z.number().int().min(1).max(20).default(1),
  luggage: z.number().int().min(0).max(20).default(0),
  when: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const limited = guard(req, "ride-quote", 60, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const v = parsed.data;

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("quote_ride", {
    p_service: v.service,
    p_pickup_lat: v.pickupLat ?? null,
    p_pickup_lng: v.pickupLng ?? null,
    p_dropoff_lat: v.dropoffLat ?? null,
    p_dropoff_lng: v.dropoffLng ?? null,
    p_passengers: v.passengers,
    p_luggage: v.luggage,
    p_when: v.when ?? null,
  });
  if (error) {
    console.error("quote_ride failed", error);
    return NextResponse.json({ ok: false, reason: "error" }, { status: 500 });
  }
  // `{ok:false, reason:'quote_on_request'}` is a real answer, not a failure —
  // private hire has no formula on purpose. 200 with a message the screen shows.
  return NextResponse.json(data);
}
