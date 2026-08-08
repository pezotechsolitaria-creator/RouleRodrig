import "server-only";
import { getEmailConfig, routeFor, type EmailConfig, type ProviderName } from "./config";
import { beginSend, countSent, markNotSent, markSent } from "./log";
import {
  decideCapacity,
  getTicketingActivity,
  quotaLevel,
  startOfUtcDay,
  startOfUtcMonth,
  worstLevel,
  type QuotaLevel,
} from "./quota";
import { emailTypeMeta, type EmailType } from "./types";
import { brevoProvider } from "./providers/brevo";
import { resendProvider } from "./providers/resend";
import type { Attachment, EmailProvider, FailureClass, SendOutcome } from "./providers/types";
import { alertProviderAuthFailure, alertSendSuppressed } from "./alerts";

// ── The central email router (M41) ──────────────────────────────────────────
//
// THE ONLY WAY AN EMAIL LEAVES THIS PLATFORM. Business logic calls
// sendTransactionalEmail() with a TYPE and never learns which provider carried
// it — that is the whole contract, and it is what lets routing change in a
// settings form instead of a refactor.
//
// Order of operations, and every step is load-bearing:
//
//   1. type → category + priority          (types.ts registry)
//   2. claim the idempotency key           (Postgres UNIQUE — the real lock)
//   3. pick candidate providers            (routing config, then fallback)
//   4. check quota + reserve per candidate (pure policy in quota.ts)
//   5. send, retrying ONLY transient failures against the SAME provider
//   6. record the outcome, alert a human when nobody could take it
//
// It never throws. Every caller of the old send() treated email as best-effort —
// a booking must not fail because a mail provider did — and that property is
// preserved exactly.

export interface SendTransactionalInput {
  type: EmailType | string;
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
  /**
   * Stable, event-specific key: `marketplace_order_confirmation:<orderId>`.
   * Omit ONLY when the send has no natural once-only identity (an admin test,
   * an ad-hoc alert). Present ⇒ Postgres guarantees exactly-once.
   */
  idempotencyKey?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
}

export interface SendTransactionalResult {
  ok: boolean;
  provider?: ProviderName;
  /** The logical email had already been sent. `ok` is true: it exists in the
   *  customer's inbox, which is what a caller flagging "reminded" needs to know. */
  deduped?: boolean;
  /** Deliberately not sent (no capacity, no configured provider). Recorded. */
  suppressed?: boolean;
  /** Provider acceptance could not be determined. Never auto-retried. */
  ambiguous?: boolean;
  reason?: string;
}

const IMPLS: Record<ProviderName, EmailProvider> = { resend: resendProvider, brevo: brevoProvider };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fires a quota alert if this send pushed a provider past a threshold.
 *
 * Uses the counts the router already fetched, and returns immediately unless the
 * level is one worth alerting on — so the common case adds no work at all. The
 * post-send count is `used + 1`, since the row we just marked `sent` is not in
 * the number we read before sending.
 */
async function maybeAlertQuota(
  cfg: EmailConfig,
  provider: ProviderName,
  dayUsed: number,
  monthUsed: number,
): Promise<void> {
  const limits = cfg.providers[provider];
  const day = dayUsed < 0 ? null : quotaLevel(dayUsed + 1, limits.dailyLimit, cfg.thresholds);
  const month = monthUsed < 0 ? null : quotaLevel(monthUsed + 1, limits.monthlyLimit, cfg.thresholds);
  const level = worstLevel(...([day, month].filter(Boolean) as QuotaLevel[]));
  if (level !== "warning" && level !== "critical" && level !== "exhausted") return;

  const { alertQuotaLevel } = await import("./alerts");
  const { getProviderUsage } = await import("./quota");
  await alertQuotaLevel(await getProviderUsage(provider, cfg));
}

/** Failure classes that mean "nothing was accepted, and the other provider has
 *  a genuinely different chance of succeeding". Only `quota` qualifies:
 *  `auth`/`permanent`/`invalid` fail identically elsewhere, and `unknown` may
 *  already have been delivered. */
function allowsFailover(failure: FailureClass): boolean {
  return failure === "quota";
}

/**
 * Attempts one provider, retrying transient failures against that SAME provider.
 * Never crosses to another provider — that decision belongs to the caller, which
 * can see the routing config and the fallback rules.
 */
async function attemptProvider(
  impl: EmailProvider,
  payload: { to: string; subject: string; html: string; attachments?: Attachment[] },
  cfg: EmailConfig,
): Promise<{ outcome: SendOutcome; attempts: number }> {
  let attempts = 0;
  let last: SendOutcome = { ok: false, failure: "unknown", reason: "no attempt made" };

  for (let i = 0; i < cfg.retry.maxAttempts; i++) {
    attempts++;
    last = await impl.send(payload);
    if (last.ok) return { outcome: last, attempts };
    if (last.failure !== "transient") return { outcome: last, attempts };
    // Exponential backoff, but never on the final iteration — sleeping after the
    // last attempt only bills the function for nothing.
    if (i < cfg.retry.maxAttempts - 1) await sleep(cfg.retry.baseDelayMs * 2 ** i);
  }
  return { outcome: last, attempts };
}

/**
 * Send one transactional email.
 *
 * Returns `ok: true` when the email was accepted by a provider OR had already
 * been sent (dedupe). Returns `ok: false` when it was suppressed, rejected, or
 * left ambiguous — and in every one of those cases there is a row in email_log
 * explaining which, so nothing is ever silently dropped.
 */
export async function sendTransactionalEmail(input: SendTransactionalInput): Promise<SendTransactionalResult> {
  const to = (input.to ?? "").trim();
  if (!to) return { ok: false, reason: "no recipient" };

  const meta = emailTypeMeta(input.type);
  const cfg = await getEmailConfig();

  // ── 1. Claim ─────────────────────────────────────────────────────────────
  const claim = await beginSend({
    emailType: String(input.type),
    category: meta.category,
    priority: meta.priority,
    recipient: to,
    subject: input.subject,
    idempotencyKey: input.idempotencyKey ?? null,
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
  });

  if (claim.state === "duplicate") {
    // Already delivered, in flight, or ambiguous. In all three cases sending
    // again is the wrong move; an ambiguous prior attempt especially so.
    return {
      ok: claim.existingStatus === "sent" || claim.existingStatus === "queued",
      deduped: true,
      ambiguous: claim.existingStatus === "unknown",
      reason: `already ${claim.existingStatus}`,
    };
  }

  const logId = claim.state === "claimed" ? claim.id : null;
  const attemptNo = claim.state === "claimed" ? claim.attempt : 1;
  // A missing log is degraded, not fatal: this is exactly what the platform did
  // before M41 (send, no record, no idempotency), so falling back to it cannot
  // be a regression — but it must be loud, because silent loss of idempotency is
  // how duplicates reappear.
  if (!logId) {
    console.error(
      `[email] proceeding WITHOUT idempotency or logging for ${String(input.type)} — email_log unavailable`,
    );
  }

  // ── 2. Candidate providers ───────────────────────────────────────────────
  const preferred = routeFor(cfg, input.type);
  const other: ProviderName = preferred === "resend" ? "brevo" : "resend";
  const failoverAllowed = cfg.fallback.enabled && !cfg.fallback.exceptTypes.includes(input.type as EmailType);
  const candidates: ProviderName[] = failoverAllowed ? [preferred, other] : [preferred];

  const payload = { to, subject: input.subject, html: input.html, attachments: input.attachments };
  const blockers: string[] = [];
  let sawAuthFailure: { provider: ProviderName; reason: string } | null = null;

  for (const name of candidates) {
    const limits = cfg.providers[name];
    if (!limits.enabled) {
      blockers.push(`${name}: disabled in settings`);
      continue;
    }
    const impl = IMPLS[name];
    const health = await impl.health();
    if (!health.configured) {
      blockers.push(`${name}: ${health.reason ?? "not configured"}`);
      continue;
    }

    // ── 3. Quota + reserve ─────────────────────────────────────────────────
    // Only consulted when this provider actually has a ceiling to enforce; a
    // paid plan with no limits skips two count queries per send.
    let decision = { allowed: true } as ReturnType<typeof decideCapacity>;
    let dayUsed = -1;
    let monthUsed = -1;
    if (limits.dailyLimit !== null || limits.monthlyLimit !== null) {
      const ticketing = await getTicketingActivity();
      [dayUsed, monthUsed] = await Promise.all([
        limits.dailyLimit === null ? Promise.resolve(-1) : countSent(name, startOfUtcDay()),
        limits.monthlyLimit === null ? Promise.resolve(-1) : countSent(name, startOfUtcMonth()),
      ]);
      decision = decideCapacity({
        cfg,
        provider: name,
        category: meta.category,
        priority: meta.priority,
        dayUsed,
        monthUsed,
        ticketingActive: ticketing.active,
      });
    }
    if (!decision.allowed) {
      blockers.push(`${name}: ${decision.reason}`);
      continue; // a capacity block is precisely when trying the other provider is safe
    }

    // ── 4. Send ────────────────────────────────────────────────────────────
    const { outcome, attempts } = await attemptProvider(impl, payload, cfg);
    const totalAttempts = attemptNo + attempts - 1;

    if (outcome.ok) {
      if (logId) await markSent(logId, name, outcome.messageId, totalAttempts);
      // Alert on the way past a threshold, using the counts already fetched
      // above — so a busy day is noticed as it happens rather than at the next
      // cron run. Deliberately gated on the level being alertable BEFORE the
      // alert module is touched: at normal levels this costs nothing, and the
      // throttle's own state read only happens when there is something to say.
      void maybeAlertQuota(cfg, name, dayUsed, monthUsed).catch(() => {});
      return { ok: true, provider: name };
    }

    if (outcome.failure === "auth") {
      // Remember it, but keep trying the other provider — a dead key on one side
      // should not stop a working provider on the other.
      sawAuthFailure = { provider: name, reason: outcome.reason };
      blockers.push(`${name}: ${outcome.reason}`);
      continue;
    }

    if (outcome.failure === "unknown") {
      // THE ONE CASE THAT MUST STOP HERE. The provider may already have accepted
      // and delivered it; a failover or retry now is how a customer gets two
      // tickets. Recorded for reconciliation against provider_message_id.
      if (logId) await markNotSent(logId, "unknown", outcome.reason, totalAttempts, name);
      console.error(`[email] ${String(input.type)} left AMBIGUOUS on ${name} — not retried: ${outcome.reason}`);
      return { ok: false, provider: name, ambiguous: true, reason: outcome.reason };
    }

    if (!allowsFailover(outcome.failure)) {
      // permanent / invalid: the other provider rejects it identically.
      if (logId) await markNotSent(logId, "failed", outcome.reason, totalAttempts, name);
      return { ok: false, provider: name, reason: outcome.reason };
    }

    // quota exhausted at the provider itself — nothing was accepted, so moving
    // to the other provider cannot duplicate anything.
    blockers.push(`${name}: ${outcome.reason}`);
  }

  // ── 5. Nobody could take it ──────────────────────────────────────────────
  const reason = blockers.join(" | ") || "no provider available";
  if (logId) await markNotSent(logId, "suppressed", reason, attemptNo);

  if (sawAuthFailure) {
    void alertProviderAuthFailure(sawAuthFailure.provider, sawAuthFailure.reason).catch(() => {});
  }
  // §34: never drop silently. The row above is the record; this is the human.
  void alertSendSuppressed(String(input.type), reason).catch(() => {});
  console.error(`[email] ${String(input.type)} NOT SENT — ${reason}`);

  return { ok: false, suppressed: true, reason };
}
