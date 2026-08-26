import { NextRequest, NextResponse } from "next/server";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { guard } from "@/lib/rate-limit";
import { routeBetween } from "@/lib/tracking/routing";
import { activeTarget, type TrackingStatus } from "@/lib/tracking/model";

// ── THE AUTHORITATIVE ANSWER TO "WHERE IS MY DRIVER" ────────────────────────
//
// Every watcher polls this, and every poll re-checks authorisation. Nothing is
// trusted from a previous request: holding a channel key does not get you a
// snapshot, because a key can outlive the reason somebody was given it.
//
// THREE WAYS TO PROVE YOU MAY WATCH, and they are the three that already exist
// on this platform. No new credential type was invented for tracking:
//
//   customer  reference + the phone the ride was booked with — the identical
//             two-factor lookup_ride() check /api/rides/track already uses. A
//             six-hex reference alone must never reveal a stranger's journey.
//   driver    their driver_token. They can watch the job they are on.
//   admin     the ADMIN_PASSWORD session cookie.
//
// Rate limited hard: this is the brute-force surface for the reference space.

export const dynamic = "force-dynamic";

type Body = {
  kind?: "ride" | "delivery";
  ref?: string;
  phone?: string;
  token?: string;
  tripId?: string;
  /** Delivery customer: the order, plus the address it was placed under. */
  orderId?: string;
  /** Deliver Anything customer: the REQUEST, plus the email it was posted
   *  under. A direct job has no order to be identified by. */
  requestId?: string;
  email?: string;
};

type Snapshot = {
  ok: boolean;
  status: TrackingStatus;
  lat: number | null; lng: number | null;
  pickupLat: number | null; pickupLng: number | null;
  dropoffLat: number | null; dropoffLng: number | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  [k: string]: unknown;
};

export async function POST(req: NextRequest) {
  const limited = guard(req, "tracking-trip", 20, 60_000);
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

  const admin = await getPrivileged();

  let tripKind: "ride" | "delivery" | null = null;
  let tripId: string | null = null;

  // ── Admin ────────────────────────────────────────────────────────────────
  if (verifySession(req.cookies.get(COOKIE_NAME)?.value) && body.tripId && body.kind) {
    tripKind = body.kind;
    tripId = body.tripId;
  }

  // ── Driver, by token ─────────────────────────────────────────────────────
  else if (body.token) {
    const { data } = await admin.rpc("driver_tracking_context", { p_token: body.token });
    const ctx = data as { ok?: boolean; trip?: { kind?: string; id?: string } | null } | null;
    if (!ctx?.ok || !ctx.trip?.id) {
      return NextResponse.json({ ok: false, error: "No live job." }, { status: 403 });
    }
    tripKind = "ride";
    tripId = ctx.trip.id;
  }

  // ── Delivery customer, by order + the email it was placed under ─────────
  // The SAME door /api/orders/delivery uses. delivery_view_for_customer is the
  // authority: a signed-in owner, or a guest proving the order with its own
  // email. It returns null for both "no delivery" and "not yours", which is
  // what makes those two indistinguishable from out here.
  else if (body.orderId) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delivery_view_for_customer", {
      p_order_id: body.orderId,
      p_email: body.email ?? null,
    });
    if (error) {
      console.error("delivery_view_for_customer failed", error);
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    const view = data as { tripId?: string; channelKey?: string | null } | null;
    if (!view?.tripId) {
      return NextResponse.json({ ok: false, error: "We couldn't find that." });
    }
    tripKind = "delivery";
    tripId = view.tripId;
  }

  // ── Deliver Anything customer, by request + the email it was posted under ─
  // A direct job has no order, so the orderId door above cannot let them in --
  // which is why the customer of a Deliver Anything delivery could not watch it
  // at all. Same credential shape, same silence: delivery_request_trip returns
  // null for "no such request" and for "not yours" alike.
  else if (body.requestId) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delivery_request_trip", {
      p_request_id: body.requestId,
      p_email: body.email ?? null,
    });
    if (error) {
      console.error("delivery_request_trip failed", error);
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    const trip = data as { tripId?: string } | null;
    if (!trip?.tripId) {
      return NextResponse.json({ ok: false, error: "We couldn't find that." });
    }
    tripKind = "delivery";
    tripId = trip.tripId;
  }

  // ── Customer, by reference + phone ───────────────────────────────────────
  else if (body.ref && body.phone) {
    const { data, error } = await admin.rpc("lookup_ride", {
      p_ref: String(body.ref).trim(),
      p_phone: String(body.phone).trim(),
    });
    if (error) {
      console.error("lookup_ride failed", error);
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    const ride = data as { ok?: boolean; tripId?: string } | null;
    if (!ride?.ok || !ride.tripId) {
      // Deliberately the same answer as "wrong phone": a distinguishable reply
      // would confirm that a guessed reference exists.
      return NextResponse.json({ ok: false, error: "We couldn't find that." });
    }
    tripKind = "ride";
    tripId = ride.tripId;
  }

  if (!tripKind || !tripId) {
    return NextResponse.json({ ok: false, error: "We couldn't find that." }, { status: 400 });
  }

  // The row is created on first need rather than at assignment time, so a trip
  // that predates M109 — or one whose driver has never opened their phone —
  // still answers instead of 404ing.
  await admin.rpc("ensure_trip_tracking", { p_trip_kind: tripKind, p_trip_id: tripId });

  const { data, error } = await admin.rpc("tracking_snapshot", {
    p_trip_kind: tripKind,
    p_trip_id: tripId,
  });
  if (error) {
    console.error("tracking_snapshot failed", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
  const snap = data as Snapshot | null;
  if (!snap?.ok) return NextResponse.json({ ok: false });

  // ── The ETA is computed HERE, not in the browser ─────────────────────────
  // Because the routing provider is server-only (it may one day need a key), and
  // because the dials it uses live in dispatch_settings. `source` travels with
  // the number so the UI can label an approximation as one.
  let eta: { minutes: number; km: number; source: "route" | "approx" } | null = null;
  // The BOOKED journey, pickup to drop-off — separate from `eta` on purpose.
  // Its duration is how long the trip takes, NOT when anybody arrives, and
  // presenting the two as the same number is the kind of false precision this
  // screen exists to avoid.
  let journey: { minutes: number; km: number; source: "route" | "approx" } | null = null;
  let route: [number, number][] | null = null;
  let routeIs: "remaining" | "journey" | null = null;

  // ── WHY THIS IS NOT GATED ON THE DRIVER ─────────────────────────────────
  // It was, and that was the bug: the route — and with it the whole map — only
  // appeared once a driver had transmitted a position. driver_locations has
  // never held a row in production, so no customer had ever seen a road. The
  // journey they booked is known the moment the trip exists; a passenger
  // opening tracking before their driver sets off should see where they are
  // going, not a paragraph explaining that they cannot.
  const { roadFactor, avgSpeedKmh } = await dispatchDials(admin);

  const target = activeTarget(
    snap.status,
    { lat: snap.pickupLat, lng: snap.pickupLng },
    { lat: snap.dropoffLat, lng: snap.dropoffLng },
  );
  const driverIsLive =
    snap.lat != null && snap.lng != null &&
    snap.ageSeconds != null && snap.ageSeconds < snap.staleAfterSeconds;

  if (driverIsLive && target) {
    // The REMAINING leg: where the driver is now, to where they are going. This
    // is the one that carries an arrival ETA, because there is something moving.
    const r = await routeBetween(snap.lat!, snap.lng!, target.lat, target.lng, roadFactor, avgSpeedKmh);
    eta = r.eta;
    route = r.polyline;
    routeIs = "remaining";
  }

  // The whole journey, drawn whenever both ends are known. Used as the map's
  // content before anybody is driving, and as the trip-length figure after.
  if (
    snap.pickupLat != null && snap.pickupLng != null &&
    snap.dropoffLat != null && snap.dropoffLng != null
  ) {
    const j = await routeBetween(
      snap.pickupLat, snap.pickupLng, snap.dropoffLat, snap.dropoffLng,
      roadFactor, avgSpeedKmh,
    );
    journey = j.eta;
    if (!route) {
      route = j.polyline;
      routeIs = "journey";
    }
  }

  return NextResponse.json({ ...snap, eta, journey, route, routeIs });
}

/**
 * road_factor and avg_speed_kmh from dispatch_settings — the same two numbers
 * that rank drivers. Read through a tiny RPC-free select on the service client;
 * cached per-request only, because an owner changing them expects the next
 * screen to agree.
 */
async function dispatchDials(
  admin: Awaited<ReturnType<typeof getPrivileged>>,
): Promise<{ roadFactor: number; avgSpeedKmh: number }> {
  const { data } = await admin
    .from("dispatch_settings")
    .select("road_factor, avg_speed_kmh")
    .eq("id", "main")
    .maybeSingle();
  const row = data as { road_factor?: number | string; avg_speed_kmh?: number } | null;
  return {
    roadFactor: Number(row?.road_factor ?? 1.35),
    avgSpeedKmh: Number(row?.avg_speed_kmh ?? 35),
  };
}
