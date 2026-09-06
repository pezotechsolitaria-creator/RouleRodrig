import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// The service bookings desk — a tradesperson's diary, NOT a vehicle rental.
//
// ── WHY THIS IS NOT /api/admin/bookings ────────────────────────────────────
// That path was already taken, by the rental bookings route that has served
// scooters since long before this feature existed. Naming this one "bookings"
// silently replaced it, and the mistake was invisible: both are called
// bookings, both are admin, and the build succeeded. "Service" is in the path
// because on this platform "booking" alone has meant a scooter for two years.
//
// This route decides nothing: the RPCs carry the gate and the rules, which is
// why an admin cannot record a booking as done in a way the provider could not.
// Same shape as /api/admin/deliveries.
const NOT_FOUND = "RR003";
const BAD_INPUT = "P0001";

function guard(req: NextRequest): NextResponse | null {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const days = Number(new URL(req.url).searchParams.get("days") ?? "14");
  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("admin_service_bookings", {
    p_days: Number.isFinite(days) ? days : 14,
  });
  if (error) {
    console.error("admin_service_bookings failed", error);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }
  return NextResponse.json(data);
}

const Body = z.object({
  action: z.literal("status"),
  bookingId: z.string().uuid(),
  status: z.enum(["booked", "done", "cancelled", "no_show"]),
});

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = await getPrivileged();
  const { data, error } = await admin.rpc("set_service_booking_status", {
    p_booking_id: parsed.data.bookingId,
    p_status: parsed.data.status,
  });
  if (error) {
    if (error.code === BAD_INPUT) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.code === NOT_FOUND) {
      return NextResponse.json({ error: "That booking is gone." }, { status: 404 });
    }
    console.error("set_service_booking_status failed", error);
    return NextResponse.json({ error: "That did not go through." }, { status: 500 });
  }
  return NextResponse.json(data);
}
