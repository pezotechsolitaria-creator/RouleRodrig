import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// ── A DRIVER REPORTS WHERE THEY ARE ─────────────────────────────────────────
//
// THE authorisation boundary for writing a position. The driver's browser
// broadcasts to the trip channel directly (that is the fast path and it costs us
// nothing), but nothing reaches the DATABASE except through here, after this
// route has established who is calling.
//
// ── WHY THE DRIVER ID IS NOT IN THE BODY ────────────────────────────────────
// Because then it would be a claim. Both branches below RESOLVE the driver from
// a credential the caller could not have forged:
//
//   taxi      the driver_token from their bookmarked /d/<token> link, looked up
//             server-side by driver_tracking_context()
//   delivery  auth.uid() on their Supabase session, resolved by current_driver()
//
// A caller cannot name somebody else because there is no parameter in which to
// name them. That is the whole reason record_driver_position() is service_role
// only: it TRUSTS its driver_id argument, so only a caller that has just proved
// identity may supply one.
//
// Rate limited per IP: this is the only unauthenticated-looking surface that
// writes, and a 20-second cadence per driver means a real fleet on this island
// is nowhere near the ceiling.

export const dynamic = "force-dynamic";

type Body = {
  token?: string;
  lat?: number; lng?: number;
  heading?: number | null; speedKmh?: number | null; accuracyM?: number | null;
  trackingStatus?: string;
  tripKind?: "ride" | "delivery" | null;
  tripId?: string | null;
};

const TRACKING_STATUSES = new Set(["online", "en_route_pickup", "at_pickup", "on_trip"]);

export async function POST(req: NextRequest) {
  // 30 writes/minute/IP. A driver sends 3. The headroom is for a household or a
  // hotel behind one NAT, not for a script.
  const limited = guard(req, "tracking-ping", 30, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    return NextResponse.json({ ok: false, error: "Tracking is not configured." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: "Invalid position." }, { status: 400 });
  }

  const admin = await getPrivileged();

  // ── Who is this? ─────────────────────────────────────────────────────────
  let driverKind: "taxi" | "delivery";
  let driverId: string;
  let allowedTripId: string | null = null;

  if (body.token) {
    const { data, error } = await admin.rpc("driver_tracking_context", { p_token: body.token });
    const ctx = data as
      | { ok?: boolean; driverId?: string; trip?: { id?: string } | null }
      | null;
    if (error) {
      console.error("driver_tracking_context failed", error);
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    if (!ctx?.ok || !ctx.driverId) {
      // One message for "no such token" and "token no longer valid" together, so
      // this cannot be used to test whether a guessed token exists.
      return NextResponse.json({ ok: false, error: "This link is not valid." }, { status: 403 });
    }
    driverKind = "taxi";
    driverId = ctx.driverId;
    allowedTripId = ctx.trip?.id ?? null;
  } else {
    // No token → this must be a signed-in delivery driver. The session client
    // carries their cookie, so current_driver() inside the RPC resolves them.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delivery_tracking_context");
    const ctx = data as
      | { ok?: boolean; driverId?: string; trip?: { id?: string } | null }
      | null;
    if (error || !ctx?.ok || !ctx.driverId) {
      return NextResponse.json({ ok: false, error: "Not signed in as a driver." }, { status: 403 });
    }
    driverKind = "delivery";
    driverId = ctx.driverId;
    allowedTripId = ctx.trip?.id ?? null;
  }

  // ── Which trip may this position be attached to? ─────────────────────────
  // The server decides, not the caller. A driver sending someone else's trip id
  // would otherwise publish their own position onto a stranger's tracking map.
  // The only trip a driver may write to is the one the database says is theirs.
  const tripKind = body.tripKind === "ride" || body.tripKind === "delivery" ? body.tripKind : null;
  const tripId = tripKind && body.tripId && body.tripId === allowedTripId ? body.tripId : null;
  const effectiveTripKind = tripId ? tripKind : null;

  const requested = body.trackingStatus ?? "online";
  // A stage only means something while there is a job. Without one, "online".
  const trackingStatus =
    tripId && TRACKING_STATUSES.has(requested) ? requested : "online";

  const { data, error } = await admin.rpc("record_driver_position", {
    p_driver_kind: driverKind,
    p_driver_id: driverId,
    p_lat: lat,
    p_lng: lng,
    p_heading: numOrNull(body.heading),
    p_speed_kmh: numOrNull(body.speedKmh),
    p_accuracy_m: numOrNull(body.accuracyM),
    p_tracking_status: trackingStatus,
    p_trip_kind: effectiveTripKind,
    p_trip_id: tripId,
  });

  if (error) {
    console.error("record_driver_position failed", error);
    return NextResponse.json({ ok: false, error: "Could not save your position." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recordedAt: (data as { recordedAt?: string })?.recordedAt });
}

// ── GOING OFF DUTY ──────────────────────────────────────────────────────────
// Erases the position rather than letting it age out. The other half of "do not
// track drivers forever", and the reason the driver's OFF switch is honest.
export async function DELETE(req: NextRequest) {
  const limited = guard(req, "tracking-clear", 20, 60_000);
  if (limited) return limited;
  if (!hasServiceRole()) return NextResponse.json({ ok: false }, { status: 503 });

  const token = new URL(req.url).searchParams.get("t");
  const admin = await getPrivileged();

  if (token) {
    const { data } = await admin.rpc("driver_tracking_context", { p_token: token });
    const ctx = data as { ok?: boolean; driverId?: string } | null;
    if (!ctx?.ok || !ctx.driverId) return NextResponse.json({ ok: false }, { status: 403 });
    await admin.rpc("clear_driver_position", { p_driver_kind: "taxi", p_driver_id: ctx.driverId });
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("delivery_tracking_context");
  const ctx = data as { ok?: boolean; driverId?: string } | null;
  if (!ctx?.ok || !ctx.driverId) return NextResponse.json({ ok: false }, { status: 403 });
  await admin.rpc("clear_driver_position", { p_driver_kind: "delivery", p_driver_id: ctx.driverId });
  return NextResponse.json({ ok: true });
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
