// ── HOW MONEY ACTUALLY ARRIVES ON THIS ISLAND ───────────────────────────────
//
// These are the values of the existing payment_provider enum, reused rather
// than redeclared so the invoice ledger and the marketplace ledger cannot drift
// apart.
//
// mcb_juice is INCLUDED here and is deliberately different from
// checkoutSchema, which rejects it. Those are two different acts: Juice was
// removed as an ONLINE method a customer can select, but recording that
// somebody paid by Juice is recording something that happened. MCB Juice is
// ubiquitous in Mauritius, and a system that cannot represent money it received
// is worse than one that lists a method it no longer offers online.
export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "mcb_juice",
  "paypal",
  "manual",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** What an admin sees in the dropdown. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mcb_juice: "MCB Juice",
  paypal: "PayPal",
  // Anything settled outside the platform — a card machine, a favour, a
  // correction. The note field carries what it actually was.
  manual: "Other",
};

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}
