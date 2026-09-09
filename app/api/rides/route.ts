import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { guard } from "@/lib/rate-limit";
import { sendRideEmails } from "@/lib/email";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { SITE_URL } from "@/lib/site";
import {
  RIDE_SERVICES,
  RIDE_SERVICE_META,
  formatRidePrice,
} from "@/lib/rides/model";
import { formatContactPhone, isValidContactPhone } from "@/lib/phone";

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
  // isValidContactPhone, not a length check. The form validates too, but the
  // form is a convenience and THIS is the rule: valid per the country's real
  // allocation plan (libphonenumber), Mauritian when typed with no code. See
  // lib/phone.ts for why the rule is the library's data and not a prefix —
  // a guessed "starts with 5" rule once rejected a customer's REAL number.
  phone: z
    .string()
    .trim()
    .min(5)
    .max(40)
    .refine(isValidContactPhone, {
      message:
        "That doesn't look like a number your driver can call. A Mauritian number has 8 digits — check it and try again.",
    }),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
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
  const { data, error } = await admin.rpc("create_ride_request", {
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
    // The CANONICAL shape ("+230 7058 7837"), never the keystrokes — one
    // format means the desk, wa.me and tel: links always agree.
    p_customer_phone: formatContactPhone(v.phone) ?? v.phone,
    p_customer_email: v.email || null,
  });

  if (error) {
    // RR095 is the function refusing bad input with a sentence a customer can act
    // on ("that time has already passed"), not a crash.
    if (error.code === "RR095") {
      return NextResponse.json({ error: error.message }, { status: 400 });
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
    price?: number | null;
  };
  try {
    await sendRideEmails({
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

    await enqueueNotification({
      type: "ride.requested",
      category: "rides",
      message: formatWhatsAppMessage({
        title: `🚕 ${meta?.label ?? v.service} request${created.reference ? ` · ${created.reference}` : ""}`,
        lines: [
          `When: ${when}`,
          `From: ${v.pickupLabel}`,
          v.dropoffLabel ? `To: ${v.dropoffLabel}` : null,
          `Who: ${v.name} — ${v.phone}`,
          `${v.passengers} passenger${v.passengers === 1 ? "" : "s"}${v.luggage ? `, ${v.luggage} bag${v.luggage === 1 ? "" : "s"}` : ""}`,
          // The SERVER's price, never one the caller sent — the same rule the
          // RPC and the email follow. Minor units, so the shared formatter
          // divides rather than this file doing arithmetic on money.
          created.price != null ? `Price: ${formatRidePrice(created.price)}` : null,
          v.flightRef ? `Flight: ${v.flightRef}` : null,
          v.meetGreet ? "Meet & greet requested" : null,
          v.notes ? `Note: ${v.notes}` : null,
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
