import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";
import { notifySweepResult } from "@/lib/delivery/notify";
import { notifyRideOffers, notifyOwnerRideUnassigned } from "@/lib/rides/notify";

// ── The notification worker ─────────────────────────────────────────────────
//
// Drains the queue that business code writes to. Separate from
// /api/cron/reminders on purpose: reminders run once a day, this needs to run
// every few minutes, and one endpoint doing both would force the slower cadence
// on the thing that needs the faster one.
//
// SAFE TO RUN CONCURRENTLY. claim_notification_jobs() uses FOR UPDATE SKIP
// LOCKED, so two overlapping invocations take disjoint batches instead of
// sending every message twice. That guarantee lives in the database, not here —
// this route could be called ten times at once and stay correct.
//
// Fails CLOSED without CRON_SECRET, same as the reminders cron: an open
// endpoint that sends WhatsApp messages is a spam cannon.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Sized for an EXTERNAL pinger, not for Vercel cron ───────────────────────
// This is triggered by cron-job.org every minute, and free external pingers
// abandon a request at ~30 seconds. That matters because jobs are claimed
// UP FRONT: if the caller hangs up mid-batch, whatever was claimed but not yet
// sent sits in `sending` until requeue_stuck_notifications() rescues it ten
// minutes later. So the batch is small enough to finish comfortably inside any
// pinger's timeout, and the loop stops early if it is running long and hands
// the remainder straight back rather than stranding it.
//
// 5/minute = 300/hour, which is far beyond this island's real volume.
const BATCH = 5;

/** Stop claiming new work past this; well inside a 30s client timeout. */
const TIME_BUDGET_MS = 20_000;

export async function GET(req: NextRequest) {
  return run(req);
}

// Some pingers default to POST. Same handler rather than a footgun where the
// schedule silently 405s and the queue quietly stops draining.
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const auth = authorizeCron(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!hasServiceRole()) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is unset; the queue cannot be drained." },
      { status: 503 },
    );
  }

  const admin = await getPrivileged();

  // A job left in `sending` means a previous worker died mid-flight (a deploy,
  // a timeout). Without this it would sit there forever and the message would
  // never arrive.
  const { data: requeued } = await admin.rpc("requeue_stuck_notifications");

  // Delivery escalations ride this cron rather than getting their own: the
  // Vercel plan caps cron jobs, and a stalled delivery needs checking on the
  // same cadence as a queued message anyway. Failure here must not stop the
  // queue draining — they are independent jobs sharing a trigger.
  let sweep: unknown = null;
  try {
    const { data, error } = await admin.rpc("sweep_delivery_escalations");
    if (error) console.error("sweep_delivery_escalations failed", error);
    else {
      sweep = data;
      // The sweep hands back ids because SQL cannot reach a phone. Without this
      // step every round after the first was mute: offer rows appeared, no
      // driver was told, and a driver who came online mid-search learned
      // nothing until he happened to open the page.
      await notifySweepResult(data);
    }
  } catch (err) {
    console.error("sweep_delivery_escalations threw", err);
  }

  // ── Nothing has happened SINCE (M93) ─────────────────────────────────────
  //
  // Rides this cron for the same reason the delivery sweep does: it is already
  // pinged every minute, and a second scheduler is a second thing that can stop
  // without anyone noticing.
  //
  // It enqueues rather than sends, so the message goes out through the same
  // claim/retry/record path as everything else — and its dedupe key is the
  // clock hour, so running every minute still means one WhatsApp per hour.
  let stale: { found: number; queued: number } = { found: 0, queued: 0 };
  try {
    const { escalateStale } = await import("@/lib/notifications/escalation");
    stale = await escalateStale();
  } catch (err) {
    console.error("stale-work escalation threw", err);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_notification_jobs", {
    p_limit: BATCH,
  });
  if (claimError) {
    console.error("claim_notification_jobs failed", claimError);
    return NextResponse.json({ ok: false, error: "Could not claim jobs." }, { status: 500 });
  }

  type Job = {
    job_id: string;
    slot_id: string;
    phone: string;
    api_key: string | null;
    message: string;
    attempts: number;
    max_attempts: number;
  };
  const jobs = (claimed ?? []) as Job[];

  let sent = 0;
  let failed = 0;
  let deferred = 0;
  const started = Date.now();

  // Sequential, not Promise.all: CallMeBot is a free service and hammering it
  // with parallel requests is how a shared endpoint starts refusing us.
  for (const job of jobs) {
    // Running long. Hand the rest straight back to `pending` instead of
    // leaving it claimed — otherwise a slow provider would strand these in
    // `sending` for ten minutes and the customer's message would sit there.
    if (Date.now() - started > TIME_BUDGET_MS) {
      await admin
        .from("notification_jobs")
        .update({ status: "pending", attempts: Math.max(0, job.attempts - 1) })
        .eq("id", job.job_id);
      deferred += 1;
      continue;
    }

    const result = await sendWhatsApp({
      phone: job.phone,
      apiKey: job.api_key ?? "",
      message: job.message,
    });

    if (result.ok) {
      sent += 1;
      await admin.rpc("complete_notification_job", { p_job_id: job.job_id, p_ok: true, p_error: null });
      continue;
    }

    failed += 1;
    // A non-retryable failure (bad key, unregistered number) should not consume
    // five attempts over an hour — burn the remaining budget immediately so it
    // lands in `failed` with a readable reason the admin card can show.
    if (!result.retryable) {
      await admin
        .from("notification_jobs")
        .update({ attempts: job.max_attempts })
        .eq("id", job.job_id);
    }
    await admin.rpc("complete_notification_job", {
      p_job_id: job.job_id,
      p_ok: false,
      p_error: result.error,
    });
  }

  // Stamp the heartbeat. This is what makes the worker's own death
  // detectable: nothing else in the system knows whether an EXTERNAL cron
  // (cron-job.org, outside Vercel) is still calling this route.
  try {
    await admin.rpc("record_heartbeat", {
      p_name: "notification_worker",
      p_meta: { claimed: jobs.length, sent, failed },
    });
  } catch (err) {
    // Never fail the run over bookkeeping — the jobs already went out.
    console.error("record_heartbeat failed", err);
  }

  // ── AUTOMATIC TAXI DISPATCH ──────────────────────────────────────────────
  // Riding on this worker rather than a new cron, on purpose: it already runs
  // every minute, is already authorised, and already tolerates concurrent
  // invocations. A second pinger to configure is a second thing to forget.
  //
  // auto_dispatch_rides() locks each ride FOR UPDATE SKIP LOCKED, so two
  // overlapping runs take disjoint rides instead of double-offering. It offers
  // round 1 to anything new, widens the search when a round expires, and gives up
  // to 'no_driver' at the end of the ladder — the loop that used to be the
  // owner's finger on a Dispatch button.
  let dispatched: unknown = null;
  // Reported for the same reason staleWork is: this is the alert that used to
  // leave no trace anywhere, so the run that raises it should be able to say
  // so. `queued` counts RECIPIENTS, not rides — two owner numbers, two jobs.
  // A queued of 0 is not an error: it also means the recipients already had it.
  const rideAlerts = { rides: 0, queued: 0 };
  try {
    const { data, error } = await admin.rpc("auto_dispatch_rides", { p_limit: 20 });
    if (error) {
      console.error("auto_dispatch_rides failed", error);
    } else {
      dispatched = data;
      const rides = ((data as { rides?: { rideId: string; offered?: number }[] })?.rides ?? []);
      // Send each round's WhatsApp immediately rather than through the queue: an
      // offer expires in ten minutes, and a job that waits for the next worker
      // tick has already burnt a tenth of the driver's window.
      await Promise.allSettled(
        rides.filter((r) => (r.offered ?? 0) > 0).map((r) => notifyRideOffers(r.rideId)),
      );
      // A ride nobody accepted is the one case that still needs a human, so it is
      // the one case that messages one.
      //
      // Unlike the offers above this ENQUEUES. The offer cannot wait a tick; a
      // ride that has already spent four rounds failing can, and queuing is
      // what makes it reach BOTH owner numbers, retry when CallMeBot blinks,
      // and leave a row that answers "was I told about that ride?".
      const exhausted = rides.filter((r) => !r.offered && "outcome" in r);
      rideAlerts.rides = exhausted.length;
      for (const r of exhausted) {
        rideAlerts.queued += await notifyOwnerRideUnassigned(r.rideId);
      }
    }
  } catch (err) {
    // Dispatch must never take the notification worker down with it.
    console.error("auto dispatch threw", err);
  }

  return NextResponse.json({
    ok: true,
    claimed: jobs.length,
    sent,
    failed,
    deferred,
    dispatched,
    requeued: (requeued as number | null) ?? 0,
    deliverySweep: sweep,
    // Reported so the response is enough to answer "why did/didn't he get a
    // WhatsApp?" without opening the database.
    staleWork: stale,
    rideAlerts,
    ms: Date.now() - started,
  });
}
