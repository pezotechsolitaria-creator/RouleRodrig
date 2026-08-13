import "server-only";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { enqueueNotification, formatWhatsAppMessage } from "./queue";

// ── When something has been waiting too long, phone him ────────────────────
//
// The owner: "make command centre trigger CallMeBot if it persists for 1 or
// more hours."
//
// Every alert this platform sends him is an EMAIL, and email on island
// connectivity is something you read when you next open a laptop. That is fine
// for "a booking arrived" and useless for "a customer has been waiting since
// this morning" — which is exactly the state the new availability check
// creates: a request nobody answers is now a request that never becomes money.
//
// This is the escalation. Not a second notification for the same event, but a
// different one for a different fact: the first said something happened, this
// says nothing has happened SINCE.
//
// ── How it is delivered ───────────────────────────────────────────────────
//
// It does not add infrastructure. /api/cron/notifications is already pinged
// every minute by an external scheduler and already drains notification_jobs
// to CallMeBot, so this only has to DETECT and enqueue; the delivery path is
// the one that already works. Building a second cron for it would have meant a
// second thing that can silently stop.

/** How long something may sit before it becomes a phone call. */
export const ESCALATE_AFTER_HOURS = 1;

export type StaleItem = {
  kind: "availability" | "payment" | "order";
  reference: string;
  customer: string;
  detail: string;
  waitingSince: string;
};

const refOf = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

/** Whole hours between then and now, floored — "waiting 3h". */
export function hoursWaited(since: string, now: number = Date.now()): number {
  const t = new Date(since).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 3600_000));
}

/**
 * The hour this moment falls in, as a stable string.
 *
 * This is the dedupe key, and it is what turns "check every minute" into "tell
 * him once an hour". Without it the worker would send the same WhatsApp sixty
 * times before he had finished reading the first one, and he would mute the
 * number — which costs far more than the alert was worth.
 */
export function hourBucket(now: number = Date.now()): string {
  return new Date(Math.floor(now / 3600_000) * 3600_000).toISOString().slice(0, 13);
}

/**
 * Everything that has been waiting on the owner for longer than `hours`.
 *
 * Deliberately the same four sources as the Money desk plus the availability
 * queue, because "what is waiting on me" should mean one thing in this product
 * whether he is reading a screen or a phone.
 */
export async function findStale(hours: number = ESCALATE_AFTER_HOURS): Promise<StaleItem[]> {
  if (!hasValidThreshold(hours) || !hasServiceRole()) return [];
  const supabase = await getPrivileged();
  const cutoff = hoursAgoIso(hours);
  const out: StaleItem[] = [];

  // Each source is independent: one failing query must not hide the others,
  // because the whole point of this is that silence is not information.
  const [awaiting, reported, places, orders] = await Promise.allSettled([
    supabase
      .from("bookings")
      .select("id, name, scooter, created_at")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .limit(25),
    supabase
      .from("bookings")
      .select("id, name, scooter, payment_reported_at")
      .not("payment_reported_at", "is", null)
      .is("deposit_paid_at", null)
      .in("status", ["pending", "approved"])
      .lt("payment_reported_at", cutoff)
      .limit(25),
    supabase
      .from("place_bookings")
      .select("id, name, place_name, payment_reported_at")
      .not("payment_reported_at", "is", null)
      .is("deposit_paid_at", null)
      .eq("status", "pending")
      .lt("payment_reported_at", cutoff)
      .limit(25),
    supabase
      .from("orders")
      .select("id, order_number, customer_name, created_at")
      .not("payment_receipt_path", "is", null)
      .eq("status", "pending_payment")
      .lt("created_at", cutoff)
      .limit(25),
  ]);

  if (awaiting.status === "fulfilled") {
    for (const b of (awaiting.value.data ?? []) as Record<string, unknown>[]) {
      out.push({
        kind: "availability",
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "A customer",
        detail: `waiting on availability for ${(b.scooter as string) ?? "a vehicle"}`,
        waitingSince: (b.created_at as string) ?? cutoff,
      });
    }
  } else console.error("escalation: availability queue failed", awaiting.reason);

  if (reported.status === "fulfilled") {
    for (const b of (reported.value.data ?? []) as Record<string, unknown>[]) {
      out.push({
        kind: "payment",
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "A customer",
        detail: `says they paid for ${(b.scooter as string) ?? "a vehicle"}`,
        waitingSince: (b.payment_reported_at as string) ?? cutoff,
      });
    }
  } else console.error("escalation: reported payments failed", reported.reason);

  if (places.status === "fulfilled") {
    for (const b of (places.value.data ?? []) as Record<string, unknown>[]) {
      out.push({
        kind: "payment",
        reference: refOf(b.id as string),
        customer: (b.name as string) ?? "A customer",
        detail: `says they paid for ${(b.place_name as string) ?? "an activity"}`,
        waitingSince: (b.payment_reported_at as string) ?? cutoff,
      });
    }
  } else console.error("escalation: place payments failed", places.reason);

  if (orders.status === "fulfilled") {
    for (const o of (orders.value.data ?? []) as Record<string, unknown>[]) {
      out.push({
        kind: "order",
        reference: (o.order_number as string) ?? "—",
        customer: (o.customer_name as string) ?? "A customer",
        detail: "sent proof of payment for a shop or food order",
        waitingSince: (o.created_at as string) ?? cutoff,
      });
    }
  } else console.error("escalation: orders failed", orders.reason);

  // Longest wait first — the person who has been waiting since this morning is
  // the one the first line of a lock-screen message should be about.
  out.sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  return out;
}

function hasValidThreshold(hours: number): boolean {
  return Number.isFinite(hours) && hours > 0;
}

/**
 * Build the message. Separated from sending so the wording is testable without
 * a database or an HTTP call — WhatsApp has no subject line, so the first line
 * carries the entire meaning on a lock screen.
 */
export function escalationMessage(items: StaleItem[], now: number = Date.now()): string {
  const oldest = items[0];
  const waited = oldest ? hoursWaited(oldest.waitingSince, now) : 0;
  const head =
    items.length === 1
      ? `1 customer waiting ${waited}h`
      : `${items.length} customers waiting — longest ${waited}h`;

  return formatWhatsAppMessage({
    title: `⏳ ${head}`,
    lines: items.slice(0, 5).map(
      (i) => `${i.customer} (${i.reference}) ${i.detail} — ${hoursWaited(i.waitingSince, now)}h`,
    ),
    action: items.length > 5 ? `+${items.length - 5} more in /admin → Money` : "Open /admin → Money",
  });
}

/**
 * Detect and escalate. Safe to call every minute.
 *
 * Returns what it found so the caller can log it. NEVER throws: this runs
 * inside the notification worker, and an escalation that crashes the worker
 * would stop every other message on the platform — the exact opposite of what
 * an alerting system is for.
 */
export async function escalateStale(
  hours: number = ESCALATE_AFTER_HOURS,
): Promise<{ found: number; queued: number }> {
  try {
    const items = await findStale(hours);
    if (items.length === 0) return { found: 0, queued: 0 };

    const queued = await enqueueNotification({
      type: "admin.stale_work",
      category: "admin",
      message: escalationMessage(items),
      payload: { count: items.length, oldest: items[0]?.waitingSince, thresholdHours: hours },
      // One per clock hour. The worker runs every minute; without this he would
      // get the same message sixty times and mute the number.
      dedupeKey: `admin.stale_work:${hourBucket()}`,
    });
    return { found: items.length, queued };
  } catch (err) {
    console.error("escalateStale threw", err);
    return { found: 0, queued: 0 };
  }
}
