// ── MATCHING A CUSTOMER BY EMAIL, EXACTLY ───────────────────────────────────
//
// bookings, place_bookings and ride_requests predate accounts and carry no
// customer_id, so a signed-in customer's rentals and rides are found by the
// address on their session. They were found with `.ilike(column, email)` on
// the belief that a plain address "carries no wildcards". It does: in LIKE an
// underscore matches any one character, so j_doe@gmail.com also matched
// jxdoe@gmail.com and j-doe@gmail.com — another customer's bookings, shown on
// the wrong account. (PostgREST also reads `*` as `%`.)
//
// Two layers, so neither has to be perfect:
//   escapeLike  makes the query ask for the literal address;
//   sameEmail   re-checks every returned row for exact, case-insensitive
//               equality before anything is shown.
// The second is the guarantee; the first only keeps the query from fetching
// rows that would be thrown away.

/** The address as a LIKE pattern that matches only itself. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Exact, case- and whitespace-insensitive equality. Empty never matches. */
export function sameEmail(stored: unknown, sessionEmail: string): boolean {
  const want = (sessionEmail ?? "").trim().toLowerCase();
  if (!want) return false;
  return typeof stored === "string" && stored.trim().toLowerCase() === want;
}
