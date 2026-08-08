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
