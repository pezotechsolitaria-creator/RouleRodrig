import "server-only";
import type { EmailType } from "./types";

// ── Configurable email infrastructure settings (M41) ────────────────────────
//
// NOTHING in this file's numbers is hard-coded at a call site. Every limit,
// threshold, reserve and route resolves through getEmailConfig(), which layers:
//
//   code defaults (below)  ←  app_secrets['email_config'] JSON  ←  admin UI
//
// So when Resend changes its free tier, or the owner wants ticketing on Brevo
// instead, or the reserve should be 100 rather than 300, that is a settings
// edit — not a deploy, and certainly not a rewrite. The same no-redeploy
// pattern the Brevo key and the CallMeBot credentials already use.

export type ProviderName = "resend" | "brevo";

export const PROVIDER_NAMES: ProviderName[] = ["resend", "brevo"];

export interface ProviderLimits {
  enabled: boolean;
  /** Sends per UTC day. null = no daily ceiling (i.e. a paid plan). */
  dailyLimit: number | null;
  /** Sends per UTC calendar month. null = no monthly ceiling. */
  monthlyLimit: number | null;
}

export interface QuotaThresholds {
  /** Percent of a ceiling at which each level begins. */
  watch: number;
  warning: number;
  critical: number;
}

export interface TicketingReserve {
  /** Which provider's capacity is protected. */
  provider: ProviderName;
  /** Protected sends per UTC day. */
  daily: number;
  /** Protected sends per UTC calendar month. */
  monthly: number;
  /**
   * When true the reserve applies ONLY while ticketing is actually active
   * (see isTicketingActive() in ./quota). With no published, uncancelled,
   * not-yet-finished event, protected capacity returns to the flexible pool
   * instead of sitting locked against a business line that isn't running.
   */
  onlyWhenActive: boolean;
}

export interface EmailConfig {
  /**
   * Where OWNER alerts go — new booking, new ride, new enquiry.
   *
   * This lived only in an OWNER_EMAIL environment variable, which had never
   * been set on any environment, so every owner alert silently fell back to
   * the CONTACT_EMAIL on the domain. Brevo delivered them; nobody read them.
   * A setting the business depends on should not require a redeploy to change,
   * so it is stored here and the env var, if present, still wins.
   *
   * Null means "no override" — fall back exactly as before.
   */
  ownerEmail: string | null;
  /** Used for any type with no explicit route. */
  defaultProvider: ProviderName;
  providers: Record<ProviderName, ProviderLimits>;
  thresholds: QuotaThresholds;
  reserves: {
    ticketing: TicketingReserve;
    /** Held back from ALL non-critical traffic on every provider. Off by
     *  default — a second reserve on a 100/day bucket mostly just shrinks the
     *  usable pool. Here because the brief asks for the concept, at 0 because
     *  the platform does not need it yet. */
    emergencyDaily: number;
  };
  /** Per-type overrides. Absent = defaultProvider. */
  routing: Partial<Record<EmailType, ProviderName>>;
  fallback: {
    /** Fallback is attempted ONLY when the preferred provider is quota-blocked
     *  — never on an ambiguous transport failure, where re-sending through the
     *  other provider is what actually duplicates a delivery. */
    enabled: boolean;
    /** Types that must never cross to the other provider even when blocked
     *  (e.g. a sender identity verified at only one provider). */
    exceptTypes: EmailType[];
  };
  retry: {
    /** Total attempts against the SAME provider for a transient failure. */
    maxAttempts: number;
    baseDelayMs: number;
  };
}

// ── Defaults ────────────────────────────────────────────────────────────────
// Verified against both providers' published free tiers on 2026-08-08. Kept
// here rather than inline so a tier change is a one-line edit with a date next
// to it, and so a stale number is visible instead of scattered.
//
//   Resend free — 3,000/month AND 100/day, 1 verified domain.
//     The DAILY cap is the one that catches people out and the one the brief
//     did not account for. 100/day is what actually binds.
//   Brevo free  — 300/day, shared across marketing, transactional API AND the
//     SMTP relay. Supabase Auth sends through that relay, so part of this
//     ceiling is consumed by traffic the application cannot see or count.
//     No separate monthly ceiling: 300/day is the whole constraint.
export const DEFAULT_EMAIL_CONFIG: EmailConfig = {
  // Not defaulted to an address: an owner inbox guessed in code is how this
  // went unnoticed in the first place.
  ownerEmail: null,
  // Brevo, deliberately. It is the provider live in production today, the one
  // whose domain is already authenticated (SPF/DKIM/DMARC), and the one with
  // the LARGER daily bucket — so it takes the highest-volume categories.
  defaultProvider: "brevo",

  providers: {
    resend: { enabled: true, dailyLimit: 100, monthlyLimit: 3000 },
    brevo: { enabled: true, dailyLimit: 300, monthlyLimit: null },
  },

  thresholds: { watch: 70, warning: 80, critical: 90 },

  reserves: {
    ticketing: {
      // Resend's bucket is small (100/day) but ENTIRELY the application's —
      // unlike Brevo's, which is shared with Supabase Auth. That isolation is
      // what makes it the right lane to protect: marketplace volume on Brevo
      // cannot starve a ticket QR here, and vice versa.
      provider: "resend",
      // 40/day ≈ 40% of Resend's daily ceiling. Chosen because a reserve has
      // to be expressed in the unit that BINDS, and for Resend free that is the
      // day, not the month.
      daily: 40,
      // 300/month, the figure the owner asked to start from. Coherent against
      // Resend's 3,000/month ceiling (10%).
      monthly: 300,
      // Nothing is locked while no event is running — 0 events exist today.
      onlyWhenActive: true,
    },
    emergencyDaily: 0,
  },

  // Only the OVERRIDES live here; everything unlisted follows defaultProvider
  // (brevo). Ticketing goes to Resend so the burstiest, most critical stream
  // sits in its own isolated bucket. Nothing emits these types yet, so this is
  // configuration waiting for its feature — which is the point.
  routing: {
    ticket_order_confirmation: "resend",
    ticket_payment_confirmation: "resend",
    ticket_qr_delivery: "resend",
    ticket_cancellation: "resend",
    ticket_refund: "resend",
    ticket_event_reminder: "resend",
    ticket_checkin_notification: "resend",
    organizer_ticket_order_notification: "resend",
  },

  fallback: { enabled: true, exceptTypes: [] },

  retry: { maxAttempts: 3, baseDelayMs: 400 },
};

// ── Load / cache ────────────────────────────────────────────────────────────
const CONFIG_KEY = "email_config";
const TTL = 60_000;

let cache: { cfg: EmailConfig; at: number } | null = null;

/** Drop the cached config. Called after an admin save so the next send sees the
 *  new settings immediately rather than up to a minute later. */
export function invalidateEmailConfigCache(): void {
  cache = null;
}

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;

const nullableNum = (v: unknown, fallback: number | null): number | null => {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  return fallback;
};

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);

const providerName = (v: unknown, fallback: ProviderName): ProviderName =>
  v === "resend" || v === "brevo" ? v : fallback;

/**
 * Merges a stored partial over the defaults, field by field.
 *
 * Deliberately explicit rather than a generic deep merge: a malformed or
 * partially-written settings blob must degrade to a WORKING configuration, not
 * to `dailyLimit: undefined`, which would compare as NaN and silently disable
 * every quota check. Every field is validated on the way in.
 */
export function mergeEmailConfig(stored: unknown): EmailConfig {
  const d = DEFAULT_EMAIL_CONFIG;
  if (!stored || typeof stored !== "object") return d;
  const s = stored as Record<string, unknown>;

  const sp = (s.providers ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const st = (s.thresholds ?? {}) as Record<string, unknown>;
  const sr = (s.reserves ?? {}) as Record<string, unknown>;
  const srt = (sr.ticketing ?? {}) as Record<string, unknown>;
  const sf = (s.fallback ?? {}) as Record<string, unknown>;
  const sy = (s.retry ?? {}) as Record<string, unknown>;

  const mergeProvider = (key: ProviderName): ProviderLimits => {
    const p = sp[key] ?? {};
    return {
      enabled: bool(p.enabled, d.providers[key].enabled),
      dailyLimit: nullableNum(p.dailyLimit, d.providers[key].dailyLimit),
      monthlyLimit: nullableNum(p.monthlyLimit, d.providers[key].monthlyLimit),
    };
  };

  // Only keep routing entries whose value is a real provider name. A typo in a
  // hand-edited blob falls back to the default provider rather than routing to
  // a provider that does not exist.
  const routing: Partial<Record<EmailType, ProviderName>> = { ...d.routing };
  if (s.routing && typeof s.routing === "object") {
    for (const [type, prov] of Object.entries(s.routing as Record<string, unknown>)) {
      if (prov === "resend" || prov === "brevo") routing[type as EmailType] = prov;
      else if (prov === null) delete routing[type as EmailType];
    }
  }

  const ownerEmail =
    typeof s.ownerEmail === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.ownerEmail.trim())
      ? s.ownerEmail.trim()
      : d.ownerEmail;

  return {
    ownerEmail,
    defaultProvider: providerName(s.defaultProvider, d.defaultProvider),
    providers: { resend: mergeProvider("resend"), brevo: mergeProvider("brevo") },
    thresholds: {
      watch: num(st.watch, d.thresholds.watch),
      warning: num(st.warning, d.thresholds.warning),
      critical: num(st.critical, d.thresholds.critical),
    },
    reserves: {
      ticketing: {
        provider: providerName(srt.provider, d.reserves.ticketing.provider),
        daily: num(srt.daily, d.reserves.ticketing.daily),
        monthly: num(srt.monthly, d.reserves.ticketing.monthly),
        onlyWhenActive: bool(srt.onlyWhenActive, d.reserves.ticketing.onlyWhenActive),
      },
      emergencyDaily: num(sr.emergencyDaily, d.reserves.emergencyDaily),
    },
    routing,
    fallback: {
      enabled: bool(sf.enabled, d.fallback.enabled),
      exceptTypes: Array.isArray(sf.exceptTypes) ? (sf.exceptTypes.filter((t) => typeof t === "string") as EmailType[]) : d.fallback.exceptTypes,
    },
    retry: {
      // At least one attempt, however the blob is written — a maxAttempts of 0
      // would silently stop all mail.
      maxAttempts: Math.max(1, num(sy.maxAttempts, d.retry.maxAttempts)),
      baseDelayMs: num(sy.baseDelayMs, d.retry.baseDelayMs),
    },
  };
}

/** Current settings. Never throws — a failed lookup returns the defaults, so a
 *  database blip degrades to working configuration rather than to no email. */
export async function getEmailConfig(): Promise<EmailConfig> {
  if (cache && Date.now() - cache.at < TTL) return cache.cfg;
  let stored: unknown = null;
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    const raw = (data as { value?: string } | null)?.value;
    if (raw) stored = JSON.parse(raw);
  } catch {
    /* defaults */
  }
  const cfg = mergeEmailConfig(stored);
  cache = { cfg, at: Date.now() };
  return cfg;
}

/** Persist a partial settings patch. Returns the merged result actually saved. */
export async function saveEmailConfig(patch: unknown): Promise<EmailConfig> {
  const current = await getEmailConfig();
  // Merge the patch over what is already stored, then re-validate the whole
  // thing, so a patch can never write a field the loader would reject.
  const merged = mergeEmailConfig({ ...current, ...(patch && typeof patch === "object" ? patch : {}) });
  const { getPrivileged } = await import("@/lib/supabase/admin");
  const supabase = await getPrivileged();
  await supabase.from("app_secrets").upsert([{ key: CONFIG_KEY, value: JSON.stringify(merged) }]);
  invalidateEmailConfigCache();
  return merged;
}

/** The provider a type is configured to prefer. */
export function routeFor(cfg: EmailConfig, type: EmailType | string): ProviderName {
  return cfg.routing[type as EmailType] ?? cfg.defaultProvider;
}
