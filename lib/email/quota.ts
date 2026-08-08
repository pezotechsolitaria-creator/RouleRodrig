import "server-only";
import { getEmailConfig, type EmailConfig, type ProviderName, type QuotaThresholds } from "./config";
import { countSent } from "./log";
import type { EmailCategory, EmailPriority } from "./types";
import { brevoProvider } from "./providers/brevo";
import { resendProvider } from "./providers/resend";

// ── Quota engine and the conditional ticketing reserve (M41) ────────────────
//
// Everything in the top half of this file is a PURE function of (config, usage)
// so the whole policy — thresholds, reserves, priority exemptions — is testable
// without a database or a provider. The async half only fetches numbers and
// hands them to those functions.
//
// ── WINDOWS ARE UTC, DELIBERATELY ───────────────────────────────────────────
// Rodrigues is UTC+4 and every customer-facing date in this codebase is island
// local time — but a quota window is not a customer-facing date. It belongs to
// the PROVIDER, whose day rolls over at UTC midnight. Counting an island day
// would drift four hours out of step with the ceiling being enforced, and the
// dashboard would read "62 remaining" at the exact moment Brevo started
// refusing. Match the provider, not the island.

export type QuotaLevel = "normal" | "watch" | "warning" | "critical" | "exhausted";

export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Percent of a ceiling consumed. null when the window has no ceiling. */
export function usagePercent(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (limit <= 0) return 100;
  return Math.min(100, (used / limit) * 100);
}

export function quotaLevel(used: number, limit: number | null, t: QuotaThresholds): QuotaLevel {
  if (limit === null) return "normal";
  if (used >= limit) return "exhausted";
  const pct = usagePercent(used, limit) ?? 0;
  if (pct >= t.critical) return "critical";
  if (pct >= t.warning) return "warning";
  if (pct >= t.watch) return "watch";
  return "normal";
}

const LEVEL_RANK: Record<QuotaLevel, number> = { normal: 0, watch: 1, warning: 2, critical: 3, exhausted: 4 };

export function worstLevel(...levels: QuotaLevel[]): QuotaLevel {
  return levels.reduce((a, b) => (LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a), "normal" as QuotaLevel);
}

// ── The reserve decision ────────────────────────────────────────────────────

export type QuotaWindow = "day" | "month";

/**
 * How much of a provider's ceiling this particular email may consume, i.e. the
 * value `used` must stay BELOW.
 *
 * Two reserves may narrow it, and one rule overrides both:
 *
 *   TICKETING RESERVE — subtracted for everything EXCEPT ticketing, and only
 *     while the reserve is active. Non-ticketing traffic therefore cannot spend
 *     the last N sends of the day; ticketing still can.
 *   EMERGENCY RESERVE — subtracted for all non-critical traffic. 0 by default.
 *
 *   CRITICAL IS NEVER RESERVED AGAINST. A reserve exists to guarantee that a
 *     ticket QR or a password reset gets through; blocking one to defend it
 *     would invert its entire purpose. Critical mail is bounded only by the
 *     provider's real ceiling.
 *
 * Returns null for "no ceiling in this window".
 */
export function allowedUsage(opts: {
  cfg: EmailConfig;
  provider: ProviderName;
  category: EmailCategory;
  priority: EmailPriority;
  ticketingActive: boolean;
  window: QuotaWindow;
}): number | null {
  const { cfg, provider, category, priority, ticketingActive, window } = opts;
  const limits = cfg.providers[provider];
  const ceiling = window === "day" ? limits.dailyLimit : limits.monthlyLimit;
  if (ceiling === null) return null;

  if (priority === "critical") return ceiling;

  let reserved = 0;

  const tr = cfg.reserves.ticketing;
  if (tr.provider === provider && category !== "ticketing") {
    const reserveApplies = !tr.onlyWhenActive || ticketingActive;
    if (reserveApplies) reserved += window === "day" ? tr.daily : tr.monthly;
  }

  if (window === "day") reserved += cfg.reserves.emergencyDaily;

  // A reserve larger than the ceiling would produce a negative allowance and
  // block everything non-critical. Clamp: a misconfigured reserve should
  // degrade to "nothing flexible left", never to a negative comparison.
  return Math.max(0, ceiling - reserved);
}

export type CapacityDecision =
  | { allowed: true }
  | { allowed: false; blockedBy: "ceiling" | "reserve"; window: QuotaWindow; reason: string };

/**
 * May this provider take this email right now?
 *
 * `dayUsed`/`monthUsed` of -1 means the log could not be read. That FAILS OPEN
 * — the send proceeds. This is a real trade-off, made deliberately: the worst
 * case of failing open is overshooting a free-tier ceiling and getting a 429
 * (which the router then classifies and can fall back on), while the worst case
 * of failing closed is that a database blip silently stops every booking
 * confirmation on the platform. The blip is far more likely than the overshoot.
 */
export function decideCapacity(opts: {
  cfg: EmailConfig;
  provider: ProviderName;
  category: EmailCategory;
  priority: EmailPriority;
  dayUsed: number;
  monthUsed: number;
  ticketingActive: boolean;
}): CapacityDecision {
  const { cfg, provider, category, priority, dayUsed, monthUsed, ticketingActive } = opts;

  for (const window of ["day", "month"] as QuotaWindow[]) {
    const used = window === "day" ? dayUsed : monthUsed;
    if (used < 0) continue; // usage unknown → cannot justify blocking
    const allowance = allowedUsage({ cfg, provider, category, priority, ticketingActive, window });
    if (allowance === null) continue;
    if (used < allowance) continue;

    const ceiling = window === "day" ? cfg.providers[provider].dailyLimit : cfg.providers[provider].monthlyLimit;
    const atCeiling = ceiling !== null && used >= ceiling;
    return {
      allowed: false,
      blockedBy: atCeiling ? "ceiling" : "reserve",
      window,
      reason: atCeiling
        ? `${provider} ${window} ceiling reached (${used}/${ceiling})`
        : `${provider} ${window} flexible capacity exhausted (${used}/${allowance}); remainder is reserved`,
    };
  }
  return { allowed: true };
}

// ── "Active ticketing", from the schema and nothing else ────────────────────
//
// M33 defines an event precisely, so this predicate is read off the schema
// rather than guessed:
//
//   published        stores.status = 'active'
//                    (the enum is draft|active|paused|holiday|closed, and
//                     store_is_visible() already makes a draft unpurchasable —
//                     so 'active' is exactly "on sale")
//   not cancelled    events.cancelled_at is null
//                    (M33: "cancellation is a FACT with a time, not a status
//                     word", so absence of the timestamp is the live state)
//   not over         coalesce(ends_at, starts_at) >= now()
//                    (ends_at is nullable; a single-instant event is over when
//                     it starts)
//
// When this is false the reserve releases itself. There is no cleanup job and
// nothing to unlock: the predicate simply stops being true, which is why
// "ticketing ends → unused capacity returns to the pool" needs no code.

const TICKETING_TTL = 60_000;
let ticketingCache: { active: boolean; count: number; at: number } | null = null;

export interface TicketingActivity {
  active: boolean;
  activeEvents: number;
  /** False when the check itself failed — the caller must not treat that as
   *  "no events" and quietly drop a reserve that should be protecting a live
   *  on-sale. */
  known: boolean;
}

export async function getTicketingActivity(): Promise<TicketingActivity> {
  if (ticketingCache && Date.now() - ticketingCache.at < TICKETING_TTL) {
    return { active: ticketingCache.active, activeEvents: ticketingCache.count, known: true };
  }
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    const nowIso = new Date().toISOString();

    // Two filters cover coalesce(ends_at, starts_at) >= now() without a SQL
    // function: an event with an end date is live until that end, one without is
    // live until it starts.
    const { data, error } = await supabase
      .from("events")
      .select("store_id, starts_at, ends_at, stores!inner(status)")
      .is("cancelled_at", null)
      .eq("stores.status", "active")
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
      .limit(200);
    if (error) throw error;

    const count = (data ?? []).length;
    ticketingCache = { active: count > 0, count, at: Date.now() };
    return { active: count > 0, activeEvents: count, known: true };
  } catch (err) {
    console.error("[email] ticketing activity check failed", err);
    // Unknown ≠ inactive. Reported as active so a reserve protecting a live
    // on-sale is not dropped by a transient database error — the safe direction
    // is to keep protecting capacity, since the only cost is that some normal
    // mail routes elsewhere.
    return { active: true, activeEvents: 0, known: false };
  }
}

export function invalidateTicketingCache(): void {
  ticketingCache = null;
}

// ── Usage snapshot ──────────────────────────────────────────────────────────

export interface WindowUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number | null;
  level: QuotaLevel;
}

export interface ProviderUsage {
  provider: ProviderName;
  enabled: boolean;
  configured: boolean;
  configReason?: string;
  day: WindowUsage;
  month: WindowUsage;
  level: QuotaLevel;
  /** False when the log could not be read; every number below is then a guess. */
  usageKnown: boolean;
  /** Capacity this provider spends that the application cannot see or count. */
  blindSpot?: string;
}

const BREVO_BLIND_SPOT =
  "Brevo's free 300/day is shared with the SMTP relay Supabase Auth uses for password resets and " +
  "signup confirmations, and with any automation built inside Brevo. Those sends are invisible here, " +
  "so this figure is a FLOOR — real usage is higher by that amount.";

function windowUsage(used: number, limit: number | null, t: QuotaThresholds): WindowUsage {
  const safeUsed = used < 0 ? 0 : used;
  return {
    used: safeUsed,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - safeUsed),
    percent: usagePercent(safeUsed, limit),
    level: quotaLevel(safeUsed, limit, t),
  };
}

export async function getProviderUsage(provider: ProviderName, cfg?: EmailConfig): Promise<ProviderUsage> {
  const config = cfg ?? (await getEmailConfig());
  const limits = config.providers[provider];
  const impl = provider === "resend" ? resendProvider : brevoProvider;

  const [dayUsed, monthUsed, health] = await Promise.all([
    countSent(provider, startOfUtcDay()),
    countSent(provider, startOfUtcMonth()),
    impl.health().catch(() => ({ configured: false, reason: "health check failed" })),
  ]);

  const day = windowUsage(dayUsed, limits.dailyLimit, config.thresholds);
  const month = windowUsage(monthUsed, limits.monthlyLimit, config.thresholds);

  return {
    provider,
    enabled: limits.enabled,
    configured: health.configured,
    configReason: health.reason,
    day,
    month,
    level: worstLevel(day.level, month.level),
    usageKnown: dayUsed >= 0 && monthUsed >= 0,
    ...(provider === "brevo" ? { blindSpot: BREVO_BLIND_SPOT } : {}),
  };
}

// ── Reserve state, for the dashboard ────────────────────────────────────────

/**
 * Emails per ticket sold, used only to warn when the reserve looks too small.
 *
 * 2 = order confirmation + QR delivery. A deliberately crude constant rather
 * than a forecast: no ticket email exists yet, so anything more sophisticated
 * would be modelling traffic nobody has observed. It becomes a real setting when
 * the ticketing emails land and their actual fan-out is known.
 */
export const EMAILS_PER_TICKET = 2;

export interface ReserveState {
  provider: ProviderName;
  configuredDaily: number;
  configuredMonthly: number;
  onlyWhenActive: boolean;
  ticketingActive: boolean;
  ticketingKnown: boolean;
  activeEvents: number;
  /** What is actually held back right now — 0 when the reserve is dormant. */
  protectedDaily: number;
  protectedMonthly: number;
  /** Ceiling minus what is protected. null when that window has no ceiling. */
  flexibleDaily: number | null;
  flexibleMonthly: number | null;
  /** Unsold ticket capacity × EMAILS_PER_TICKET. null when not computable. */
  estimatedRequirement: number | null;
  /** null when there is nothing to compare (no active ticketing, or unknown). */
  sufficient: boolean | null;
}

/**
 * Unsold ticket capacity across live events, as an email requirement.
 *
 * Uses only data that already exists — product_variants.stock_quantity IS the
 * remaining capacity, because M34 made a ticket type a variant and capacity its
 * stock. No forecasting, no history, no model.
 */
export async function estimateTicketingRequirement(): Promise<number | null> {
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    const nowIso = new Date().toISOString();

    const { data: eventRows, error: eventError } = await supabase
      .from("events")
      .select("store_id, stores!inner(status)")
      .is("cancelled_at", null)
      .eq("stores.status", "active")
      .or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`)
      .limit(200);
    if (eventError) throw eventError;
    const storeIds = [...new Set(((eventRows ?? []) as { store_id: string }[]).map((r) => r.store_id))];
    if (!storeIds.length) return 0;

    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id")
      .in("store_id", storeIds)
      .limit(1000);
    if (productError) throw productError;
    const productIds = ((productRows ?? []) as { id: string }[]).map((r) => r.id);
    if (!productIds.length) return 0;

    // ticket_types!inner is what restricts this to TICKET variants — a variant
    // with no ticket_types row is an ordinary shop product (M34's guard), and
    // counting its stock would inflate the estimate with bags of rice.
    const { data: variantRows, error: variantError } = await supabase
      .from("product_variants")
      .select("stock_quantity, ticket_types!inner(variant_id)")
      .in("product_id", productIds)
      .eq("is_active", true)
      .limit(2000);
    if (variantError) throw variantError;

    const unsold = ((variantRows ?? []) as { stock_quantity: number | null }[]).reduce(
      (sum, v) => sum + Math.max(0, v.stock_quantity ?? 0),
      0,
    );
    return unsold * EMAILS_PER_TICKET;
  } catch (err) {
    console.error("[email] ticketing requirement estimate failed", err);
    return null;
  }
}

export async function getReserveState(cfg?: EmailConfig): Promise<ReserveState> {
  const config = cfg ?? (await getEmailConfig());
  const tr = config.reserves.ticketing;
  const activity = await getTicketingActivity();
  const applies = !tr.onlyWhenActive || activity.active;

  const protectedDaily = applies ? tr.daily : 0;
  const protectedMonthly = applies ? tr.monthly : 0;
  const limits = config.providers[tr.provider];

  const estimate = activity.active ? await estimateTicketingRequirement() : 0;

  return {
    provider: tr.provider,
    configuredDaily: tr.daily,
    configuredMonthly: tr.monthly,
    onlyWhenActive: tr.onlyWhenActive,
    ticketingActive: activity.active,
    ticketingKnown: activity.known,
    activeEvents: activity.activeEvents,
    protectedDaily,
    protectedMonthly,
    flexibleDaily: limits.dailyLimit === null ? null : Math.max(0, limits.dailyLimit - protectedDaily),
    flexibleMonthly: limits.monthlyLimit === null ? null : Math.max(0, limits.monthlyLimit - protectedMonthly),
    estimatedRequirement: estimate,
    // Compared against the MONTHLY reserve: an event's whole sell-through is a
    // campaign measured in weeks, not one day, so the monthly figure is the one
    // that can actually cover it.
    sufficient: estimate === null || !activity.active ? null : protectedMonthly >= estimate,
  };
}
