import { priceNumber } from "./site-data";

// ── THE PRICE FIELD IS NOT JUST A PRICE ─────────────────────────────────────
//
// The owner types the whole thing into one box, and what comes out of
// site_content looks like this:
//
//     "Rs 1999(Free delivery)"
//     "From Rs 699(free delivery)"
//     " Rs 1999(Free delivery)"          (leading space, real row)
//
// So it carries three separate facts — a number, whether it is a "from" price,
// and the single best trust signal this business has — mashed into one string
// with no space before the bracket.
//
// Printed raw into the sticky action bar at 393px it rendered as
// "Rs 1999(Fr…", which loses the delivery promise entirely and looks broken.
// Splitting it lets the number be big, and lets free delivery be said properly
// instead of being the thing that gets truncated.
//
// This does NOT rewrite the owner's content. The raw string stays exactly as
// typed and is still what the cards show; this is only for the places that
// need the parts separately.

export type PriceParts = {
  /** The numeric daily rate, or null when the field carries no usable number. */
  amount: number | null;
  /** "From Rs 699…" — a starting price rather than a fixed one. */
  isFrom: boolean;
  /** The owner wrote free delivery into the price. */
  freeDelivery: boolean;
  /** "Rs 1,999" — grouped, with the "From" prefix when there was one. */
  display: string;
};

export function priceParts(raw: string): PriceParts {
  const text = (raw ?? "").trim();
  const amount = priceNumber(text);
  // Word boundary on purpose: a vehicle called "Freelander" must not be read
  // as offering free delivery.
  const freeDelivery = /\bfree\s*delivery\b/i.test(text);
  const isFrom = /^\s*from\b/i.test(text);

  const money = amount != null ? `Rs ${amount.toLocaleString("en-GB")}` : null;
  const display = money
    ? isFrom
      ? `From ${money}`
      : money
    : // Nothing parseable — show what the owner wrote rather than inventing a
      // number or an empty space.
      text;

  return { amount, isFrom, freeDelivery, display };
}
