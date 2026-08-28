// Platform fee arithmetic — the DISPLAY side of a decision the database owns.
//
// The authority is resolve_commission_rate() + create_order() in Postgres (M23,
// M24). Nothing here decides anything: these functions exist so a merchant
// dashboard, an admin panel or a checkout summary can SHOW the same figure the
// server will store, without a round trip and without ever disagreeing with it.
//
// ── WHY THIS IS INTEGER ARITHMETIC AND NOT `amount * rate` ──────────────────
// Postgres computes `round(commissionable::numeric * rate)` in exact decimal.
// JavaScript would compute it in IEEE-754, where 6000 * 0.0333 is
// 199.79999999999998 — this particular case still rounds to 200, but the class
// of bug is real and lib/money.ts already documents the same trap
// (9.995 * 100 === 999.4999999999999). A displayed fee that is one rupee away
// from the charged fee is the kind of defect a merchant notices and never
// trusts you about again.
//
// commission_rate is numeric(6,5), so a rate is exactly representable as an
// integer number of 1e-5 units. Everything below stays in integer space:
//
//     commission = floor((base * rateE5 + 50_000) / 100_000)
//
// which is round-half-up, matching Postgres `round(numeric)` for the
// non-negative values this domain allows. Largest intermediate is
// 2^31 * 50_000 ≈ 1.07e14, comfortably inside Number.MAX_SAFE_INTEGER (9.0e15).

import type { Language } from "@/lib/i18n";

/** Scale of `numeric(6,5)`: one rate unit is 1e-5. */
const RATE_SCALE = 100_000;

/** Ceiling shared with the DB CHECK constraints — 50%, a guard rail not a policy. */
export const MAX_COMMISSION_RATE = 0.5;

export type MonetizationModel = "free" | "commission" | "subscription" | "hybrid";

export const MONETIZATION_MODELS: MonetizationModel[] = [
  "free",
  "commission",
  "subscription",
  "hybrid",
];

/** Does this model charge a per-sale fee at all? Mirrors the resolver's outer gate. */
export function modelChargesCommission(model: MonetizationModel): boolean {
  return model === "commission" || model === "hybrid";
}

/** Does this model bill a recurring subscription? */
export function modelChargesSubscription(model: MonetizationModel): boolean {
  return model === "subscription" || model === "hybrid";
}

/**
 * Converts a rate (0.10) into its exact integer 1e-5 representation (10000).
 * Rounds, because a rate arriving from JSON may carry float noise
 * (0.07 + 0.001 === 0.07100000000000001).
 */
export function rateToUnits(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(Math.min(rate, MAX_COMMISSION_RATE) * RATE_SCALE);
}

/**
 * The commission on a commissionable amount, in minor units.
 *
 * `commissionable` is MERCHANDISE ONLY (subtotal − discount): tax is the
 * state's and the delivery fee is already platform income on rr_delivery, so
 * charging commission on either would double-count. See order_financials.
 *
 * Clamped to the base, so a misconfigured rate can never produce a negative
 * merchant net — the same invariant order_financials_reconciles enforces.
 */
export function commissionOn(commissionable: number, rate: number): number {
  if (!Number.isFinite(commissionable) || commissionable <= 0) return 0;
  const base = Math.floor(commissionable);
  const units = rateToUnits(rate);
  if (units === 0) return 0;
  const commission = Math.floor((base * units + RATE_SCALE / 2) / RATE_SCALE);
  return Math.min(commission, base);
}

export interface FeeBreakdown {
  /** Merchandise the commission applies to (subtotal − discount). */
  commissionable: number;
  rate: number;
  commission: number;
  /** What the merchant keeps from the merchandise. */
  merchantNet: number;
}

/** The full split for one order, in the same shape order_financials stores. */
export function feeBreakdown(commissionable: number, rate: number): FeeBreakdown {
  const base = Math.max(0, Math.floor(commissionable || 0));
  const commission = commissionOn(base, rate);
  return { commissionable: base, rate, commission, merchantNet: base - commission };
}

/**
 * "10%", "7.5%", "0%" — never "10.00000%".
 *
 * A merchant reads this, not an accountant. Trailing zeros on a five-decimal
 * column make a simple rate look like a calculation they need to check.
 */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return "0%";
  const pct = rate * 100;
  const rounded = Math.round(pct * 1000) / 1000;
  return `${rounded}%`;
}

/**
 * The one-line promise made to a prospective seller on the PUBLIC recruitment
 * surface (/shop). Derived, never hardcoded.
 *
 * This exists because /shop told merchants "no commission on your sales, just a
 * simple subscription" in two hardcoded places. That happens to be true today —
 * the model is `subscription` at 0% — but the whole point of M23 was that the
 * owner can switch models without a rewrite, and the first switch would have
 * turned a recruitment page into a false promise about money. A claim about
 * what somebody will be charged has to come from the thing that charges them.
 */
type PitchWords = {
  free: string;
  commission: (pct: string) => string;
  hybrid: (pct: string) => string;
  subscriptionWithRate: (pct: string) => string;
  subscriptionFree: string;
};

// ── THE PROMISE, IN THE READER'S LANGUAGE ───────────────────────────────
//
// /shop was translated into French and Kreol while this sentence was not, so
// the recruitment paragraph ended in an English clause mid-sentence: "...avant
// de remettre quoi que ce soit — no commission on your sales". Caught by
// reading the live French page rather than by any test.
//
// The percentage is still interpolated from the SAME rate in every language,
// so a translation cannot quietly promise a different number than the one the
// database will charge — which is the whole reason this function exists.
const PITCH: Record<Language, PitchWords> = {
  en: {
    free: "no monthly fee and no commission while we get the first shops on board",
    commission: (pct) =>
      `no monthly fee — Roulé Rodrigues keeps ${pct} of each completed sale`,
    hybrid: (pct) => `a simple monthly subscription, plus ${pct} of each completed sale`,
    subscriptionWithRate: (pct) => `a simple monthly subscription, plus ${pct} of each sale`,
    subscriptionFree: "no commission on your sales, just a simple subscription",
  },
  fr: {
    free: "aucun abonnement et aucune commission pendant que nous mettons les premières boutiques en ligne",
    commission: (pct) =>
      `aucun abonnement — Roulé Rodrigues garde ${pct} de chaque vente conclue`,
    hybrid: (pct) => `un abonnement mensuel simple, plus ${pct} de chaque vente conclue`,
    subscriptionWithRate: (pct) => `un abonnement mensuel simple, plus ${pct} de chaque vente`,
    subscriptionFree: "aucune commission sur vos ventes, juste un abonnement simple",
  },
  cr: {
    free: "okenn abonman ek okenn komision pandan ki nou pe met bann premie laboutik an liny",
    commission: (pct) =>
      `okenn abonman — Roulé Rodrigues gard ${pct} lor sak vant ki finn fini`,
    hybrid: (pct) => `enn abonman mansiel senp, plis ${pct} lor sak vant ki finn fini`,
    subscriptionWithRate: (pct) => `enn abonman mansiel senp, plis ${pct} lor sak vant`,
    subscriptionFree: "okenn komision lor ou bann vant, zis enn abonman senp",
  },
};

export function sellerPitch(
  model: MonetizationModel,
  rate: number,
  lang: Language = "en",
): string {
  const pct = formatRate(rate);
  const w = PITCH[lang] ?? PITCH.en;
  switch (model) {
    case "free":
      return w.free;
    case "commission":
      return w.commission(pct);
    case "hybrid":
      return w.hybrid(pct);
    case "subscription":
    default:
      // 0% is the configured default, so "no commission" is only safe to say
      // when the number actually says so.
      return modelChargesCommission(model) || rate > 0
        ? w.subscriptionWithRate(pct)
        : w.subscriptionFree;
  }
}

/**
 * Plain language for each model, for the admin chooser. Deliberately describes
 * WHO PAYS WHAT rather than naming the internal enum — the owner is choosing a
 * business model, not a database value.
 */
export const MODEL_COPY: Record<MonetizationModel, { label: string; help: string }> = {
  commission: {
    label: "Commission only",
    help: "Shops sell for free and Roulé Rodrigues keeps a percentage of each completed sale.",
  },
  subscription: {
    label: "Subscription only",
    help: "Shops pay a monthly fee and keep every rupee they sell.",
  },
  hybrid: {
    label: "Subscription + commission",
    help: "Shops pay a monthly fee and Roulé Rodrigues also keeps a percentage of each sale.",
  },
  free: {
    label: "Free",
    help: "No monthly fee and no commission. Use this while you are getting the first shops on board.",
  },
};
