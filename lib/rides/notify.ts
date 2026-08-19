import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { pushToDriverEndpoints, type Target as PushTarget } from "@/lib/push/send";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { SITE_URL } from "@/lib/site";
import { offerMessage, rideReference, type RideService } from "./model";
import { rideUnassignedAlert } from "./no-driver-copy";

// ── SENDING THE OFFER WITHOUT ANYBODY PRESSING ANYTHING ─────────────────────
//
// The owner: "i do not receive any notifications on whatsapp and i want this
// system to be automatic." The first version handed him a wa.me link to tap,
// which is a mail merge, not dispatch.
//
// This sends. It reuses lib/notifications/whatsapp.ts — the same CallMeBot
// transport the delivery engine has used every day — so there is one WhatsApp
// integration on the platform rather than two.
//
// ── NOTHING HERE THROWS ─────────────────────────────────────────────────────
// Every caller sits on a path that has ALREADY committed: the offer rows exist,
// the tokens are minted, the ride is dispatching. A failed message must never
// unwind that — a driver who does not get the WhatsApp can still be reached by
// phone, but a ride rolled back because CallMeBot was down is a customer with
// nothing.
//
// ── THE ONE HUMAN STEP THAT CANNOT BE REMOVED ───────────────────────────────
// CallMeBot issues an api_key only to a phone that has messaged its bot. That is
// the API's consent model — and the reason a stranger cannot make this platform
// spam a number. So each driver does one 30-second opt-in, once, ever. After
// that, zero taps from anyone.

export type OfferSendResult = {
  /** WhatsApp messages that left the building. */
  sent: number;
  /** Phones woken by web push. */
  pushed: number;
  /** Offered, in their window, but with no CallMeBot key yet. */
  unreachable: { name: string; phone: string }[];
  /** Had a key and the send still failed. */
  failed: { name: string; error: string }[];
};

type Target = {
  driver_id: string;
  driver_name: string | null;
  phone: string | null;
  api_key: string | null;
  token: string;
  price: number | null;
  pickup: string;
  dropoff: string;
  passengers: number;
  service: string;
  when_kind: string;
  scheduled_at: string | null;
};

/**
 * WhatsApp every driver holding a live offer on this ride.
 *
 * Idempotent enough to be safe on a retry: it messages whoever is CURRENTLY
 * 'offered', and an offer that has been accepted or withdrawn is no longer
 * returned. A double call in the same minute would re-send, which is why the
 * caller is the dispatch path (once per round) rather than a poller.
 */
export async function notifyRideOffers(rideId: string): Promise<OfferSendResult> {
  const empty: OfferSendResult = { sent: 0, pushed: 0, unreachable: [], failed: [] };
  if (!hasServiceRole()) {
    // Local dev has no service key — say so once rather than failing a caller.
    console.warn("notifyRideOffers skipped: SUPABASE_SERVICE_ROLE_KEY is unset");
    return empty;
  }

  let targets: Target[] = [];
  try {
    const admin = await getPrivileged();
    // The key is returned by a SECURITY DEFINER function and nowhere else, so
    // there is no query in the codebase that could accidentally ship it.
    const { data, error } = await admin.rpc("taxi_offer_targets", { p_request_id: rideId });
    if (error) {
      console.error("taxi_offer_targets failed", error);
      return empty;
    }
    targets = (data ?? []) as Target[];
  } catch (err) {
    console.error("taxi_offer_targets threw", err);
    return empty;
  }

  const result: OfferSendResult = { sent: 0, pushed: 0, unreachable: [], failed: [] };

  await Promise.allSettled(
    targets.map(async (t) => {
      const name = t.driver_name ?? "driver";
      if (!t.phone) return;
      if (!t.api_key) {
        // Not a failure to retry — this driver has never opted in, and trying
        // again in a minute fails identically. Surfaced so the desk can say who.
        result.unreachable.push({ name, phone: t.phone });
        return;
      }

      const message = offerMessage({
        driverName: name,
        service: (t.service ?? "taxi") as RideService,
        pickup: t.pickup,
        dropoff: t.dropoff,
        passengers: t.passengers,
        whenText:
          t.when_kind === "scheduled" && t.scheduled_at
            ? new Date(t.scheduled_at).toLocaleString("en-GB", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                timeZone: "Indian/Mauritius",
              })
            : "Now",
        price: t.price,
        acceptUrl: `${SITE_URL}/r/${t.token}`,
      });

      const sent = await sendWhatsApp({ phone: t.phone, apiKey: t.api_key, message });
      if (sent.ok) result.sent += 1;
      else result.failed.push({ name, error: sent.error });
    }),
  );

  // ── WEB PUSH, ALONGSIDE ─────────────────────────────────────────────────
  // Two channels for the same reason delivery has two: WhatsApp needs a
  // per-driver CallMeBot opt-in the platform cannot perform for them, and until
  // they do it they are unreachable by message. Push needs one tap on a page they
  // are already looking at. A driver who has done neither still sees the offer
  // when they open their link; a driver who has done either gets woken.
  //
  // Deliberately not exclusive: a phone that missed the push still has the
  // WhatsApp, and vice versa. Duplicate notice about a real job beats silence.
  try {
    const admin = await getPrivileged();
    const { data, error } = await admin.rpc("taxi_push_targets", { p_request_id: rideId });
    if (error) {
      console.error("taxi_push_targets failed", error);
    } else {
      // ONE PUSH PER DRIVER, not one payload to everybody: each carries its own
      // offer token so tapping the notification opens THAT driver's offer with
      // the accept button already on screen. A notification that lands on the
      // homepage is one they still have to go and find the job from, and the
      // offer expires in ten minutes.
      const targets = (data ?? []) as (PushTarget & { token: string })[];
      const results = await Promise.allSettled(
        targets.map((t) =>
          pushToDriverEndpoints([t], {
            title: "New ride available",
            body: "Tap to see it — first to accept gets it.",
            url: `/r/${t.token}`,
            // Per ride, so a second offer replaces the first on the driver's
            // screen rather than stacking notifications for jobs already gone.
            tag: `ride-${rideId}`,
            // Android keeps these on screen instead of collapsing them silently,
            // which matters when the offer expires in ten minutes.
            urgent: true,
          }),
        ),
      );
      result.pushed = results.reduce(
        (n, r) => n + (r.status === "fulfilled" ? r.value : 0), 0,
      );
    }
  } catch (err) {
    // Push failing must never stop the WhatsApp that already went, nor unwind a
    // dispatch that has already committed.
    console.error("taxi push threw", err);
  }

  if (result.failed.length || result.unreachable.length) {
    console.error("ride offer notify incomplete", {
      rideId, sent: result.sent,
      unreachable: result.unreachable.map((u) => u.name),
      failed: result.failed,
    });
  }
  return result;
}

/** Whole minutes since a timestamp, or null. The clock lives here rather than
 *  in the copy module — that is what keeps the copy hermetically testable. */
function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60_000);
  return mins > 0 ? mins : null;
}

type UnassignedRow = {
  pickup_label: string | null;
  dropoff_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * Tell the owner a ride ran out of drivers.
 *
 * The one message that must reach a human, because a ride nobody took has a
 * customer waiting and no automatic path left.
 *
 * ── WHY THIS GOES THROUGH THE QUEUE AND notifyRideOffers DOES NOT ───────────
 * The offer above is direct because it expires in ten minutes and a queue tick
 * burns a tenth of the driver's window. This message has no such clock: the
 * ride has already spent four rounds and several minutes failing, so one more
 * tick costs nothing — and what it buys cannot be had any other way.
 *
 * It used to read ONE notification_slots row with `.limit(1)` and no ORDER BY,
 * then send it itself. Three consequences, all real:
 *   1. One of the owner's two numbers got the alert and the other never had —
 *      decided by physical row order, which every successful send rewrites.
 *   2. sendWhatsApp fails once and the alert is gone. No retry exists.
 *   3. No notification_jobs row, so "was I told about that ride?" was
 *      unanswerable. Ride RR-26A506 sat in that state for five days.
 * enqueueNotification fans out to every slot taking "rides" (both, today —
 * their categories arrays are empty, which means everything), retries with
 * backoff, records the attempt, and raises the no-recipient case to Sentry.
 *
 * Returns the number of recipients queued — 0 when the queue is unavailable OR
 * when the message was correctly deduped. NEVER throws.
 */
export async function notifyOwnerRideUnassigned(rideId: string): Promise<number> {
  if (!hasServiceRole()) return 0;
  try {
    const admin = await getPrivileged();

    // The read moved in here from the cron. It is the same round trip the
    // caller used to make, and holding it next to the copy is what stops the
    // two drifting: the caller passed `ride.dropoff_label` into a parameter
    // typed `string` and tsc could not see it, because the privileged client is
    // untyped. A day hire has no destination, and that reached the template.
    const { data, error } = await admin
      .from("ride_requests")
      .select("pickup_label, dropoff_label, customer_name, customer_phone, created_at, updated_at")
      .eq("id", rideId)
      .maybeSingle();
    if (error) {
      console.error("notifyOwnerRideUnassigned: could not read the ride", { rideId, error });
      return 0;
    }
    const ride = data as UnassignedRow | null;
    if (!ride) {
      console.error("notifyOwnerRideUnassigned: ride not found", { rideId });
      return 0;
    }

    // Was anybody actually asked? ride_offers is UNIQUE (request_id, driver_id),
    // so the row count IS the number of drivers ever offered this ride across
    // every round. Zero means the roster was empty, not that anyone refused —
    // opposite problems, and the old copy called both "no driver accepted".
    // A failure here costs one line of the message, never the message.
    const { count, error: countError } = await admin
      .from("ride_offers")
      .select("id", { count: "exact", head: true })
      .eq("request_id", rideId);
    if (countError) {
      console.error("notifyOwnerRideUnassigned: could not count offers", { rideId, countError });
    }

    const alert = rideUnassignedAlert({
      rideId,
      // The discriminator. Stamped by the same UPDATE that sets 'no_driver',
      // and again by a reopen — so a ride that strands twice alerts twice.
      stampedAt: ride.updated_at,
      customerName: ride.customer_name,
      customerPhone: ride.customer_phone,
      pickup: ride.pickup_label,
      dropoff: ride.dropoff_label,
      minutesWaiting: minutesSince(ride.created_at),
      driversAsked: countError ? null : count,
    });

    return await enqueueNotification({
      type: alert.type,
      category: "rides",
      message: formatWhatsAppMessage({ title: alert.title, lines: alert.lines }),
      // Null only when updated_at is unusable, and then deliberately: an
      // undeduped duplicate beats a swallowed alert.
      dedupeKey: alert.dedupeKey ?? undefined,
      // The customer's number is in the MESSAGE only. This is what the admin
      // notifications card would need to say WHICH ride, and it is kept
      // indefinitely.
      payload: { rideId, ref: rideReference(rideId), driversAsked: countError ? null : count },
    });
  } catch (err) {
    console.error("notifyOwnerRideUnassigned threw", err);
    return 0;
  }
}
