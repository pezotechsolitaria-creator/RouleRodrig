import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { sendWhatsApp } from "@/lib/notifications/whatsapp";

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

/** Bounded so one invocation cannot run past the function timeout. */
const BATCH = 20;

export async function GET(req: NextRequest) {
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

  // Sequential, not Promise.all: CallMeBot is a free service and hammering it
  // with twenty parallel requests is how a shared endpoint starts refusing us.
  // A batch of 20 at ~1s each is well inside maxDuration.
  for (const job of jobs) {
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

  return NextResponse.json({
    ok: true,
    claimed: jobs.length,
    sent,
    failed,
    requeued: (requeued as number | null) ?? 0,
  });
}
