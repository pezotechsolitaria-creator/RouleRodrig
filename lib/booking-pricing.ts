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
//   * delivery: scooters Rs 200 each way (Rs 400), cars delivered free
//   * deposit to confirm: cars 50%, scooters 25% — balance settled at pickup

export type PriceableVehicle = { price: string; category?: string };

export const DELIVERY_EACH_WAY = 200;

export function extractDailyPrice(priceStr: string): number {
  const match = priceStr.match(/[\d,]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/,/g, ""), 10);
}

export function deliveryFee(vehicle: PriceableVehicle | undefined): number {
  if (!vehicle) return 0;
  return (vehicle.category ?? "scooter") === "car" ? 0 : DELIVERY_EACH_WAY * 2;
}

export function depositPct(vehicle: PriceableVehicle | undefined): number {
  return (vehicle?.category ?? "scooter") === "car" ? 50 : 25;
}

export type PriceBreakdown = {
  rental: number;
  delivery: number;
  total: number;
  deposit: number;
  balance: number;
  pct: number;
};

export function priceBreakdown(vehicle: PriceableVehicle | undefined, days: number): PriceBreakdown | null {
  if (!vehicle || days <= 0) return null;
  const daily = extractDailyPrice(vehicle.price);
  if (!daily) return null;
  let rate = daily;
  if (days >= 7) rate = Math.round(daily * 0.85);
  else if (days >= 3) rate = Math.round(daily * 0.9);
  const rental = rate * days;
  const delivery = deliveryFee(vehicle);
  const total = rental + delivery;
  const pct = depositPct(vehicle);
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

/** Whole days between two ISO dates; a same-day or single-tap booking is 1. */
export function rentalDays(start: string, end: string): number {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return 0;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.max(1, Math.round((b - a) / 86_400_000));
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
