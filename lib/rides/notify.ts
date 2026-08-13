import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { SITE_URL } from "@/lib/site";
import { offerMessage, type RideService } from "./model";

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
  sent: number;
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
  const empty: OfferSendResult = { sent: 0, unreachable: [], failed: [] };
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

  const result: OfferSendResult = { sent: 0, unreachable: [], failed: [] };

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

  if (result.failed.length || result.unreachable.length) {
    console.error("ride offer notify incomplete", {
      rideId, sent: result.sent,
      unreachable: result.unreachable.map((u) => u.name),
      failed: result.failed,
    });
  }
  return result;
}

/**
 * Tell the owner a ride ran out of drivers.
 *
 * The one message that must reach a human, because a ride in 'no_driver' has a
 * customer waiting and no automatic path left. Sent to the platform's own
 * WhatsApp slot, not to a driver.
 */
export async function notifyOwnerRideUnassigned(rideId: string, pickup: string, dropoff: string): Promise<boolean> {
  if (!hasServiceRole()) return false;
  try {
    const admin = await getPrivileged();
    // notification_slots is keyed by uuid with a `role` and a `categories`
    // array, NOT by a literal id of 'owner' — I assumed the latter and the
    // lookup would have silently returned nothing, so a ride nobody accepted
    // would have failed quietly, which is the one message that must not.
    // Any ACTIVE slot with a key will do; the platform already fans out this way.
    const { data } = await admin
      .from("notification_slots")
      .select("phone, api_key, role")
      .eq("is_active", true)
      .not("api_key", "is", null)
      .limit(1)
      .maybeSingle();
    const slot = data as { phone?: string; api_key?: string } | null;
    if (!slot?.phone || !slot?.api_key) return false;

    const sent = await sendWhatsApp({
      phone: slot.phone,
      apiKey: slot.api_key,
      message: [
        `No driver accepted a ride.`,
        ``,
        `${pickup} → ${dropoff}`,
        ``,
        `Assign someone by hand here:`,
        `${SITE_URL}/admin/rides`,
      ].join("\n"),
    });
    return sent.ok;
  } catch (err) {
    console.error("notifyOwnerRideUnassigned threw", err);
    return false;
  }
}
