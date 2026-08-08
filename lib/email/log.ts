import "server-only";
import type { ProviderName } from "./config";
import type { EmailCategory, EmailPriority } from "./types";

// ── email_log reader/writer (M41) ───────────────────────────────────────────
//
// This module owns the table. Two jobs:
//
//   1. THE IDEMPOTENCY CLAIM. `beginSend()` INSERTs before anything is sent,
//      and the UNIQUE constraint on idempotency_key is what makes exactly-once
//      real. This is deliberately not a check-then-insert: two concurrent
//      requests would both read "not sent" and both send. The insert IS the
//      lock, decided by Postgres, which is the only participant that can see
//      both callers.
//
//   2. THE USAGE SOURCE. Quota counts are SELECT COUNT(*) over accepted sends,
//      never a stored counter. A counter drifts the first moment a process dies
//      between the send and the increment; a derived count cannot drift, and it
//      stays correct across redeploys, rollbacks and concurrent instances.

export type EmailLogStatus = "queued" | "sent" | "failed" | "unknown" | "suppressed";

export interface BeginSendInput {
  emailType: string;
  category: EmailCategory;
  priority: EmailPriority;
  recipient: string;
  subject: string;
  idempotencyKey?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
}

export type BeginSendResult =
  /** Row claimed — proceed to send. */
  | { state: "claimed"; id: string; attempt: number }
  /** This exact logical email already went out (or is in flight). Send nothing. */
  | { state: "duplicate"; existingStatus: EmailLogStatus }
  /** The log is unreachable. Caller sends anyway, WITHOUT idempotency. */
  | { state: "unavailable" };

async function admin() {
  const { getPrivileged } = await import("@/lib/supabase/admin");
  return getPrivileged();
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "23505" || /duplicate key|unique constraint/i.test(e?.message ?? "");
}

/**
 * Claims the right to send. Returns `duplicate` when this logical email has
 * already been accepted, is in flight, or ended in an ambiguous state.
 *
 * A previous `failed` or `suppressed` attempt is RECLAIMED rather than treated
 * as a duplicate: those are known non-deliveries, so re-sending cannot produce a
 * second email, and the daily cron depends on exactly this (it leaves
 * pickup_reminded unset on failure precisely so tomorrow's run tries again).
 *
 * A previous `unknown` is NOT reclaimed. That is the whole point of having the
 * status: acceptance could not be determined, so a retry is the one action that
 * could put two identical emails in a customer's inbox.
 */
export async function beginSend(input: BeginSendInput): Promise<BeginSendResult> {
  let supabase;
  try {
    supabase = await admin();
  } catch {
    return { state: "unavailable" };
  }

  const row = {
    email_type: input.emailType,
    category: input.category,
    priority: input.priority,
    recipient: input.recipient,
    subject: input.subject.slice(0, 300),
    idempotency_key: input.idempotencyKey || null,
    related_type: input.relatedType || null,
    related_id: input.relatedId || null,
    status: "queued" as const,
    attempt_count: 1,
  };

  const { data, error } = await supabase.from("email_log").insert(row).select("id").maybeSingle();

  if (!error) {
    const id = (data as { id?: string } | null)?.id;
    if (id) return { state: "claimed", id, attempt: 1 };
    // Insert reported success but returned nothing — most likely the anon
    // fallback client with RLS silently filtering the returned row. Treat the
    // log as unavailable rather than pretending to hold a claim.
    return { state: "unavailable" };
  }

  if (!isUniqueViolation(error) || !input.idempotencyKey) {
    console.error("[email] email_log insert failed — sending without idempotency", error.message);
    return { state: "unavailable" };
  }

  // Someone else holds this key. Decide from its state whether a resend is safe.
  const { data: existing, error: readError } = await supabase
    .from("email_log")
    .select("id, status, attempt_count")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (readError || !existing) {
    console.error("[email] duplicate key but existing row unreadable — refusing to send", readError?.message);
    return { state: "duplicate", existingStatus: "unknown" };
  }

  const ex = existing as { id: string; status: EmailLogStatus; attempt_count: number };
  if (ex.status !== "failed" && ex.status !== "suppressed") {
    return { state: "duplicate", existingStatus: ex.status };
  }

  // Reclaim: flip back to queued only if it is STILL failed/suppressed, so a
  // concurrent reclaimer cannot also win.
  const attempt = ex.attempt_count + 1;
  const { data: reclaimed } = await supabase
    .from("email_log")
    .update({ status: "queued", attempt_count: attempt, failure_reason: null, failed_at: null })
    .eq("id", ex.id)
    .in("status", ["failed", "suppressed"])
    .select("id")
    .maybeSingle();

  if (!reclaimed) return { state: "duplicate", existingStatus: ex.status };
  return { state: "claimed", id: ex.id, attempt };
}

export async function markSent(
  id: string,
  provider: ProviderName,
  messageId: string | null,
  attempt: number,
): Promise<void> {
  try {
    const supabase = await admin();
    await supabase
      .from("email_log")
      .update({
        status: "sent",
        provider,
        provider_message_id: messageId,
        sent_at: new Date().toISOString(),
        attempt_count: attempt,
        failure_reason: null,
      })
      .eq("id", id);
  } catch (err) {
    // The email DID go out. A failed log update must never look like a failed
    // send, so this is logged and swallowed.
    console.error("[email] markSent failed (email was delivered)", err);
  }
}

export async function markNotSent(
  id: string,
  status: Extract<EmailLogStatus, "failed" | "unknown" | "suppressed">,
  reason: string,
  attempt: number,
  provider?: ProviderName | null,
): Promise<void> {
  try {
    const supabase = await admin();
    await supabase
      .from("email_log")
      .update({
        status,
        failure_reason: reason.slice(0, 500),
        failed_at: new Date().toISOString(),
        attempt_count: attempt,
        ...(provider ? { provider } : {}),
      })
      .eq("id", id);
  } catch (err) {
    console.error("[email] markNotSent failed", err);
  }
}

// ── Usage + reporting reads ─────────────────────────────────────────────────

/** Accepted sends by one provider since `since`. The quota primitive. */
export async function countSent(provider: ProviderName, since: Date): Promise<number> {
  try {
    const supabase = await admin();
    const { count, error } = await supabase
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("provider", provider)
      .not("sent_at", "is", null)
      .gte("sent_at", since.toISOString());
    if (error) throw error;
    return count ?? 0;
  } catch (err) {
    // Returning 0 would report full headroom and could let the app blow past a
    // ceiling. Returning null lets the caller mark usage "unknown" and stop
    // making reserve decisions it cannot justify.
    console.error("[email] countSent failed", err);
    return -1;
  }
}

export interface TypeVolume {
  emailType: string;
  count: number;
}

/**
 * "What is eating the quota?" — the breakdown that makes the dashboard
 * actionable rather than decorative. Aggregated in JS because the row counts
 * here are tiny (hundreds/day at the ceiling) and a SQL view would need its own
 * migration and grants for no measurable gain.
 */
export async function topTypes(since: Date, provider?: ProviderName, limit = 10): Promise<TypeVolume[]> {
  try {
    const supabase = await admin();
    let q = supabase
      .from("email_log")
      .select("email_type")
      .not("sent_at", "is", null)
      .gte("sent_at", since.toISOString())
      .limit(5000);
    if (provider) q = q.eq("provider", provider);
    const { data, error } = await q;
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { email_type: string }[]) {
      counts.set(r.email_type, (counts.get(r.email_type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([emailType, count]) => ({ emailType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  } catch (err) {
    console.error("[email] topTypes failed", err);
    return [];
  }
}

export interface ActivityRow {
  id: string;
  createdAt: string;
  sentAt: string | null;
  emailType: string;
  category: string;
  priority: string;
  provider: string | null;
  status: EmailLogStatus;
  recipient: string;
  relatedType: string | null;
  relatedId: string | null;
  failureReason: string | null;
  attemptCount: number;
}

const toActivity = (r: Record<string, unknown>): ActivityRow => ({
  id: r.id as string,
  createdAt: r.created_at as string,
  sentAt: (r.sent_at as string) ?? null,
  emailType: r.email_type as string,
  category: r.category as string,
  priority: r.priority as string,
  provider: (r.provider as string) ?? null,
  status: r.status as EmailLogStatus,
  recipient: r.recipient as string,
  relatedType: (r.related_type as string) ?? null,
  relatedId: (r.related_id as string) ?? null,
  failureReason: (r.failure_reason as string) ?? null,
  attemptCount: (r.attempt_count as number) ?? 0,
});

const ACTIVITY_COLS =
  "id, created_at, sent_at, email_type, category, priority, provider, status, recipient, related_type, related_id, failure_reason, attempt_count";

/** Recent email activity, newest first, with optional filters. */
export async function recentActivity(
  opts: { limit?: number; provider?: ProviderName; status?: EmailLogStatus; category?: string } = {},
): Promise<ActivityRow[]> {
  try {
    const supabase = await admin();
    let q = supabase.from("email_log").select(ACTIVITY_COLS).order("created_at", { ascending: false });
    if (opts.provider) q = q.eq("provider", opts.provider);
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.category) q = q.eq("category", opts.category);
    const { data, error } = await q.limit(Math.min(opts.limit ?? 25, 200));
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(toActivity);
  } catch (err) {
    console.error("[email] recentActivity failed", err);
    return [];
  }
}

/**
 * Everything that needs a human: outright failures, plus the ambiguous and
 * suppressed rows that will never resolve themselves. §34 of the brief — an
 * undelivered email must be recoverable, which requires it being visible.
 */
export async function recentProblems(limit = 20): Promise<ActivityRow[]> {
  try {
    const supabase = await admin();
    const { data, error } = await supabase
      .from("email_log")
      .select(ACTIVITY_COLS)
      .in("status", ["failed", "unknown", "suppressed"])
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200));
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map(toActivity);
  } catch (err) {
    console.error("[email] recentProblems failed", err);
    return [];
  }
}

/** Counts by status since `since` — the dashboard's headline numbers. */
export async function statusCounts(since: Date): Promise<Record<EmailLogStatus, number>> {
  const empty: Record<EmailLogStatus, number> = { queued: 0, sent: 0, failed: 0, unknown: 0, suppressed: 0 };
  try {
    const supabase = await admin();
    const { data, error } = await supabase
      .from("email_log")
      .select("status")
      .gte("created_at", since.toISOString())
      .limit(5000);
    if (error) throw error;
    for (const r of (data ?? []) as { status: EmailLogStatus }[]) {
      if (r.status in empty) empty[r.status] += 1;
    }
    return empty;
  } catch (err) {
    console.error("[email] statusCounts failed", err);
    return empty;
  }
}
