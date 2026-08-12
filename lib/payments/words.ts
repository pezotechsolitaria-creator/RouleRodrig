// ── Payment status, in words a shopkeeper reads once and understands ─────────
//
// The merchant orders table printed `payments[0].status` straight from Postgres:
// "captured", "authorized", "partially_refunded". Those are accounting terms
// from a payments API, shown to someone who sells honey. "captured" in
// particular is the one that matters most (the money is yours) and reads like
// the opposite of good news.
//
// Pairing status with PROVIDER is what makes it actionable: "pending" on a cash
// order means the customer pays you at the door; "pending" on a bank transfer
// means go and check your account.

export type PaymentWords = { label: string; hint: string; tone: "good" | "waiting" | "bad" };

const STATUS: Record<string, PaymentWords> = {
  captured: { label: "Paid", hint: "The money is yours.", tone: "good" },
  authorized: { label: "Paid — clearing", hint: "Taken from the card, landing shortly.", tone: "good" },
  pending: { label: "Not paid yet", hint: "Nothing has reached you.", tone: "waiting" },
  failed: { label: "Payment failed", hint: "It did not go through.", tone: "bad" },
  refunded: { label: "Refunded", hint: "The customer got their money back.", tone: "bad" },
  partially_refunded: { label: "Partly refunded", hint: "Some of it was returned.", tone: "bad" },
};

const PROVIDER: Record<string, string> = {
  cash: "cash on collection",
  bank_transfer: "bank transfer",
  mcb_juice: "MCB Juice",
  paypal: "card / PayPal",
  manual: "recorded by hand",
};

/** How a payment should read in a list, e.g. "Not paid yet · cash on collection". */
export function paymentWords(
  status: string | null | undefined,
  provider?: string | null,
): PaymentWords {
  const base =
    STATUS[status ?? ""] ??
    // An enum member added later must not leak its raw name onto a merchant's
    // screen; "Unknown" is less useful but never wrong or alarming.
    { label: "Unknown", hint: "", tone: "waiting" as const };

  const how = PROVIDER[provider ?? ""];
  if (!how) return base;

  // The one case where provider changes what the merchant should DO.
  if (base.label === "Not paid yet" && provider === "cash") {
    return { label: "Pay on collection", hint: "Take the cash when they collect.", tone: "waiting" };
  }
  return { ...base, hint: base.hint ? `${base.hint} (${how})` : how };
}

/** Just the short label, for a table cell with no room for a hint. */
export function paymentLabel(status: string | null | undefined, provider?: string | null): string {
  return paymentWords(status, provider).label;
}
