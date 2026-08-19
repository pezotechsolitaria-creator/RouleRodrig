// Shared vocabulary for the order reservation window (M13).
//
// The DECISION lives in SQL — order_hold_hours() resolves the window and the
// sweep inside create_order() enforces it. This module only describes what the
// server already decided, exactly as lib/schedule.ts does for opening hours. If
// the rule ever changes, it changes in one place and this keeps describing it
// correctly, because it reads the order's own auto_release_at rather than
// re-deriving a duration.
//
// Why this exists at all: before M13 the deadline was disclosed NOWHERE. A
// customer's stock reservation could lapse and their order be cancelled without
// a single line of copy anywhere in the product having mentioned that a clock
// was running.

export type PaymentProvider = "cash" | "bank_transfer" | "manual";

export type HoldInfo = {
  deadline: Date;
  msLeft: number;
  expired: boolean;
  /** Whole hours remaining, floored. 0 once inside the final hour. */
  hoursLeft: number;
  /** True in the last 12 hours — the point at which the merchant should be nudged. */
  urgent: boolean;
};

export function holdInfo(autoReleaseAt: string | null | undefined, now: number = Date.now()): HoldInfo | null {
  if (!autoReleaseAt) return null;
  const deadline = new Date(autoReleaseAt);
  const t = deadline.getTime();
  if (Number.isNaN(t)) return null;
  const msLeft = t - now;
  return {
    deadline,
    msLeft,
    expired: msLeft <= 0,
    hoursLeft: Math.max(0, Math.floor(msLeft / 3_600_000)),
    urgent: msLeft > 0 && msLeft <= 12 * 3_600_000,
  };
}

/** "2 days", "7 hours", "under an hour" — never a bare number the reader must decode. */
export function holdRemaining(h: HoldInfo): string {
  if (h.expired) return "expired";
  const days = Math.floor(h.hoursLeft / 24);
  if (days >= 2) return `${days} days`;
  if (h.hoursLeft >= 1) return `${h.hoursLeft} hour${h.hoursLeft === 1 ? "" : "s"}`;
  return "under an hour";
}

/** Absolute deadline in Rodrigues local time — the customer's own clock. */
export function holdDeadlineLabel(h: HoldInfo): string {
  return h.deadline.toLocaleString("en-GB", {
    timeZone: "Indian/Mauritius",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What the CUSTOMER is told while an order is still holding stock.
 *
 * The two providers need genuinely different copy: a bank-transfer customer owes
 * money now and can act, whereas a cash customer owes nothing until handover and
 * can only wait for the shop. Telling a cash customer to "pay in time" — which
 * is what the old sweep notification said — is both false and alarming.
 */
export function customerHoldCopy(provider: PaymentProvider | undefined, h: HoldInfo): string {
  if (h.expired) {
    return "This reservation has lapsed. If the shop has not confirmed it, the items have been released and you have not been charged.";
  }
  const when = holdDeadlineLabel(h);
  if (provider === "bank_transfer") {
    return `Your items are reserved until ${when}. Send the transfer and upload your proof of payment before then, or the reservation is released. You are not charged automatically.`;
  }
  // cash / manual — nothing is owed until handover.
  return `Your items are reserved until ${when}. You pay the shop directly when you collect or receive your order — nothing is charged now. If the shop has not confirmed by then, the reservation is released and you are free to order elsewhere.`;
}

/** What the MERCHANT is told. They are the only party who can save a cash order. */
export function merchantHoldCopy(provider: PaymentProvider | undefined, h: HoldInfo): string {
  if (h.expired) return "This reservation has lapsed and the stock may be released.";
  const left = holdRemaining(h);
  if (provider === "bank_transfer") {
    return `Stock is held for another ${left} while the customer sends payment.`;
  }
  return `Confirm within ${left} or this reservation is released and the stock returns to your shelf. The customer pays you at handover.`;
}

// ── BEFORE THE ORDER EXISTS ────────────────────────────────────────────────
//
// Everything above reads an order's own auto_release_at, which is the honest
// way to describe a clock that is already running. At CHECKOUT there is no
// order and no auto_release_at yet, so the deadline has to be projected from
// the window instead — and that projection is the last thing the customer sees
// before they commit money, which is precisely where the disclosure was
// missing.
//
// The window is NOT re-derived here. It is resolved by order_hold_hours() in
// SQL, exactly as create_order() will resolve it moments later, and passed in.
// Anything else would let the number on the checkout screen disagree with the
// number the database enforces.

/** Default windows, mirroring order_hold_hours()'s own fallback. */
export const FALLBACK_HOLD_HOURS: Record<string, number> = { cash: 168, bank_transfer: 48, manual: 48 };

/** The deadline a customer would get if they placed the order right now. */
export function projectedDeadline(hours: number, now: number = Date.now()): Date {
  return new Date(now + hours * 3_600_000);
}

/**
 * What the customer is told at CHECKOUT, before the order exists.
 *
 * Deliberately states the window AND the resulting date. The window alone
 * ("48 hours") is what the product said for months and it is the reason a
 * bank-transfer customer could wire money on day three: "48 hours" from an
 * unstated starting point is not a deadline anyone can act on. The date alone
 * would be false precision, because the clock starts when they press the
 * button, not when the page rendered — so it is marked as such.
 */
export function checkoutHoldCopy(
  provider: PaymentProvider | undefined,
  hours: number,
  now: number = Date.now(),
  /** "shop", "kitchen", "organiser" — checkout already carries this vocabulary. */
  seller: string = "shop",
): string {
  const when = holdDeadlineLabel(holdInfo(projectedDeadline(hours, now).toISOString(), now)!);
  const window = holdWindowLabel(hours);
  if (provider === "bank_transfer") {
    return `Placing this order reserves your items for ${window} — until about ${when}. Send the transfer and upload your proof of payment before then, or the reservation is released and the order is cancelled. You are never charged automatically.`;
  }
  return `Placing this order reserves your items for ${window} — until about ${when}. If the ${seller} has not confirmed by then, the reservation is released and nothing is owed.`;
}

/** "2 days", "7 days", "36 hours" — a duration, never a bare number. */
export function holdWindowLabel(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
