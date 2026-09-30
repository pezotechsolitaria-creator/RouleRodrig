import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { sendRideEmails } from "@/lib/email";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { SITE_URL } from "@/lib/site";
import { toE164National } from "@/lib/phone";
import {
  RIDE_SERVICES,
  RIDE_SERVICE_META,
  formatRidePrice,
  pickupTimeLabel,
} from "@/lib/rides/model";
import { TRIP_TYPES } from "@/lib/rides/transfer";
import { quoteAirportTransfer } from "@/lib/rides/transfer-server";
import { bookingReachLine, type RosterDriver } from "@/lib/rides/reachability";

// ── THE CUSTOMER'S OWN BOOKING ──────────────────────────────────────────────
//
// The owner: "automatic means it does not require the admin intervention but the
// intervention of clients and driver only." This is the endpoint that removes him
// from the start of a ride — until now every one began with a phone call he typed
// into /admin/rides and priced by hand.
//
// THREE THINGS THIS DOES NOT TRUST:
//  · the price. quote_ride() runs here, server-side, from the coordinates
//    actually submitted. A `price` field in the body is ignored entirely — see
//    RR012, where the marketplace learned that server-derived pricing is not
//    enough on its own unless the charge is recomputed from the request.
//  · the status. A new ride is always 'new', which is what the dispatch cron
//    picks up. A caller cannot book something pre-assigned.
//  · the volume. Rate limited per IP, because a booking form that anyone can POST
//    to is a way to fill a dispatcher's screen with imaginary customers.

export const dynamic = "force-dynamic";

const bookSchema = z.object({
  service: z.enum(RIDE_SERVICES),
  whenKind: z.enum(["now", "scheduled"]).default("now"),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  pickupLabel: z.string().trim().min(2).max(200),
  pickupLat: z.number().min(-90).max(90).nullable().optional(),
  pickupLng: z.number().min(-180).max(180).nullable().optional(),
  // Nullable since M98: private hire ("a driver for the day") has no
  // destination. Deliberately NOT re-implementing the per-service rule here —
  // create_ride_request() owns it and refuses a taxi with no destination, so
  // one authority decides and this cannot drift away from it.
  dropoffLabel: z.string().trim().min(2).max(200).nullable().optional(),
  dropoffLat: z.number().min(-90).max(90).nullable().optional(),
  dropoffLng: z.number().min(-180).max(180).nullable().optional(),
  passengers: z.number().int().min(1).max(20).default(1),
  luggage: z.number().int().min(0).max(20).default(0),
  notes: z.string().trim().max(600).optional(),
  flightRef: z.string().trim().max(40).optional(),
  meetGreet: z.boolean().default(false),
  name: z.string().trim().min(2).max(120),
  // toE164National as the VALIDITY rule, not only the storage step. The form
  // gates its button on this same function, but a form is a convenience —
  // without this refine a direct POST could still store five characters of
  // anything. One function decides on both sides, so they cannot disagree.
  phone: z
    .string()
    .trim()
    .min(5)
    .max(40)
    .refine((p) => toE164National(p) !== null, {
      message:
        "That doesn't look like a number your driver can call. A Mauritian number has 8 digits — check it and try again.",
    }),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  // ── M220 · AN AIRPORT TRANSFER IS BOOKED FROM ITS QUOTE ──────────────────
  // The id of the ride_quotes row the screen showed. create_ride_request()
  // checks it field for field against this booking and refuses a mismatch, so
  // the id is a claim the browser cannot turn into a different price.
  quoteId: z.string().uuid().nullable().optional(),
  tripType: z.enum(TRIP_TYPES).default("one_way"),
  returnAt: z.string().datetime({ offset: true }).nullable().optional(),
  returnFlightRef: z.string().trim().max(40).optional(),
  // What the customer was SHOWN, per leg, in minor units — never charged,
  // only compared. If their quote expired while they typed their name, a fresh
  // quote at the same numbers books silently; a different number comes back
  // to them to confirm instead of being charged unseen.
  shownFares: z.array(z.number().int().min(0).nullable()).max(2).optional(),
})
  .refine((v) => v.tripType === "one_way" || v.service === "airport", {
    path: ["tripType"],
    message: "Return packages are for airport transfers.",
  })
  .refine((v) => v.tripType === "one_way" || !!v.returnAt, {
    path: ["returnAt"],
    message: "Choose when the return trip is.",
  })
  // ── AN ARRIVAL RUN CARRIES ITS FLIGHT OR FERRY NUMBER ─────────────────────
  //
  // Required in the form, and required here too, because the form is a
  // convenience and this is the rule. A driver sent to Plaine Corail without a
  // flight number cannot know the plane is two hours late; he waits, or the
  // customer lands to nobody. The number is what makes the meeting work.
  //
  // RIDE_SERVICE_META.needsArrival is the same flag the form reads, so the two
  // can never disagree about which services this applies to.
  .refine(
    (v) => !RIDE_SERVICE_META[v.service]?.needsArrival || (v.flightRef ?? "").trim().length >= 2,
    { path: ["flightRef"], message: "Tell us the flight or ferry number so your driver can meet you." },
  );

export async function POST(req: NextRequest) {
  // Deliberately tight. A ride is a person and a car; six a minute from one
  // address is not a village booking taxis.
  const limited = guard(req, "ride-book", 6, 60_000);
  if (limited) return limited;

  if (!hasServiceRole()) {
    return NextResponse.json(
      { error: "Bookings are not configured on this environment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Please check the form." },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const admin = await getPrivileged();
  const isReturn = v.service === "airport" && v.tripType === "return";
  const args = {
    p_service: v.service,
    p_when_kind: v.whenKind,
    p_scheduled_at: v.whenKind === "scheduled" ? (v.scheduledAt ?? null) : null,
    p_pickup_label: v.pickupLabel,
    p_pickup_lat: v.pickupLat ?? null,
    p_pickup_lng: v.pickupLng ?? null,
    p_dropoff_label: v.dropoffLabel ?? null,
    p_dropoff_lat: v.dropoffLat ?? null,
    p_dropoff_lng: v.dropoffLng ?? null,
    p_passengers: v.passengers,
    p_luggage: v.luggage,
    p_notes: v.notes ?? null,
    p_flight_ref: v.flightRef ?? null,
    p_meet_greet: v.meetGreet,
    p_customer_name: v.name,
    // ── THE NUMBER THE DRIVER HAS TO RING ──────────────────────────────
    // Stored EXACTLY as typed until now, so "70587837" — how everyone on this
    // island writes a mobile — went in raw and every wa.me and tel: link built
    // from it was dead. On the dispatch screen it then looks like a wrong
    // number when it is a perfectly correct one missing +230.
    //
    // Normalised against Mauritius, so a local number gains its country code
    // and a visitor's "+33…" is left alone. Falls back to the raw text when it
    // cannot be parsed: an unusual number is still worth having, and refusing
    // the booking over its format would be far worse than storing it as given.
    // The refine above guarantees this is non-null; the fallback would only
    // ever store keystrokes the rule had already rejected.
    p_customer_phone: toE164National(v.phone),
    p_customer_email: v.email || null,
    // M220. Ignored by every service but the airport.
    p_quote_id: v.service === "airport" ? (v.quoteId ?? null) : null,
    p_trip_type: isReturn ? "return" : "one_way",
    p_return_at: isReturn ? (v.returnAt ?? null) : null,
    p_return_flight_ref: isReturn ? (v.returnFlightRef || null) : null,
  };

  let { data, error } = await admin.rpc("create_ride_request", args);

  // ── A QUOTE THAT WENT STALE WHILE THEY TYPED ─────────────────────────────
  // RR097 is create_ride_request() refusing the quote: expired (30 minutes is
  // the price list's default), or no longer matching the trip. Re-quote from
  // THIS booking's own details. If every leg comes back at the number the
  // customer was shown, nothing changed for them and the booking goes through;
  // if anything differs, the new quote goes back to the screen to be agreed.
  // `used` is a double submit — the first one booked — and is never retried.
  if (error?.code === "RR097" && v.service === "airport" && error.hint !== "used") {
    const fresh = await quoteAirportTransfer(admin, {
      pickupLat: v.pickupLat ?? null,
      pickupLng: v.pickupLng ?? null,
      dropoffLat: v.dropoffLat ?? null,
      dropoffLng: v.dropoffLng ?? null,
      passengers: v.passengers,
      tripType: isReturn ? "return" : "one_way",
      outboundAt: v.whenKind === "scheduled" ? (v.scheduledAt ?? null) : null,
      returnAt: isReturn ? (v.returnAt ?? null) : null,
    });
    const q = fresh.data as { ok?: boolean; quoteId?: string; legs?: { fare: number | null }[] } | null;
    const freshFares = (q?.legs ?? []).map((l) => l.fare ?? null);
    const shown = v.shownFares ?? [];
    const same =
      !!q?.ok && !!q.quoteId &&
      freshFares.length === shown.length &&
      freshFares.every((f, i) => f === shown[i]);
    if (!same) {
      return NextResponse.json(
        { error: "price_changed", quote: q?.ok ? q : null },
        { status: 409 },
      );
    }
    ({ data, error } = await admin.rpc("create_ride_request", { ...args, p_quote_id: q!.quoteId! }));
  }

  if (error) {
    // RR095 is the function refusing bad input with a sentence a customer can act
    // on ("that time has already passed"), not a crash.
    if (error.code === "RR095") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "RR097") {
      return NextResponse.json(
        { error: error.hint === "used" ? "already_booked" : "price_changed" },
        { status: 409 },
      );
    }
    console.error("create_ride_request failed", error);
    return NextResponse.json(
      { error: "Something went wrong saving that. Please try again." },
      { status: 500 },
    );
  }

  // ── SOMEBODY IS TOLD ───────────────────────────────────────────────────────
  //
  // Until this call, booking a ride was the only purchase on this platform that
  // emailed nobody: the row was written and the request sat there until someone
  // opened /admin/rides. The customer gets a confirmation when they gave an
  // address (the field is optional), and the owner always gets the alert.
  //
  // NEVER BLOCKS OR FAILS THE REQUEST. The ride already exists — the RPC has
  // committed and the reference is minted — so a customer's taxi request must
  // still succeed if Brevo is down. Same guarantee as app/api/bookings.
  const created = (data ?? {}) as {
    reference?: string | null;
    returnReference?: string | null;
    price?: number | null;
    zone?: number | null;
    farePending?: boolean;
    legs?: {
      leg: string;
      price: number | null;
      at: string | null;
      farePending: boolean;
      /** M221 · 'night' | 'evening' | 'group' when the fare is left to the owner. */
      reason?: string | null;
    }[];
  };
  const outboundLeg = created.legs?.find((l) => l.leg === "outbound");
  const returnLeg = created.legs?.find((l) => l.leg === "return");
  // The first leg waiting for a fare says why — the engine's own reason, never
  // inferred from the clock here.
  // When two legs are pending for DIFFERENT reasons (an evening arrival and a
  // night departure, both hand-priced), naming one would misdescribe the other,
  // so the email falls back to its neutral wording (M221 review).
  const pendingReasons = [
    ...new Set((created.legs ?? []).filter((l) => l.farePending).map((l) => l.reason ?? null)),
  ];
  const pendingRaw = pendingReasons.length === 1 ? pendingReasons[0] : null;
  const pendingReason =
    pendingRaw === "night" || pendingRaw === "evening" || pendingRaw === "group" ? pendingRaw : null;
  try {
    await sendRideEmails({
      // M220 · Zone, the second trip of a return package, and a fare the owner
      // still has to set. All absent for every service but the airport.
      zone: created.zone ?? null,
      farePending: created.farePending === true,
      pendingReason,
      legPrice: outboundLeg?.price ?? null,
      returnTrip: returnLeg
        ? {
            reference: created.returnReference ?? null,
            at: returnLeg.at ?? v.returnAt ?? null,
            flightRef: v.returnFlightRef || null,
            price: returnLeg.price ?? null,
            farePending: returnLeg.farePending,
          }
        : null,
      reference: created.reference ?? null,
      service: v.service,
      whenKind: v.whenKind,
      scheduledAt: v.whenKind === "scheduled" ? (v.scheduledAt ?? null) : null,
      pickup: v.pickupLabel,
      dropoff: v.dropoffLabel ?? null,
      passengers: v.passengers,
      luggage: v.luggage,
      // The price the SERVER computed, never one the caller sent — the same rule
      // the RPC follows, so the email cannot quote a number nobody will honour.
      price: created.price ?? null,
      flightRef: v.flightRef ?? null,
      meetGreet: v.meetGreet,
      notes: v.notes ?? null,
      name: v.name,
      phone: v.phone,
      email: v.email || null,
    });
  } catch {
    /* ignore email failures */
  }

  // ── AND EVERY OTHER CHANNEL THE OWNER WATCHES ─────────────────────────────
  //
  // The email above works — email_log shows an owner_ride_alert landing within
  // a second of each of the last two bookings. It was also the ONLY thing a
  // taxi booking did. No WhatsApp, no ntfy, nothing on the phone the owner
  // actually carries: a request arrived and sat in /admin/rides until somebody
  // thought to look.
  //
  // Everything needed already existed. The notification queue has a `rides`
  // category, the worker sends on whatsapp, ntfy and email alike, and three
  // slots — two CallMeBot numbers and the owner's ntfy topic — take every
  // category. Nothing subscribed them to this event because nothing raised it.
  //
  // Queued rather than sent inline, deliberately: the queue retries, records
  // the attempt, and cannot make a customer wait on CallMeBot answering. The
  // worker drains it every minute.
  //
  // Never blocks the booking, exactly like the email above it. The ride is
  // already committed and the reference is minted; an alert failing must not
  // turn a successful request into an error on the customer's screen.
  try {
    const meta = RIDE_SERVICE_META[v.service];
    const when =
      v.whenKind === "scheduled" && v.scheduledAt
        ? new Date(v.scheduledAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Indian/Mauritius",
          })
        : "As soon as possible";

    // Will anybody hear about it? See lib/rides/reachability.ts. Any failed
    // read drops the line, never the alert.
    let reachLine: string | null = null;
    try {
      const [roster, wa, push] = await Promise.all([
        admin.from("taxi_drivers").select("id, name, active, handles_taxi, handles_airport, handles_transfer"),
        admin.rpc("taxi_whatsapp_readiness"),
        admin.rpc("taxi_push_readiness"),
      ]);
      if (!roster.error && !wa.error && !push.error) {
        const reachable = new Set<string>([
          ...((wa.data ?? []) as { driver_id: string; whatsapp_ready: boolean }[])
            .filter((r) => r.whatsapp_ready).map((r) => r.driver_id),
          ...((push.data ?? []) as { driver_id: string; push_ready: boolean }[])
            .filter((r) => r.push_ready).map((r) => r.driver_id),
        ]);
        reachLine = bookingReachLine((roster.data ?? []) as RosterDriver[], reachable, v.service);
      }
    } catch (err) {
      console.error("booking reach check threw", err);
    }

    await enqueueNotification({
      type: "ride.requested",
      category: "rides",
      message: formatWhatsAppMessage({
        title: `🚕 ${meta?.label ?? v.service} request${created.reference ? ` · ${created.reference}` : ""}`,
        lines: [
          `When: ${when}`,
          `From: ${v.pickupLabel}`,
          v.dropoffLabel ? `To: ${v.dropoffLabel}` : null,
          `Who: ${v.name} — ${toE164National(v.phone) ?? v.phone}`,
          `${v.passengers} passenger${v.passengers === 1 ? "" : "s"}${v.luggage ? `, ${v.luggage} bag${v.luggage === 1 ? "" : "s"}` : ""}`,
          // The SERVER's price, never one the caller sent — the same rule the
          // RPC and the email follow. Minor units, so the shared formatter
          // divides rather than this file doing arithmetic on money.
          created.zone ? `Zone ${created.zone}${returnLeg ? " · return package" : " · one way"}` : null,
          // A return package is two rides on two days, each with its own fare
          // and its own driver — say both, not only the total.
          returnLeg
            ? `Fares: ${formatRidePrice(outboundLeg?.price ?? null)} + ${formatRidePrice(returnLeg.price)} return`
            : null,
          created.price != null ? `Price: ${formatRidePrice(created.price)}` : null,
          returnLeg
            ? `Return: ${pickupTimeLabel("scheduled", returnLeg.at ?? v.returnAt ?? null)}${created.returnReference ? ` · ${created.returnReference}` : ""}${v.returnFlightRef ? ` · ${v.returnFlightRef}` : ""}`
            : null,
          // Night (or a large group): priced by hand. Since M222 it is offered to
          // drivers straight away like any unpriced taxi ride; this line tells
          // the owner the fare still has to be agreed with the customer.
          created.farePending
            ? `⚠️ Fare to agree by hand${pendingReason ? ` (${pendingReason === "group" ? "large group" : `${pendingReason} window`})` : ""} — offered to drivers now with no fixed fare`
            : null,
          v.flightRef ? `Flight: ${v.flightRef}` : null,
          v.meetGreet ? "Meet & greet requested" : null,
          v.notes ? `Note: ${v.notes}` : null,
          reachLine,
        ],
        action: `${SITE_URL}/admin/rides`,
      }),
      // One alert per ride per channel. A retry of this route must not raise a
      // second; enqueue_notification counts the suppression instead.
      dedupeKey: created.reference
        ? `ride.requested:${created.reference}`
        : undefined,
      payload: { service: v.service, whenKind: v.whenKind },
    });
  } catch (err) {
    // Same guarantee as the email: the booking stands.
    console.error("ride alert enqueue threw", err);
  }

  // The reference is all that comes back. No id, so nothing here can be used to
  // read another customer's ride.
  return NextResponse.json(data);
}
