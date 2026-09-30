import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { pushToDriverEndpoints, type Target as PushTarget } from "@/lib/push/send";
import { enqueueNotification, formatWhatsAppMessage } from "@/lib/notifications/queue";
import { SITE_URL } from "@/lib/site";
import { offerMessage, rideReference, type RideService } from "./model";
import { classifyOfferTarget } from "./offer-outcome";
import { rideUnassignedAlert, rideUnreachedAlert } from "./no-driver-copy";
import { hourBucket } from "@/lib/notifications/escalation";
import {
  assessRoster,
  rosterBlockedAlert,
  rosterCauseSentence,
  type RosterAssessment,
  type RosterCandidate,
  type RosterCause,
} from "./roster-copy";

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
  /** Offered, and the row has no number to send to at all.
   *
   *  A SEPARATE bucket from `unreachable` on purpose: the two look identical
   *  in a total and need OPPOSITE actions — this one is fixed by editing the
   *  driver, that one by walking him through the CallMeBot opt-in.
   *
   *  Until now they were merged into nothing at all: a blank phone returned one
   *  line above the only writer of `unreachable`, so the result read as a clean
   *  run that simply had nobody to ask. */
  noContact: { name: string }[];
  /** Had a key and the send still failed. */
  failed: { name: string; error: string }[];
  /** Drivers this round actually reached, by WhatsApp or push. */
  reachedIds: string[];
  /**
   * Drivers in their hours whom this round did NOT reach, and why. This is
   * what recordOfferReach writes down, so a later message can say who was
   * never alerted from what HAPPENED rather than from today's setup.
   */
  missed: { driverId: string; name: string; why: MissedWhy }[];
};

/** Why an offer did not reach a driver who was in their hours. */
export type MissedWhy = "no_alerts" | "no_number" | "failed";

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
  const empty: OfferSendResult = {
    sent: 0, pushed: 0, unreachable: [], noContact: [], failed: [], reachedIds: [], missed: [],
  };
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

  const result: OfferSendResult = {
    sent: 0, pushed: 0, unreachable: [], noContact: [], failed: [], reachedIds: [], missed: [],
  };
  // Per driver, what each channel did — so the round can be written down as
  // who it reached and who it missed, not only as totals.
  const whatsapp = new Map<string, "sent" | "no_contact" | "no_key" | "failed">();
  const pushedTo = new Set<string>();
  const pushTried = new Set<string>();
  const byToken = new Map(targets.map((t) => [t.token, t.driver_id]));

  await Promise.allSettled(
    targets.map(async (t) => {
      const name = t.driver_name ?? "driver";
      const outcome = classifyOfferTarget(t);
      if (outcome === "no_contact") {
        // The bare `return` that used to be here sat one line ABOVE the only
        // writer of result.unreachable, so a driver with no number produced no
        // send, no counter, no console line and no Sentry event — a result
        // object identical to a healthy dispatch with nobody to ask.
        result.noContact.push({ name });
        whatsapp.set(t.driver_id, "no_contact");
        return;
      }
      if (outcome === "no_key") {
        // Not a failure to retry — this driver has never opted in, and trying
        // again in a minute fails identically. Surfaced so the desk can say who.
        result.unreachable.push({ name, phone: (t.phone ?? "").trim() });
        whatsapp.set(t.driver_id, "no_key");
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

      const sent = await sendWhatsApp({
        phone: (t.phone as string).trim(),
        apiKey: (t.api_key as string).trim(),
        message,
      });
      if (sent.ok) {
        result.sent += 1;
        whatsapp.set(t.driver_id, "sent");
      } else {
        result.failed.push({ name, error: sent.error });
        whatsapp.set(t.driver_id, "failed");
      }
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
      const pushTargets = (data ?? []) as (PushTarget & { token: string })[];
      for (const t of pushTargets) {
        const id = byToken.get(t.token);
        if (id) pushTried.add(id);
      }
      const results = await Promise.allSettled(
        pushTargets.map((t) =>
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
      results.forEach((r, i) => {
        const id = byToken.get(pushTargets[i].token);
        if (id && r.status === "fulfilled" && r.value > 0) pushedTo.add(id);
      });
    }
  } catch (err) {
    // Push failing must never stop the WhatsApp that already went, nor unwind a
    // dispatch that has already committed.
    console.error("taxi push threw", err);
  }

  // Who this round reached, and why the rest were missed. A driver with a push
  // subscription that did not answer was TRIED, so that is a failure, not a
  // missing setup — the difference decides what the owner is told to fix.
  for (const t of targets) {
    const wa = whatsapp.get(t.driver_id);
    if (wa === "sent" || pushedTo.has(t.driver_id)) {
      if (!result.reachedIds.includes(t.driver_id)) result.reachedIds.push(t.driver_id);
      continue;
    }
    if (result.missed.some((m) => m.driverId === t.driver_id)) continue;
    const why: MissedWhy =
      wa === "failed" || pushTried.has(t.driver_id) ? "failed"
        : wa === "no_contact" ? "no_number"
          : "no_alerts";
    result.missed.push({ driverId: t.driver_id, name: t.driver_name ?? "A driver", why });
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
  when_kind: string | null;
  scheduled_at: string | null;
};

const UNASSIGNED_COLUMNS =
  "pickup_label, dropoff_label, customer_name, customer_phone, created_at, updated_at, when_kind, scheduled_at";

/** Whole minutes until a future timestamp; null when it is past or unusable. */
function minutesUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((t - Date.now()) / 60_000);
  return mins > 0 ? mins : null;
}

/** The pickup facts both owner messages share, for a booked time only. */
function pickupFacts(ride: UnassignedRow): { pickupAt: string | null; minutesToPickup: number | null } {
  if (ride.when_kind !== "scheduled" || !ride.scheduled_at) return { pickupAt: null, minutesToPickup: null };
  return { pickupAt: ride.scheduled_at, minutesToPickup: minutesUntil(ride.scheduled_at) };
}

type Admin = Awaited<ReturnType<typeof getPrivileged>>;

/** The ride_events action recording one round's reach. */
export const OFFER_REACH_EVENT = "ride.offer_reach";

/**
 * Write down who one round of offers reached, and why it missed the rest.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Nothing recorded whether an offer arrived. The first version of the "never
 * saw it" line therefore asked the driver's setup as it stands NOW — and a
 * review found the hole at once: the give-up message tells the owner to set
 * the driver up, the owner does, and the reminder six hours before pickup
 * reads the new setup and says the driver "did not accept" a ride he was
 * never alerted to. A typo'd WhatsApp code reads as "set up" too, while every
 * send fails. What happened at the time is the only honest source.
 *
 * One ride_events row per round that had anybody to reach — the table the
 * ladder already logs to, so no migration. M132 reads only 'ride.offered', and
 * the desk does not render events, so a new action disturbs nothing.
 *
 * NEVER throws: this rides inside the notification worker.
 */
export async function recordOfferReach(
  rideId: string,
  stage: number | null | undefined,
  sent: OfferSendResult,
): Promise<void> {
  if (!hasServiceRole() || sent.reachedIds.length + sent.missed.length === 0) return;
  try {
    const admin = await getPrivileged();
    const { error } = await admin.rpc("log_ride_event", {
      p_request_id: rideId,
      p_actor_type: "system",
      p_actor_ref: null,
      p_action: OFFER_REACH_EVENT,
      p_detail: {
        stage: stage ?? null,
        reached: sent.reachedIds,
        missed: sent.missed.map((m) => ({ id: m.driverId, why: m.why })),
      },
    });
    if (error) console.error("recordOfferReach failed", { rideId, error });
  } catch (err) {
    console.error("recordOfferReach threw", err);
  }
}

/** When the current run of the ladder began: its latest stage-1 offer. */
async function readLadderStart(admin: Admin, rideId: string): Promise<string | null> {
  const { data, error } = await admin.from("ride_events")
    .select("created_at")
    .eq("request_id", rideId)
    .eq("action", "ride.offered")
    .eq("detail->>stage", "1")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("readLadderStart failed", { rideId, error });
  return (data as { created_at?: string } | null)?.created_at ?? null;
}

type ReachRow = { reached?: string[] | null; missed?: { id: string; why: MissedWhy }[] | null };

/** The reach rows of the current run of the ladder, oldest first. */
async function readReach(admin: Admin, rideId: string, since: string | null): Promise<ReachRow[] | null> {
  let q = admin.from("ride_events")
    .select("detail")
    .eq("request_id", rideId)
    .eq("action", OFFER_REACH_EVENT)
    .order("created_at", { ascending: true });
  if (since) q = q.gte("created_at", since);
  const { data, error } = await q;
  if (error) {
    console.error("readReach failed", { rideId, error });
    return null;
  }
  return ((data ?? []) as { detail: ReachRow | null }[]).map((r) => r.detail ?? {});
}

export type NeverAlerted = {
  /** Offered, never reached in any round of this run, and never answered. */
  names: string[];
  /** …of whom these had no WhatsApp and no phone alerts set up. */
  noAlerts: string[];
  /** …and these were tried and the alert did not go through. */
  failed: string[];
};

/**
 * Which drivers offered this ride were never alerted to it.
 *
 * From what each round RECORDED (recordOfferReach), not from today's setup. A
 * driver who answered — declined or accepted, from a WhatsApp or from his own
 * /d/ page, which shows a live offer whatever alerts he has — saw it, whatever
 * any record says, so he is never on this list.
 *
 * Rides dispatched before rounds were recorded have no reach rows. For those,
 * and only when the caller allows it, today's setup stands in — fine for the
 * give-up message, which follows the ladder by a minute. The reminder, hours
 * later, passes false and says nothing rather than guess.
 *
 * Returns null when we cannot tell; the copy then says nothing either way.
 */
async function readNeverAlerted(
  admin: Admin,
  rideId: string,
  opts: { fallBackToSetup: boolean },
): Promise<NeverAlerted | null> {
  const [offers, since] = await Promise.all([
    admin.from("ride_offers").select("driver_id, status, taxi_drivers(name)").eq("request_id", rideId),
    readLadderStart(admin, rideId),
  ]);
  if (offers.error) {
    console.error("readNeverAlerted: offers", { rideId, error: offers.error });
    return null;
  }
  const rows = (offers.data ?? []) as unknown as {
    driver_id: string; status: string | null; taxi_drivers: { name: string | null } | null;
  }[];
  const nameOf = (o: (typeof rows)[number]) => o.taxi_drivers?.name?.trim() || "A driver";
  const unanswered = rows.filter((o) => o.status !== "declined" && o.status !== "accepted");

  const reach = await readReach(admin, rideId, since);
  if (reach === null) return null;

  if (reach.length > 0) {
    const reached = new Set(reach.flatMap((r) => r.reached ?? []));
    const why = new Map<string, MissedWhy>();
    for (const r of reach) for (const m of r.missed ?? []) why.set(m.id, m.why);
    const never = unanswered.filter((o) => !reached.has(o.driver_id) && why.has(o.driver_id));
    return {
      names: never.map(nameOf),
      noAlerts: never.filter((o) => why.get(o.driver_id) === "no_alerts").map(nameOf),
      failed: never.filter((o) => why.get(o.driver_id) === "failed").map(nameOf),
    };
  }

  if (!opts.fallBackToSetup) return null;

  const [wa, push] = await Promise.all([
    admin.rpc("taxi_whatsapp_readiness"),
    admin.rpc("taxi_push_readiness"),
  ]);
  if (wa.error || push.error) {
    console.error("readNeverAlerted: readiness", { rideId, whatsapp: wa.error, push: push.error });
    return null;
  }
  const ready = new Set<string>();
  for (const r of (wa.data ?? []) as { driver_id: string; whatsapp_ready: boolean }[]) {
    if (r.whatsapp_ready) ready.add(r.driver_id);
  }
  for (const r of (push.data ?? []) as { driver_id: string; push_ready: boolean }[]) {
    if (r.push_ready) ready.add(r.driver_id);
  }
  const names = unanswered.filter((o) => !ready.has(o.driver_id)).map(nameOf);
  return { names, noAlerts: names, failed: [] };
}

/**
 * Is there a driver the search has not tried yet who WOULD be alerted?
 *
 * The first round only looks 3 km out. If a set-up driver exists further away,
 * a later round reaches him automatically, and an alarm now would send the
 * owner ringing round for nothing — the same reasoning the roster alarm uses
 * (readWhyNobodyWasAsked). Widest width, eligible, not yet offered, and ready.
 */
async function widerRoundWillReachSomeone(admin: Admin, rideId: string): Promise<boolean> {
  const [cands, offers, wa, push] = await Promise.all([
    admin.rpc("ride_candidates", { p_request_id: rideId, p_stage: 99, p_limit: 40 }),
    admin.from("ride_offers").select("driver_id").eq("request_id", rideId),
    admin.rpc("taxi_whatsapp_readiness"),
    admin.rpc("taxi_push_readiness"),
  ]);
  if (cands.error || offers.error || wa.error || push.error) return false;
  const offered = new Set(((offers.data ?? []) as { driver_id: string }[]).map((o) => o.driver_id));
  const ready = new Set<string>([
    ...((wa.data ?? []) as { driver_id: string; whatsapp_ready: boolean }[]).filter((r) => r.whatsapp_ready).map((r) => r.driver_id),
    ...((push.data ?? []) as { driver_id: string; push_ready: boolean }[]).filter((r) => r.push_ready).map((r) => r.driver_id),
  ]);
  return ((cands.data ?? []) as RosterCandidate[])
    .some((c) => c.reason_skipped == null && !offered.has(c.driver_id) && ready.has(c.driver_id));
}

/**
 * Ask the engine why it passed over every driver.
 *
 * TWO reads, and the second is what makes the answer honest. p_stage enters
 * ride_candidates in exactly one place — it sets v_radius, and v_radius feeds
 * exactly one branch of the reason ladder, "N km away, outside this round".
 * Every other reason is identical at every width. So:
 *
 *   skipped at this round's width, free at the widest  -> distance, and a
 *                                                         later, wider round
 *                                                         reaches him. Say
 *                                                         nothing.
 *   skipped at the widest width                        -> no width helps.
 *                                                         Say it now.
 *
 * Diffing the two decides that without matching a word of the reason text and
 * without this file knowing what the widths are, so a reworded reason or a
 * fourth width cannot silently disarm the alarm.
 *
 * 99 is "widest": v_radius is null for any p_stage past the last width. It is
 * the same read the rides desk already makes (app/api/admin/rides/route.ts).
 * p_limit 40 must stay above the number of switched-on drivers — skipped rows
 * sort LAST, so a small limit hides exactly the rows this is looking for.
 *
 * Returns null when the widest read fails: no alarm, and the give-up message
 * still arrives. Silence on a failed read is today's behaviour, not a new bug.
 */
async function readWhyNobodyWasAsked(
  admin: Awaited<ReturnType<typeof getPrivileged>>,
  rideId: string,
  stage: number | null,
): Promise<RosterAssessment | null> {
  const widest = await admin.rpc("ride_candidates", {
    p_request_id: rideId, p_stage: 99, p_limit: 40,
  });
  if (widest.error) {
    console.error("ride_candidates (widest) failed", { rideId, error: widest.error });
    return null;
  }

  let atStage: RosterCandidate[] = [];
  if (typeof stage === "number" && stage >= 1) {
    const now = await admin.rpc("ride_candidates", {
      p_request_id: rideId, p_stage: stage, p_limit: 40,
    });
    if (now.error) console.error("ride_candidates (this round) failed", { rideId, stage, error: now.error });
    else atStage = (now.data ?? []) as RosterCandidate[];
  }

  return assessRoster({ atStage, atWidest: (widest.data ?? []) as RosterCandidate[] });
}

/**
 * Tell the owner the DRIVER LIST cannot serve anybody — while the ladder is
 * still running, not four and a half minutes later.
 *
 * -- WHY THIS IS NOT THE MESSAGE NEXT DOOR --------------------------------
 * notifyOwnerRideUnassigned is about one customer and leads with their phone
 * number. This is about the driver list and names no customer at all, because
 * one of these messages may stand for three stranded people. They are keyed
 * apart on purpose: a roster fault is one fact however many rides it strands,
 * and a customer's number must never be swallowed by another ride's alarm.
 *
 * -- WHY IT DOES NOT SIMPLY FIRE ON THE FIRST EMPTY ROUND -----------------
 * Because that is sometimes wrong. Ride c21cf582 found 0 drivers at 14:14:12
 * and 1 driver at 14:15:26 — the widening search doing its job. assessRoster
 * separates that from the case where no width can help.
 *
 * Returns what it did, so a cron run can answer "why did it or didn't it
 * raise". NEVER throws: this rides inside the notification worker.
 */
export async function notifyOwnerRosterBlocked(
  rides: { rideId: string; stage: number | null }[],
): Promise<{ raised: number; queued: number; quiet: Record<string, number> }> {
  const quiet: Record<string, number> = {};
  if (!hasServiceRole() || rides.length === 0) return { raised: 0, queued: 0, quiet };
  try {
    const admin = await getPrivileged();

    // Grouped by CAUSE before anything is sent. Three rides stranded by one
    // switched-off driver are one message here, and the dedupe key catches the
    // ones that arrive on later ticks.
    const byCause = new Map<
      RosterCause,
      { rides: string[]; blockedName: string | null; mixed: boolean; reasons: string[] }
    >();

    for (const r of rides) {
      const verdict = await readWhyNobodyWasAsked(admin, r.rideId, r.stage);
      if (!verdict) { quiet.unreadable = (quiet.unreadable ?? 0) + 1; continue; }
      if (!verdict.alarm) { quiet[verdict.why] = (quiet[verdict.why] ?? 0) + 1; continue; }
      const g = byCause.get(verdict.cause) ?? {
        rides: [], blockedName: verdict.blockedName, mixed: verdict.mixed, reasons: verdict.reasons,
      };
      g.rides.push(r.rideId);
      // A name only survives while it is unambiguous across the whole group.
      if (g.blockedName !== verdict.blockedName) g.blockedName = null;
      g.mixed = g.mixed || verdict.mixed;
      byCause.set(verdict.cause, g);
    }

    // One bucket for the whole tick, so two rides a millisecond either side of
    // the hour cannot land in different buckets and send twice.
    const bucket = hourBucket();
    let queued = 0;
    for (const [cause, g] of byCause) {
      const alert = rosterBlockedAlert(
        { cause, ridesWaiting: g.rides.length, blockedName: g.blockedName, mixed: g.mixed },
        bucket,
      );
      queued += await enqueueNotification({
        type: alert.type,
        category: "rides",
        message: formatWhatsAppMessage({ title: alert.title, lines: alert.lines }),
        dedupeKey: alert.dedupeKey,
        // The raw reasons live HERE and never in the message: they are the
        // engine's own words and /admin/notifications is where an engineer
        // reads them back.
        payload: { cause, rides: g.rides, reasons: g.reasons.slice(0, 10) },
      });
    }
    return { raised: byCause.size, queued, quiet };
  } catch (err) {
    console.error("notifyOwnerRosterBlocked threw", err);
    return { raised: 0, queued: 0, quiet };
  }
}

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
export async function notifyOwnerRideUnassigned(
  rideId: string,
  opts: { reminder?: boolean } = {},
): Promise<number> {
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
      .select(UNASSIGNED_COLUMNS)
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

    // WHY nobody was free. Read at the widest width with no round number: the
    // ladder is over and its last round applied no distance limit anyway, so
    // only the reasons no width can change are still relevant. A failure here
    // costs one line of the message, never the message.
    const why = await readWhyNobodyWasAsked(admin, rideId, null);

    // Asked is not the same as told. Only worth a read when somebody WAS
    // asked; a failure costs one line of the message, never the message. The
    // reminder comes hours later, when today's setup no longer describes the
    // offers — so it uses the recorded rounds or says nothing.
    const never = !countError && (count ?? 0) > 0
      ? await readNeverAlerted(admin, rideId, { fallBackToSetup: opts.reminder !== true })
      : null;

    const alert = rideUnassignedAlert({
      reminder: opts.reminder === true,
      unreachable: never?.names ?? null,
      unreachableNoAlerts: never?.noAlerts ?? null,
      unreachableFailed: never?.failed ?? null,
      ...pickupFacts(ride),
      rideId,
      whyNobodyWasAsked: why?.alarm ? rosterCauseSentence(why.cause, why.blockedName) : null,
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

/**
 * Tell the owner a round of offers reached NOBODY — while the ladder is still
 * running, instead of forty minutes later.
 *
 * The caller passes notifyRideOffers' own result, which it used to throw away:
 * the one place that knows a driver had no WhatsApp and no phone alerts. See
 * reachedNobody() in ./offer-outcome for the exact test.
 *
 * Queued, like the give-up message, so it reaches every owner channel and
 * leaves a row. Keyed on the start of this run of the ladder, so the four
 * rounds of one run are one message, and a reopened ride alerts again.
 *
 * Stays quiet in the two cases a review found where it would mislead:
 *   - an EARLIER round of this run did reach somebody (who then declined, or
 *     took another job). "No driver was told" would be false.
 *   - a WIDER round will reach a set-up driver the 3 km search has not got to
 *     yet. The ladder is about to fix it by itself.
 * The give-up message still follows if nobody takes it.
 *
 * Returns the number of recipients queued. NEVER throws: this rides inside the
 * notification worker. Call recordOfferReach for this round FIRST.
 */
export async function notifyOwnerRideUnreached(
  rideId: string,
  sent: OfferSendResult,
): Promise<number> {
  if (!hasServiceRole()) return 0;
  try {
    const admin = await getPrivileged();
    const [rideRead, ladderStartedAt] = await Promise.all([
      admin.from("ride_requests").select(UNASSIGNED_COLUMNS).eq("id", rideId).maybeSingle(),
      // The first round of the CURRENT run. offer_ride logs one ride.offered
      // event per round with its stage, and a reopen starts again at stage 1.
      // No stamp means no key, which sends without one — a possible duplicate,
      // never a swallowed alert. Same trade as dedupeKeyFor.
      readLadderStart(admin, rideId),
    ]);
    if (rideRead.error || !rideRead.data) {
      console.error("notifyOwnerRideUnreached: could not read the ride", { rideId, error: rideRead.error });
      return 0;
    }
    const ride = rideRead.data as unknown as UnassignedRow;

    const reach = await readReach(admin, rideId, ladderStartedAt);
    if (reach?.some((r) => (r.reached ?? []).length > 0)) return 0;
    if (await widerRoundWillReachSomeone(admin, rideId)) return 0;

    // This round's own record: who it missed and why, as it happened.
    const named = (why: MissedWhy) => sent.missed.filter((m) => m.why === why).map((m) => m.name);

    const alert = rideUnreachedAlert({
      rideId,
      ladderStartedAt,
      customerName: ride.customer_name,
      customerPhone: ride.customer_phone,
      pickup: ride.pickup_label,
      dropoff: ride.dropoff_label,
      ...pickupFacts(ride),
      noAlerts: named("no_alerts"),
      noNumber: named("no_number"),
      failed: named("failed"),
    });

    return await enqueueNotification({
      type: alert.type,
      category: "rides",
      message: formatWhatsAppMessage({ title: alert.title, lines: alert.lines }),
      dedupeKey: alert.dedupeKey ?? undefined,
      payload: {
        rideId,
        ref: rideReference(rideId),
        missed: sent.missed.map((m) => ({ name: m.name, why: m.why })),
      },
    });
  } catch (err) {
    console.error("notifyOwnerRideUnreached threw", err);
    return 0;
  }
}
