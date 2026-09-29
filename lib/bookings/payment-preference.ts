import { z } from "zod";

// ── HOW THE CUSTOMER WOULD LIKE TO PAY (M220) ───────────────────────────────
//
// The owner, 29 Sept 2026: "people tend to pay on cash by hand". The request
// forms only ever described one way to pay — a deposit online — so a customer
// who meant to hand over cash either booked through WhatsApp instead or sent
// a request that promised a payment they never intended to make.
//
// This records what they SAID. It decides nothing: the owner still chooses
// between "Confirm — pays in person" and the ordinary approve-then-pay route
// (admin_confirm_in_person, M220). That is why the column is called a
// preference and why nothing on the customer's side reads it as a promise.
//
// Optional and null by default. Every request sent before this existed, and
// any client that never learns the field, stays exactly as it was. What is
// refused is a value the table's CHECK would refuse anyway — failing here
// returns a sentence to the form instead of a 500 from the insert.

export const PAYMENT_PREFERENCES = ["online", "in_person"] as const;
export type PaymentPreference = (typeof PAYMENT_PREFERENCES)[number];

export const paymentPreferenceSchema = z
  .enum(PAYMENT_PREFERENCES)
  .nullish()
  .transform((v): PaymentPreference | null => v ?? null);

/** The sentence a refused value gets. English, like every other refusal these routes send. */
export const PAYMENT_PREFERENCE_ERROR = "Please choose how you would like to pay.";

export function parsePaymentPreference(
  raw: unknown,
): { ok: true; value: PaymentPreference | null } | { ok: false; error: string } {
  const r = paymentPreferenceSchema.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: PAYMENT_PREFERENCE_ERROR };
}
