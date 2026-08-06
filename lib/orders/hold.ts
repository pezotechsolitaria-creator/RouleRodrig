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
