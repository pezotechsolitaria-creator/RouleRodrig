import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { audit } from "@/lib/admin/audit";
import { SITE_URL } from "@/lib/site";
import { offerMessage, RIDE_SERVICES, OPEN_RIDE_STATUSES, type RideService } from "@/lib/rides/model";

// ── THE TAXI & TRANSFER DESK'S BACKEND ──────────────────────────────────────
//
// Same auth posture as every /api/admin route: the signed password cookie IS the
// boundary, and the service role is how the reads and RPC calls land. ride_offers
// has RLS on with no policy and ride_requests has no SELECT policy at all, so
// there is no other way to reach any of this.
//
// Every state change goes through an RPC, never a bare table write: the atomic
// assignment and the status graph live in Postgres, and a route that bypassed
// them would be the "separate unsafe pathway" the brief warns about.

function authed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}
function unconfigured() {
  return NextResponse.json(
    { error: "Admin backend is not configured (SUPABASE_SERVICE_ROLE_KEY is unset)." },
    { status: 503 },
  );
}

const createSchema = z.object({
  service: z.enum(RIDE_SERVICES),
  whenKind: z.enum(["now", "scheduled"]).default("now"),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  pickupLabel: z.string().trim().min(2).max(200),
  pickupLat: z.number().min(-90).max(90).nullable().optional(),
  pickupLng: z.number().min(-180).max(180).nullable().optional(),
  dropoffLabel: z.string().trim().min(2).max(200),
  dropoffLat: z.number().min(-90).max(90).nullable().optional(),
  dropoffLng: z.number().min(-180).max(180).nullable().optional(),
  passengers: z.number().int().min(1).max(60).default(1),
  luggage: z.number().int().min(0).max(60).default(0),
  notes: z.string().trim().max(1000).optional(),
  flightRef: z.string().trim().max(40).optional(),
  arrivalAt: z.string().datetime({ offset: true }).nullable().optional(),
  meetGreet: z.boolean().default(false),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(5).max(40),
  customerEmail: z.string().trim().email().max(160).optional().or(z.literal("")),
  // Minor units. Set by the operator here — the pricing engine is a later phase,
  // and a guessed number would be worse than an asked-for one.
  quotedPrice: z.number().int().min(0).max(100_000_00).nullable().optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dispatch"), rideId: z.string().uuid(), minutes: z.number().int().min(1).max(120).default(10) }),
  z.object({ action: z.literal("assign"), rideId: z.string().uuid(), driverId: z.string().uuid() }),
  z.object({ action: z.literal("status"), rideId: z.string().uuid(), status: z.string().max(20), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("sweep") }),
]);

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return unconfigured();

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "open";
  const rideId = url.searchParams.get("rideId");
  const admin = await getPrivileged();

  // Candidates for ONE ride: the ranked list, including who was skipped and why,
  // so an operator can see the decision rather than trust it.
  if (rideId) {
    const [ride, candidates, offers, events] = await Promise.all([
      admin.from("ride_requests").select("*").eq("id", rideId).maybeSingle(),
      admin.rpc("ride_candidates", { p_request_id: rideId, p_stage: 99, p_limit: 40 }),
      admin.from("ride_offers")
        .select("id, driver_id, status, offered_at, expires_at, responded_at, taxi_drivers(name, whatsapp, phone)")
        .eq("request_id", rideId).order("offered_at", { ascending: false }),
      admin.from("ride_events").select("action, from_status, to_status, detail, created_at, actor_type")
        .eq("request_id", rideId).order("created_at", { ascending: false }).limit(40),
    ]);
    return NextResponse.json({
      ride: ride.data ?? null,
      candidates: candidates.data ?? [],
      offers: offers.data ?? [],
      events: events.data ?? [],
    });
  }

  let q = admin.from("ride_requests")
    .select("id, service, when_kind, scheduled_at, pickup_label, dropoff_label, passengers, luggage, " +
            "customer_name, customer_phone, quoted_price, currency, status, driver_id, offer_rounds, " +
            "created_at, assigned_at, taxi_drivers(name, phone, whatsapp)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (scope === "open") q = q.in("status", OPEN_RIDE_STATUSES);

  const [rides, drivers] = await Promise.all([
    q,
    // The roster, with the operational fields dispatch actually needs. Surfaced
    // here so the desk can warn about drivers who cannot be ranked yet.
    admin.from("taxi_drivers")
      .select("id, name, phone, whatsapp, vehicle, vehicle_type, seats, base_label, base_lat, base_lng, " +
              "active, availability, handles_taxi, handles_airport, handles_transfer, " +
              "rides_offered, rides_accepted, rides_completed, rides_declined, last_offered_at")
      .order("name"),
  ]);
  if (rides.error) {
    console.error("admin rides list failed", rides.error);
    return NextResponse.json({ error: "Failed to load rides." }, { status: 500 });
  }

  return NextResponse.json({ rides: rides.data ?? [], drivers: drivers.data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return unconfigured();

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const v = parsed.data;
  if (v.whenKind === "scheduled" && !v.scheduledAt) {
    return NextResponse.json({ error: "A scheduled ride needs a date and time." }, { status: 400 });
  }

  const admin = await getPrivileged();
  const { data, error } = await admin.from("ride_requests").insert({
    service: v.service,
    when_kind: v.whenKind,
    scheduled_at: v.scheduledAt ?? null,
    pickup_label: v.pickupLabel,
    pickup_lat: v.pickupLat ?? null,
    pickup_lng: v.pickupLng ?? null,
    dropoff_label: v.dropoffLabel,
    dropoff_lat: v.dropoffLat ?? null,
    dropoff_lng: v.dropoffLng ?? null,
    passengers: v.passengers,
    luggage: v.luggage,
    notes: v.notes || null,
    flight_ref: v.flightRef || null,
    arrival_at: v.arrivalAt ?? null,
    meet_greet: v.meetGreet,
    customer_name: v.customerName,
    customer_phone: v.customerPhone,
    customer_email: v.customerEmail || null,
    quoted_price: v.quotedPrice ?? null,
  }).select("id").single();

  if (error) {
    console.error("ride create failed", error);
    return NextResponse.json({ error: "Could not save that ride." }, { status: 500 });
  }
  await audit(admin, { action: "ride.create", entityType: "ride_request", entityId: data.id,
    diff: { service: v.service, passengers: v.passengers } });
  return NextResponse.json({ ok: true, rideId: data.id });
}

export async function PATCH(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasServiceRole()) return unconfigured();

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const p = parsed.data;
  const admin = await getPrivileged();

  if (p.action === "sweep") {
    const { data, error } = await admin.rpc("sweep_ride_offers");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (p.action === "dispatch") {
    const { data, error } = await admin.rpc("offer_ride", { p_request_id: p.rideId, p_minutes: p.minutes });
    if (error) {
      // RR091 means the ride already moved on — a real answer, not a fault.
      const code = error.code === "RR091" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status: code });
    }

    // Build the WhatsApp links here rather than in the browser: the message text
    // is the dispatch channel and belongs next to the model that defines it.
    const { data: ride } = await admin.from("ride_requests")
      .select("service, pickup_label, dropoff_label, passengers, when_kind, scheduled_at, quoted_price")
      .eq("id", p.rideId).maybeSingle();

    const targets = ((data as { targets?: Record<string, unknown>[] })?.targets ?? []).map((t) => {
      const digits = String(t.whatsapp ?? "").replace(/\D/g, "");
      const text = offerMessage({
        driverName: String(t.name ?? "driver"),
        service: (ride?.service ?? "taxi") as RideService,
        pickup: ride?.pickup_label ?? "",
        dropoff: ride?.dropoff_label ?? "",
        passengers: Number(ride?.passengers ?? 1),
        whenText: ride?.when_kind === "scheduled" && ride?.scheduled_at
          ? new Date(ride.scheduled_at).toLocaleString("en-GB", { timeZone: "Indian/Mauritius" })
          : "Now",
        price: (ride?.quoted_price as number | null) ?? null,
        acceptUrl: `${SITE_URL}/r/${t.token}`,
      });
      return {
        name: t.name, whatsapp: digits,
        // One tap per driver. The owner sends it; we never post to WhatsApp on
        // his behalf, so nothing leaves the platform without a human pressing it.
        waUrl: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
        acceptUrl: `${SITE_URL}/r/${t.token}`,
      };
    });

    await audit(admin, { action: "ride.dispatch", entityType: "ride_request", entityId: p.rideId,
      diff: { stage: (data as { stage?: number })?.stage, offered: targets.length } });
    return NextResponse.json({ ...(data as object), targets });
  }

  if (p.action === "assign") {
    const { data, error } = await admin.rpc("admin_assign_ride", { p_request_id: p.rideId, p_driver_id: p.driverId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "RR092" ? 400 : 500 });
    await audit(admin, { action: "ride.assign_manual", entityType: "ride_request", entityId: p.rideId,
      diff: { driverId: p.driverId } });
    return NextResponse.json(data);
  }

  // status
  const { data, error } = await admin.rpc("admin_set_ride_status", {
    p_request_id: p.rideId, p_status: p.status, p_reason: p.reason ?? null,
  });
  if (error) {
    // RR093 is an illegal transition — the graph refusing, not a crash.
    return NextResponse.json({ error: error.message }, { status: error.code === "RR093" ? 409 : 500 });
  }
  await audit(admin, { action: "ride.status", entityType: "ride_request", entityId: p.rideId,
    diff: { to: p.status } });
  return NextResponse.json(data);
}
