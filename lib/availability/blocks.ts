import "server-only";
import { getPrivileged } from "@/lib/supabase/admin";

// ── DATES A VEHICLE IS GONE FOR A REASON THAT IS NOT A BOOKING ──────────────
//
// The owner reported that a date can show free on the website while it is
// already taken in real life. The availability engine turned out not to be the
// problem: /api/availability, the guard in /api/bookings and isVehicleFree()
// all read live rows on every request, with no cache to go stale.
//
// The problem was that all three read one table — `bookings` — so a scooter
// lent to a friend, in for a service, rented over the counter or taken on
// WhatsApp was invisible. Not because the site heard about it late, but because
// there was nowhere to write it down.
//
// A block behaves EXACTLY like a held booking in the capacity arithmetic: it
// occupies one unit of one vehicle across a date range. That is deliberate —
// the three read-sites already count holds per day against `units`, so they can
// count blocks in the same loop without learning a new shape.

export type Block = {
  scooter: string;
  start_date: string;
  end_date: string;
  asset_id: string | null;
  reason?: string | null;
};

/**
 * Blocks overlapping a window, for one vehicle or all of them.
 *
 * ── FAILS CLOSED, AND SAYS SO ───────────────────────────────────────────────
 * Returns `null` on a query error rather than an empty array. An empty array is
 * indistinguishable from "nothing is blocked", which is the exact failure
 * lib/availability.ts already documents for bookings: a transient database
 * error silently reporting every vehicle as free, and two customers paying a
 * deposit on the same scooter.
 *
 * Callers must treat null as "cannot confirm availability" — never as "free".
 */
export async function blocksOverlapping(
  startDate: string,
  endDate: string,
  scooter?: string,
): Promise<Block[] | null> {
  const supabase = await getPrivileged();
  let query = supabase
    .from("availability_blocks")
    .select("scooter, start_date, end_date, asset_id, reason")
    // The same overlap test the bookings queries use: a block that ENDS before
    // the window starts, or STARTS after it ends, cannot touch it.
    .gte("end_date", startDate)
    .lte("start_date", endDate);

  if (scooter) query = query.eq("scooter", scooter);

  const { data, error } = await query;
  if (error) {
    console.error(
      `availability blocks: query FAILED for ${scooter ?? "all vehicles"} ${startDate}..${endDate} — treating as unable to confirm`,
      error,
    );
    return null;
  }
  return (data ?? []) as Block[];
}

/**
 * How many units of a vehicle a set of blocks removes on one day.
 *
 * Pure, so the arithmetic that decides whether somebody can book is testable
 * without a database. Mirrors `heldOn()` in app/api/bookings/route.ts.
 */
export function blockedOn(blocks: Block[], day: string): number {
  return blocks.reduce(
    (n, b) => (day >= b.start_date && day <= b.end_date ? n + 1 : n),
    0,
  );
}

/** Every asset id a set of blocks has pinned, so unit assignment can skip them. */
export function blockedAssetIds(blocks: Block[]): Set<string> {
  return new Set(
    blocks.map((b) => b.asset_id).filter((id): id is string => Boolean(id)),
  );
}

/** Every date in an inclusive range, as YYYY-MM-DD. */
export function eachDay(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = new Date(endDate);
  for (const d = new Date(startDate); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
