// ── THE ONE LINE ON A PRODUCT PAGE THAT SAYS HOW YOU PAY ────────────────────
//
// It said "Pay {shop} direct by bank transfer. No card details." for every shop
// on the marketplace — including shops that had published no bank account and
// accepted no cash at all. A customer read a promise, added to bag, and met a
// checkout that said the shop "cannot take orders". The page had told them the
// opposite one screen earlier.
//
// So the sentence is now chosen from what the shop can ACTUALLY take, read from
// store_payment_options() — the same answer checkout uses, marketplace-wide
// prepayment rule included — so the product page and checkout cannot disagree.
//
// Pure and dependency-free so every case is tested without a database.

/** What store_payment_options() says. Null when it could not be read. */
export type StorePayment = { cash: boolean; bank: boolean } | null;

export type PayLineKey =
  | "product.payBankOrCash"
  | "product.payDirect"
  | "product.payCash"
  | "product.payNone"
  | "product.payAtCheckout";

/**
 * Which sentence to show.
 *
 * Unknown is NOT "bank transfer". When the options cannot be read the line
 * names no method at all and defers to checkout — a guess here is exactly the
 * false promise this replaces.
 */
export function payLineKey(p: StorePayment): PayLineKey {
  if (!p) return "product.payAtCheckout";
  if (p.bank && p.cash) return "product.payBankOrCash";
  if (p.bank) return "product.payDirect";
  if (p.cash) return "product.payCash";
  return "product.payNone";
}

/**
 * The shop can take no payment at all — the dead end. Only when the answer is
 * KNOWN: an unreadable answer is not evidence that a shop cannot be paid.
 */
export function cannotBePaid(p: StorePayment): boolean {
  return p !== null && !p.cash && !p.bank;
}
