// ── What a stay actually costs ──────────────────────────────────────────────
//
// Accommodation had NO price model at all. Hotels live in
// `content.recommended.items` alongside restaurants and activities, and that
// array carries exactly one money field — `depositAmount`, documented as "flat
// per reservation, NOT per person", with this reasoning:
//
//     a boat charter is priced by the boat, and there is no per-head field
//     to multiply by
//
// which is correct for a boat charter and wrong for a room. The consequence on
// the live site is that one night and seven nights cost the SAME, and two rooms
// cost the same as one. `priceNote` ("from Rs 2500/night") is free text shown
// in the form — decorative, never computed with, so the number the guest reads
// and the number they are charged have no relationship.
//
// This is the nightly engine. Deliberately a PURE function in its own file,
// exactly like lib/booking-pricing.ts for vehicles: the server prices the
// booking from the listing and the client renders the same breakdown from the
// same code, so the total on the button is the total that gets charged. A
// second implementation in the modal is how those two drift apart.

/** The money fields a stay listing can carry. */
export type StayRates = {
  /** Rs per room per night. The new field; absent on every listing until set. */
  nightlyRate?: number;
  /**
   * The legacy flat amount. Kept as the fallback so a listing the owner has not
   * re-priced behaves EXACTLY as it does today rather than silently becoming
   * free — a pricing change that quietly zeroes live listings is worse than the
   * bug it fixes.
   */
  depositAmount?: number;
};

export type StayQuote = {
  /** Nights charged. Check-out morning is not a night. */
  nights: number;
  rooms: number;
  /** Rs per room per night, as charged. */
  rate: number;
  /** rate × nights × rooms. */
  total: number;
  /** True when this came from the legacy flat field rather than a nightly rate. */
  flat: boolean;
};

/**
 * Nights between check-in and check-out.
 *
 * A guest arriving on the 10th and leaving on the 14th sleeps FOUR nights, not
 * five. This is the one arithmetic every traveller checks by hand, and getting
 * it wrong by a night is the difference between a booking engine people trust
 * and one they stop using.
 *
 * Note this deliberately does NOT match how capacity is counted. The capacity
 * guard in /api/place-bookings holds the room on the check-out date too
 * (`day >= start && day <= end`), which over-reserves by one day. That is the
 * safe direction to be wrong in — it can only ever refuse a booking, never
 * double-sell a room — so it is left alone here. Charging is a separate
 * question from holding, and only charging has to be exact.
 *
 * Returns 0 for a missing, malformed or backwards range, which callers treat as
 * "not priceable yet" rather than free.
 */
export function nightsBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : 0;
}

/** A positive whole number of rupees, or 0. Guards against NaN/negative/float. */
function money(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Price a stay.
 *
 * Returns null when there is nothing to charge — no rate set at all, or no
 * usable date range. Null means "request only, the owner confirms and prices by
 * hand", which is exactly how a listing with no depositAmount behaves today.
 * It must never be read as zero.
 */
export function quoteStay(
  rates: StayRates | null | undefined,
  start: string,
  end: string,
  rooms = 1,
): StayQuote | null {
  if (!rates) return null;
  const n = nightsBetween(start, end);
  const r = Math.max(1, Math.round(Number(rooms) || 1));

  const nightly = money(rates.nightlyRate);
  if (nightly > 0) {
    // No nights yet (dates half-chosen) is not a free stay — it is not yet a
    // quote. The caller shows the rate and waits.
    if (n <= 0) return null;
    return { nights: n, rooms: r, rate: nightly, total: nightly * n * r, flat: false };
  }

  // ── Legacy flat listings ────────────────────────────────────────────────
  // Unchanged behaviour, on purpose: one amount, per reservation, regardless of
  // nights or rooms. Reported with flat:true so the UI can say so plainly
  // instead of implying a per-night price that was never charged.
  const flat = money(rates.depositAmount);
  if (flat > 0) {
    return { nights: n, rooms: r, rate: flat, total: flat, flat: true };
  }
  return null;
}
