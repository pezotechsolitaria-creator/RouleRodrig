// Money enters this app as a decimal string typed by a merchant (e.g. "9.995")
// and must become an exact integer in minor units (cents) for storage —
// `Math.round(parseFloat(input) * 100)` is NOT safe for this: IEEE-754 float
// multiplication silently misrounds boundary values (verified: 9.995 * 100 ===
// 999.4999999999999, rounding DOWN to 999 instead of 1000). toCents() works
// on the decimal string directly so it never enters floating-point space.

// products.min_price / product_variants.price are Postgres `integer` (int4),
// max 2,147,483,647 — a price whose cents exceed that overflows the column.
// Found by testing an absurd price ("99999999999999.99") end-to-end: it
// reached the RPC and failed as a raw Postgres integer-overflow error,
// surfaced to the client as a generic 500 rather than a clean validation
// message. Rejecting it here catches it before any network round trip, for
// every caller (onboarding, product create, product edit) at once.
const MAX_CENTS = 2_147_483_647;

/**
 * Converts a decimal string (e.g. "9.99", "9.995", "1,234.5") into an integer
 * number of minor units (cents), using round-half-up on the third decimal
 * digit onward. Returns null for anything that isn't a valid non-negative
 * amount, so callers can distinguish "invalid" from "zero".
 */
export function toCents(input: string): number | null {
  const raw = input.trim();
  if (raw === "") return null;

  // ── A COMMA IS NOT ALWAYS A THOUSANDS SEPARATOR ──────────────────────────
  //
  // This stripped EVERY comma, so "5,997" correctly became 599700 — and
  // "2999,50" became 29995000, which is Rs 299,950 for somebody who meant
  // Rs 2,999.50.
  //
  // That is not a hypothetical. Mauritius writes decimals with a comma, the
  // owner writes in French, and every caller of this function is a money-entry
  // field an admin or a merchant types into: product prices, dish prices,
  // delivery fees, ticketing fees. A merchant entering 250,50 for a dish would
  // have priced it at Rs 25,050.
  //
  // So a comma is accepted ONLY where it is unambiguously grouping thousands.
  // Anything else is REFUSED rather than guessed at: the form says "enter a
  // valid amount" and the person retypes, which costs three seconds. Guessing
  // costs a hundred times the money, silently, and this platform has shipped
  // that class of error four times.
  const trimmed = raw.includes(",")
    ? /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)
      ? raw.replace(/,/g, "")
      : ""
    : raw;
  if (trimmed === "") return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  // A whole part this long would overflow MAX_CENTS regardless of cents —
  // reject up front rather than let it through to the arithmetic below,
  // where parseInt on a huge digit string can itself misbehave.
  if (whole.length > 10) return null;

  // Round the fractional part to 2 digits using ordinary decimal rounding
  // (half-up on the 3rd digit), entirely in string/integer space.
  let cents = fracRaw.length >= 2 ? fracRaw.slice(0, 2) : fracRaw.padEnd(2, "0");
  if (fracRaw.length > 2 && fracRaw.charCodeAt(2) >= "5".charCodeAt(0)) {
    const bumped = parseInt(cents, 10) + 1;
    if (bumped === 100) {
      const result = (parseInt(whole, 10) + 1) * 100;
      return result > MAX_CENTS ? null : result;
    }
    cents = String(bumped).padStart(2, "0");
  }

  const result = parseInt(whole, 10) * 100 + parseInt(cents, 10);
  return result > MAX_CENTS ? null : result;
}

/** Formats an integer cent amount back into a "1234.56"-style decimal string. */
export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * The same amount with the ".00" dropped when there are no cents.
 *
 * For dense commerce surfaces — a product card, a category rail, the one-line
 * delivery note — where "Rs 450.00" spends four characters saying nothing.
 * Rodrigues prices are whole rupees almost without exception, so this is the
 * common case, and on a 375px card the difference decides whether the price and
 * the struck-through original fit on one line.
 *
 * NOT for a total, a receipt, an invoice or anything anyone has to reconcile:
 * money being paid is written in full, always.
 */
export function centsToShortString(cents: number): string {
  return cents % 100 === 0 ? String(Math.trunc(cents / 100)) : centsToDecimalString(cents);
}

/**
 * Whole rupees -> cents.
 *
 * This platform stores money in two units and has shipped that as a live bug
 * three times: `bookings.deposit_amount` and `place_bookings.deposit_amount`
 * are whole RUPEES, while `orders.total` is CENTS. The admin money desk packed
 * all three into one field named `amount` and printed `Rs {amount}` with no
 * division, so a Rs 1,710.00 shop order rendered as "Rs 171,000" while the
 * scooter deposit beside it was correct — nothing looked broken, so nobody
 * reported it.
 *
 * The rule this encodes: convert at the EDGE, once, the moment a rupee-valued
 * column is read, and give the converted field a name that says "Cents". Never
 * let a variable called `amount` hold either unit.
 */
export function rupeesToCents(rupees: unknown): number | null {
  return typeof rupees === "number" && Number.isFinite(rupees)
    ? Math.round(rupees * 100)
    : null;
}

/**
 * Cents -> what a customer reads. "1,800" · "1,800.50" · "-250".
 *
 * Grouped, and the ".00" dropped because Rodrigues prices are whole rupees
 * almost without exception and the owner asked for no decimal point on one.
 * Unlike centsToShortString this KEEPS the thousands separator, which is the
 * difference between 180000 reading as Rs 1,800 and reading as Rs 180000.
 *
 * Use this anywhere an Activity amount is shown. Two screens had hand-rolled
 * their own version of this line and both got the unit wrong — see
 * lib/activity.ts.
 */
export function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const rupees = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = abs % 100;
  return rest === 0 ? `${sign}${rupees}` : `${sign}${rupees}.${String(rest).padStart(2, "0")}`;
}
