import type { PaymentStatus } from "./status";

// ── Who pays what, how, and by when ──────────────────────────────────────────
//
// A PaymentPolicy belongs to a product (or its product type). It is COPIED
// onto every reservation at request time (payment_policy_snapshot), so editing
// a policy later never rewrites what a guest was told.
//
// Money is WHOLE RUPEES in columns ending `_mur` — never cents. This codebase
// has both units in neighbouring tables (bookings in rupees, orders in cents)
// and has shipped that mix-up as a live money bug twice; the suffix is the
// guard. Pure module.

export const PRODUCT_TYPES = ["scooter", "car", "stay", "experience", "activity", "boat", "other"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PAYMENT_METHOD_IDS = ["mcb_juice", "paypal", "bank_transfer", "cash_in_person", "card"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export type PaymentMode = "full" | "deposit_percent" | "deposit_fixed" | "pay_at_pickup" | "none";

export type PaymentPolicy = {
  mode: PaymentMode;
  deposit_percent?: number | null;
  deposit_fixed_mur?: number | null;
  allowed_methods: PaymentMethodId[];
  /** How long a confirmed, unpaid hold lasts. */
  deadline_hours: number;
  /** Requests never hold by default: an abandoned one must not freeze a boat. */
  hold_capacity_on: "confirm" | "request";
};

// Card first: a visitor's natural way to pay, processed by PayPal (M242).
const ONLINE: PaymentMethodId[] = ["card", "mcb_juice", "bank_transfer", "paypal"];

/** Defaults per product type, until the owner edits one in settings. */
export const DEFAULT_POLICIES: Record<ProductType, PaymentPolicy> = {
  experience: { mode: "full", allowed_methods: [...ONLINE, "cash_in_person"], deadline_hours: 12, hold_capacity_on: "confirm" },
  activity: { mode: "full", allowed_methods: [...ONLINE, "cash_in_person"], deadline_hours: 12, hold_capacity_on: "confirm" },
  boat: { mode: "full", allowed_methods: [...ONLINE, "cash_in_person"], deadline_hours: 12, hold_capacity_on: "confirm" },
  stay: { mode: "deposit_percent", deposit_percent: 30, allowed_methods: ONLINE, deadline_hours: 48, hold_capacity_on: "confirm" },
  scooter: { mode: "deposit_percent", deposit_percent: 30, allowed_methods: [...ONLINE, "cash_in_person"], deadline_hours: 24, hold_capacity_on: "confirm" },
  car: { mode: "deposit_percent", deposit_percent: 30, allowed_methods: [...ONLINE, "cash_in_person"], deadline_hours: 24, hold_capacity_on: "confirm" },
  other: { mode: "full", allowed_methods: ONLINE, deadline_hours: 24, hold_capacity_on: "confirm" },
};

/** A policy as stored may be partial or stale — fill it from the default. */
export function resolvePolicy(type: ProductType, stored?: Partial<PaymentPolicy> | null): PaymentPolicy {
  const base = DEFAULT_POLICIES[type] ?? DEFAULT_POLICIES.other;
  const p = { ...base, ...(stored ?? {}) } as PaymentPolicy;
  return {
    ...p,
    allowed_methods: (p.allowed_methods ?? base.allowed_methods).filter((m) => (PAYMENT_METHOD_IDS as readonly string[]).includes(m)),
    deadline_hours: Math.min(Math.max(Math.round(p.deadline_hours || base.deadline_hours), 1), 24 * 14),
  };
}

// ── The party and its price ──────────────────────────────────────────────────

export type Party = { adults: number; children: number; babies: number };

/** Prices read from the LISTING (never typed here). */
export type ListingPricing = {
  /** Per person (experiences) or per unit (per day, per night, per booking). */
  unit_mur: number | null;
  perPerson: boolean;
  /** Children's price per person, if the listing states one; else adult price. */
  child_mur?: number | null;
  /** Babies are free unless the listing gives them a price. */
  baby_mur?: number | null;
};

export function partySize(p: Party): number {
  return Math.max(0, p.adults) + Math.max(0, p.children) + Math.max(0, p.babies);
}

/**
 * The total for a request, in whole rupees, or null when the listing has no
 * price (the request still goes in; Roulé quotes on confirm).
 *   per person: adults × unit + children × child (or unit) + babies × baby (or 0)
 *   per unit:   unit × units (days, nights, or 1)
 */
export function computeTotal(pricing: ListingPricing, party: Party, units = 1): number | null {
  if (pricing.unit_mur == null || pricing.unit_mur < 0) return null;
  const u = Math.max(1, Math.round(units));
  if (!pricing.perPerson) return pricing.unit_mur * u;
  const child = pricing.child_mur ?? pricing.unit_mur;
  const baby = pricing.baby_mur ?? 0;
  return (Math.max(0, party.adults) * pricing.unit_mur + Math.max(0, party.children) * child + Math.max(0, party.babies) * baby) * u;
}

/** What is due online before the day, and what is left for the day. */
export function computeDue(policy: PaymentPolicy, total: number | null): { deposit_due_mur: number | null; balance_due_mur: number | null } {
  if (total == null) return { deposit_due_mur: null, balance_due_mur: null };
  switch (policy.mode) {
    case "none":
      return { deposit_due_mur: 0, balance_due_mur: 0 };
    case "pay_at_pickup":
      return { deposit_due_mur: 0, balance_due_mur: total };
    case "deposit_percent": {
      const d = Math.round((total * Math.min(Math.max(policy.deposit_percent ?? 0, 0), 100)) / 100);
      return { deposit_due_mur: d, balance_due_mur: total - d };
    }
    case "deposit_fixed": {
      const d = Math.min(Math.max(policy.deposit_fixed_mur ?? 0, 0), total);
      return { deposit_due_mur: d, balance_due_mur: total - d };
    }
    default:
      return { deposit_due_mur: total, balance_due_mur: 0 };
  }
}

/** Payment status at the moment of CONFIRM. Confirm never means paid. */
export function paymentStatusOnConfirm(policy: PaymentPolicy, depositDue: number | null): PaymentStatus {
  if (policy.mode === "none") return "not_required";
  if (policy.mode === "pay_at_pickup") return "pay_in_person";
  if (depositDue === 0) return "pay_in_person";
  return "payment_pending";
}

/** "Rs 1,999" — the site's one money format. */
export function formatMur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `Rs ${Math.round(n).toLocaleString("en-US")}`;
}
