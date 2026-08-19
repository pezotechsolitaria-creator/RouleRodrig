import "server-only";
import { enqueueNotification } from "@/lib/notifications/queue";
import type { ProviderName } from "./config";
import type { ProviderUsage, QuotaLevel, ReserveState } from "./quota";

// ── Quota and failure alerts (M41) ──────────────────────────────────────────
//
// Delivered over WhatsApp (CallMeBot), reusing the channel the platform already
// has, for two reasons the brief's §14 asks for and one it does not:
//
//   • §14 says reuse the existing notification infrastructure. This is it.
//   • It reaches the owner in seconds, on the phone he actually carries.
//   • THE THING BEING ALERTED ABOUT IS EMAIL. An email alert about email
//     quota is sent through the exact system that is failing — and at 100% it
//     cannot be sent at all. A quota alarm must not share a fate with the
//     quota.
//
// ── THROTTLE ────────────────────────────────────────────────────────────────
// State lives in app_secrets, NOT in a module variable. Vercel runs many
// serverless instances, so an in-memory guard would let each one alert
// independently — the owner would get the same warning several times over, learn
// that the alerts are noise, and stop reading them. One row, shared by every
// instance, is what makes "once per level per day" true.

const STATE_KEY = "email_alert_state";

type AlertState = Record<string, string>; // alertKey → UTC date last sent

async function readState(): Promise<AlertState> {
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    const { data } = await supabase.from("app_secrets").select("value").eq("key", STATE_KEY).maybeSingle();
    const raw = (data as { value?: string } | null)?.value;
    return raw ? (JSON.parse(raw) as AlertState) : {};
  } catch {
    return {};
  }
}

async function writeState(state: AlertState): Promise<void> {
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    // Keep only recent keys so this row cannot grow without bound.
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const pruned: AlertState = {};
    for (const [k, v] of Object.entries(state)) if (v >= cutoff) pruned[k] = v;
    await supabase.from("app_secrets").upsert([{ key: STATE_KEY, value: JSON.stringify(pruned) }]);
  } catch (err) {
    console.error("[email] alert state write failed", err);
  }
}

const utcDate = () => new Date().toISOString().slice(0, 10);

/**
 * Fires `body` at most once per `key` per UTC day. Returns true when sent.
 *
 * ── SEND, THEN CLAIM (M118) ───────────────────────────────────────────────
 * This used to write the claim BEFORE enqueueing, reasoning that "a lost claim
 * is the same alert repeating from every instance". That reasoning does not
 * apply, because the thing being called is not a send — it is an enqueue
 * guarded by dedupeKey against a UNIQUE index. If two instances raced, the
 * second would collide and return 0. The pre-write prevented no duplicate the
 * database was not already preventing, and it cost every retry.
 *
 * What it did cost is on the record. On 2026-08-09 06:41 the daily cron raised
 * "ticketing reserve may be too small", wrote the claim, and enqueued into a
 * database whose first notification_slot would not exist until 2026-08-11.
 * The loop matched nothing, returned 0 with no error and no log, and the claim
 * was already spent — so every later attempt that day returned early without
 * trying. The alert was never sent and never retried. The burned claim in
 * app_secrets is the only surviving evidence it was ever raised.
 *
 * So the claim is now written only once the message is genuinely queued. The
 * dedupe key still prevents a duplicate if two instances get there at once.
 */
async function alertOncePerDay(key: string, body: string): Promise<boolean> {
  const today = utcDate();
  const state = await readState();
  if (state[key] === today) return false;
  try {
    // `system` category: an infrastructure alarm, not business activity —
    // the owner may well want this on a different phone at 3am.
    const queued = await enqueueNotification({
      type: `email.quota.${key}`,
      category: "system",
      message: body,
      dedupeKey: `email.quota:${key}:${today}`,
    });
    if (queued <= 0) {
      // Nothing was queued: either no recipient takes `system` (queue.ts has
      // already reported that to Sentry) or the RPC failed. Either way the day
      // is NOT claimed, so the next threshold crossing tries again.
      return false;
    }
    state[key] = today;
    await writeState(state);
    return true;
  } catch (err) {
    console.error("[email] quota alert failed to send", err);
    return false;
  }
}

const LEVEL_EMOJI: Record<QuotaLevel, string> = {
  normal: "🟢",
  watch: "🟡",
  warning: "🟠",
  critical: "🔴",
  exhausted: "🚨",
};

/** Levels worth waking the owner for. `watch` is deliberately silent — a 70% day
 *  is normal operation, and alerting on it trains the owner to ignore alerts. */
const ALERTABLE: QuotaLevel[] = ["warning", "critical", "exhausted"];

export async function alertQuotaLevel(usage: ProviderUsage): Promise<void> {
  if (!ALERTABLE.includes(usage.level)) return;
  const window = usage.day.level === usage.level ? usage.day : usage.month;
  const scope = usage.day.level === usage.level ? "today" : "this month";
  const pct = window.percent === null ? "?" : `${window.percent.toFixed(0)}%`;

  const lines = [
    `${LEVEL_EMOJI[usage.level]} EMAIL QUOTA — ${usage.provider.toUpperCase()} ${usage.level.toUpperCase()}`,
    `${window.used} / ${window.limit ?? "∞"} ${scope} (${pct})`,
    window.remaining !== null ? `${window.remaining} remaining` : "",
    usage.level === "exhausted"
      ? "New sends on this provider are being suppressed or routed elsewhere. Check Admin → Alerts & Email."
      : "Check Admin → Alerts & Email to see what is consuming it.",
    usage.provider === "brevo" ? "Note: password resets share this ceiling and are not counted here." : "",
  ].filter(Boolean);

  await alertOncePerDay(`${usage.provider}:${usage.level}`, lines.join("\n"));
}

/** The reserve is configured smaller than the ticket mail it is meant to cover. */
export async function alertReserveInsufficient(reserve: ReserveState): Promise<void> {
  if (reserve.sufficient !== false) return;
  await alertOncePerDay(
    "reserve:insufficient",
    [
      "🟠 TICKETING RESERVE MAY BE TOO SMALL",
      `Reserved: ${reserve.configuredMonthly}/month on ${reserve.provider}`,
      `Estimated need: ${reserve.estimatedRequirement} emails (${reserve.activeEvents} active event${reserve.activeEvents === 1 ? "" : "s"})`,
      "Raise the reserve in Admin → Alerts & Email, or move other email off this provider.",
    ].join("\n"),
  );
}

/**
 * No provider could take an email. §34 of the brief: never drop silently — the
 * row is already recorded as `suppressed`; this is the part that tells a human.
 * Keyed by type so one broken category cannot bury the rest.
 */
export async function alertSendSuppressed(emailType: string, reason: string): Promise<void> {
  await alertOncePerDay(
    `suppressed:${emailType}`,
    [
      "🚨 EMAIL NOT SENT",
      `Type: ${emailType}`,
      `Reason: ${reason}`,
      "It is recorded in Admin → Alerts & Email → recent problems and can be re-sent from there.",
    ].join("\n"),
  );
}

/** A key or sender is wrong. The other provider cannot fix this, so it needs a
 *  human today — this is the failure that silently stops all mail. */
export async function alertProviderAuthFailure(provider: ProviderName, reason: string): Promise<void> {
  await alertOncePerDay(
    `auth:${provider}`,
    [
      `🚨 EMAIL PROVIDER REJECTED OUR CREDENTIALS — ${provider.toUpperCase()}`,
      reason,
      "Emails on this provider are failing. Check the API key and verified sender in Admin → Alerts & Email.",
    ].join("\n"),
  );
}
