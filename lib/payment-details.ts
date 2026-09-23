// ── WHERE THE MONEY GOES ────────────────────────────────────────────────────
//
// ONE account, written ONCE. It used to be a literal in two different files —
// lib/email.ts and components/BankTransferDetails.tsx — which is the shape of
// a bug rather than a duplication: change the number in one and a customer
// reading the other sends their deposit to an account the business no longer
// watches. There is no error, no log, and nobody finds out until somebody asks
// where their money went.
//
// It is NOT in the CMS. Listings, prices and hours are the owner's to edit
// from /admin; a payment destination is not, because a wrong value here is
// unrecoverable in a way a wrong opening time never is. Changing it is a code
// change, reviewed, with this comment attached.
//
// ── WHY THE ACCOUNT NUMBER AND NOT A PHONE NUMBER ───────────────────────────
//
// MCB Juice will send to either. The owner's instruction, 23 September 2026:
// the account number is what he wants printed — "i prefer it than phone num".
// He is right, and not only as a preference. A Juice transfer keyed on a
// mobile number resolves against whoever holds that number today; an account
// number resolves against the account. One of those can be reassigned by a
// telecom operator and the other cannot.
//
// So the same digits serve both instructions: Juice to it from a phone, or
// transfer to it from any Mauritian bank. That is why there is one field here
// and not two.

export const PAYMENT = {
  bank: "MCB (Mauritius Commercial Bank)",
  /** The name a payer must match when their banking app asks. */
  accountName: "Roulé Rodrigues",
  /** MCB account number — and the MCB Juice destination, which is the same thing. */
  account: "000456593438",
  /**
   * DO NOT "upgrade" this to a @roulerodrig.com address. It is not a contact
   * address — it is the identity of the actual PayPal ACCOUNT. Payments sent
   * to an address PayPal does not recognise do not arrive. It only changes
   * once the owner has added the new address inside PayPal itself.
   */
  paypal: "roulerodrig@gmail.com",
} as const;

/**
 * The account, said the way a customer needs to hear it.
 *
 * Naming Juice matters: most people on the island pay with it, and somebody
 * who reads only "bank account" opens a branch app they may not have instead
 * of the one on their home screen.
 */
export const PAY_HOW = "MCB Juice or bank transfer";

/**
 * One line for a document's "How to pay" band, which fits a single row.
 *
 * Kept short on purpose — the renderer shrinks anything too wide to fit, and a
 * shrunken account number is a mistyped account number.
 */
export function payToLine(): string {
  return `${PAY_HOW} · ${PAYMENT.account}`;
}

/** The fuller form, for anywhere with room for a second line. */
export function payToLines(): string[] {
  return [
    `${PAYMENT.bank} · ${PAY_HOW}`,
    `${PAYMENT.account} · ${PAYMENT.accountName}`,
  ];
}
