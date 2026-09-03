// ── Vehicle-rental pricing: the ONE place the numbers come from ─────────────
//
// Until 2026-08-08 this arithmetic lived only inside BookingSection (client),
// and /api/bookings computed the DEPOSIT from the client-posted total_amount —
// meaning the figure that decides how much money confirms a booking was
// attacker-controlled. A tampered POST with total_amount: 100 produced a
// Rs 25 deposit on any rental. The server now recomputes everything from the
// owner's own fleet content via this module; the client uses the same module
// so the summary the customer sees and the figures the server stores can never
// disagree by construction.
//
// Pricing rules (owner's):
//   * daily rate parsed from the fleet item's display price ("Rs 1,200/day")
//   * 3+ days: 10% off the daily rate; 7+ days: 15% off
//   * delivery: whatever the owner set on the vehicle's category in /admin
//   * deposit to confirm: whatever the owner set on the category — balance at pickup

export type PriceableVehicle = { price: string; category?: string };

/** The only parts of a vehicle category this module needs to price a rental. */
export type DeliveryPricedCategory = { id: string; deliveryFee?: number; depositPct?: number };

export const DELIVERY_EACH_WAY = 200;

/**
 * Reads the number out of an owner-typed price string.
 *
 * THE ONE PARSER. Until 2026-08-08 there were three — this one (what the
 * customer is CHARGED), priceNumber() in lib/site-data.ts (what is DISPLAYED
 * and published in JSON-LD offers), and the currency converter — and they
 * disagreed on real input:
 *
 *   "Rs 21 475"          → 21    (charged)  vs  21475 (converted)
 *   "From Rs 1 200/day"  → 1     (charged)  vs  1200  (converted)
 *
 * A price grouped with spaces instead of commas — which is exactly how a
 * French-locale keyboard renders 21 475, and this is a trilingual product —
 * made the site advertise and CHARGE Rs 21 for a Rs 21,475 vehicle. The
 * currency converter had already been fixed for this (see lib/currency.ts,
 * which documents the same bug); the fix never reached the two parsers that
 * decide money.
 *
 * Matches a leading run of digits with comma / space / non-breaking-space
 * grouping, then strips everything that is not a digit before parsing. A
 * decimal part is deliberately ignored: every price in this product is whole
 * rupees, and "1.200" is grouping in half of Europe, not a fraction.
 */
export function extractDailyPrice(priceStr: string): number {
  const match = priceStr.match(/\d[\d.,\s  ]*/);
  if (!match) return 0;
  const digits = match[0].replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * What delivery + collection costs for this vehicle.
 *
 * Until 2026-08-13 this was a constant: Rs 200 each way for anything that
 * wasn't a car, and free for cars. Both numbers were invisible to the owner and
 * unchangeable without a deploy — so the day fuel moved, or the day a car
 * needed a delivery charge, the site was wrong and there was nothing he could
 * do about it from /admin. The figure now comes from the vehicle's own category
 * (see VehicleCategory.deliveryFee), which he edits like any other content.
 *
 * `categories` is optional ONLY so that a call site which genuinely has no
 * content to hand still prices something sane rather than crashing. Every real
 * call site passes it, and both of them — the booking API and the customer's
 * summary — must pass the SAME list, or the customer would be quoted one figure
 * and charged another.
 *
 * The fallback is the pre-2026-08-13 rule, exactly, so a category the owner has
 * never opened keeps charging what it charged yesterday. A category with
 * `deliveryFee: 0` is FREE and is not the same thing as a category with no fee
 * set — hence the explicit undefined check rather than `??` on a falsy number.
 */
export function deliveryFee(
  vehicle: PriceableVehicle | undefined,
  categories?: DeliveryPricedCategory[],
): number {
  if (!vehicle) return 0;
  const catId = vehicle.category ?? "scooter";
  const cat = categories?.find((c) => c.id === catId);
  if (cat && typeof cat.deliveryFee === "number" && Number.isFinite(cat.deliveryFee)) {
    // Negative would be a discount the rest of the pricing cannot honour, and a
    // fraction of a rupee cannot be charged — clamp rather than propagate.
    return Math.max(0, Math.round(cat.deliveryFee));
  }
  // ── THE RULE WAS THE WRONG WAY ROUND (M159) ──────────────────────────────
  //
  // This returned 0 for cars and Rs 400 for everything else, so every SCOOTER
  // rental was charged Rs 400 delivery and every CAR got it free. The owner's
  // rule is the opposite, and his own price label has said so all along:
  // "From Rs 699(free delivery)" on the scooters, nothing of the kind on the
  // car. A live booking went out on 2026-09-03 charging a scooter Rs 400.
  //
  // Scooters are free because that is the offer the site advertises. Anything
  // else keeps the Rs 200-each-way default until the owner sets a figure for
  // its category in admin, which is the path this function exists to serve.
  return catId === "scooter" ? 0 : DELIVERY_EACH_WAY * 2;
}

/**
 * What share of the total confirms the booking. The balance is settled at
 * pickup, so this is the only money that changes hands before the customer
 * arrives — and until 2026-08-13 it was two numbers in this file that the owner
 * could feel the effect of but never change.
 *
 * Read from the vehicle's category, same as the delivery fee, with the same
 * two rules: an unset category keeps the old behaviour exactly, and a value the
 * owner did set is honoured even when it is unusual. Clamped to 1–100 because
 * the arithmetic below has no meaning outside that: 0 would reserve a vehicle
 * for nothing, and above 100 would charge more than the rental costs.
 */
export function depositPct(
  vehicle: PriceableVehicle | undefined,
  categories?: DeliveryPricedCategory[],
): number {
  const catId = vehicle?.category ?? "scooter";
  const cat = categories?.find((c) => c.id === catId);
  if (cat && typeof cat.depositPct === "number" && Number.isFinite(cat.depositPct)) {
    return Math.min(100, Math.max(1, Math.round(cat.depositPct)));
  }
  return catId === "car" ? 50 : 25;
}

export type PriceBreakdown = {
  rental: number;
  delivery: number;
  total: number;
  deposit: number;
  balance: number;
  pct: number;
};

export function priceBreakdown(
  vehicle: PriceableVehicle | undefined,
  days: number,
  categories?: DeliveryPricedCategory[],
): PriceBreakdown | null {
  if (!vehicle || days <= 0) return null;
  const daily = extractDailyPrice(vehicle.price);
  if (!daily) return null;
  // ── NO AUTOMATIC DISCOUNT (M159) ─────────────────────────────────────────
  //
  // This applied 15% off at 7 days and 10% at 3, silently. An 8-day Avenis
  // was quoted at Rs 594 a day when the advertised rate is Rs 699 — the owner
  // saw it on a real booking confirmation and called it what it is. The rate a
  // customer is shown on the vehicle card is now the rate they are charged.
  //
  // If a multi-day discount is wanted later it belongs in admin beside the
  // delivery fee and the deposit percentage, as a number the owner sets and
  // can see — not two hardcoded multipliers he could feel and never change.
  const rate = daily;
  const rental = rate * days;
  const delivery = deliveryFee(vehicle, categories);
  const total = rental + delivery;
  const pct = depositPct(vehicle, categories);
  const deposit = Math.round((total * pct) / 100);
  return { rental, delivery, total, deposit, balance: total - deposit, pct };
}

/** Today's date in Rodrigues (UTC+4), as YYYY-MM-DD. A traveler booking from
 * the Americas — or the owner at 1 a.m. — must never see "today" resolve to
 * the wrong side of midnight because their device clock is in another zone. */
export function todayInRodrigues(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mauritius" }).format(now);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How many DAYS the customer has the vehicle — counted inclusively, both ends.
 *
 * ── THE OFF-BY-ONE THIS FIXES ─────────────────────────────────────────────
 *
 * This used to subtract the dates and stop: 01 Aug → 08 Aug came out as 7.
 * That is the number of NIGHTS, and a scooter is not a hotel room. Someone who
 * collects on the 1st and returns on the 8th has the bike on the 1st, 2nd,
 * 3rd, 4th, 5th, 6th, 7th AND 8th — eight days. The owner reported it from a
 * real booking alert reading "01/AUG/2026 -> 08/AUG/2026 (7 days)": the first
 * day was being given away, on every single rental.
 *
 * So: subtract, then add the day you started on. A same-day rental is 1, which
 * it always was — that case happened to be right for the wrong reason, because
 * Math.max(1, 0) papered over the missing day.
 *
 * Reversed or malformed dates still return 0, which is what
 * validateRentalWindow() reads as "the return is before the pickup".
 */
export function rentalDays(start: string, end: string): number {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return 0;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Server-side sanity for a requested rental window. Returns null when valid,
 * else a customer-readable refusal. Bounds are generous by design — this
 * blocks the impossible (the past, a year-long hold, a malformed string),
 * never a plausible holiday.
 */
export function validateRentalWindow(start: string, end: string, now: Date = new Date()): string | null {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return "Those dates don't look right — please pick them again.";
  const days = rentalDays(start, end);
  if (days === 0) return "The return date must be on or after the pickup date.";
  const today = todayInRodrigues(now);
  if (start < today) return "The pickup date has already passed — please pick a new date.";
  const horizon = new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 10);
  if (start > horizon) return "Bookings open up to a year ahead — please pick a closer date.";
  if (days > 60) return "For rentals longer than 60 days, contact us on WhatsApp for a custom rate.";
  return null;
}
