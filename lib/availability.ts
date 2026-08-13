import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { isActiveHold, HOLDING_STATUSES } from "@/lib/holds";

// Is a vehicle still free for a date range, counting ONLY active holds (paid
// deposits / confirmed bookings — unpaid pending no longer blocks)? Used at
// payment time so the first person to pay the deposit secures the vehicle, and
// to decide which now-blocked pending requests to release.
export async function isVehicleFree(
  scooter: string,
  start_date: string,
  end_date: string,
  excludeId?: string,
): Promise<boolean> {
  if (!scooter || !start_date || !end_date) return true;
  const [content, supabase] = await Promise.all([getContent(), getPrivileged()]);

  const item = content.fleet.find((f) => f.id === scooter || f.name === scooter);
  const activeAssets = (item?.assets ?? []).filter((a) => a.active !== false);
  const units = activeAssets.length > 0 ? activeAssets.length : Math.max(1, item?.units ?? 1);

  const { data, error } = await supabase
    .from("bookings")
    .select("id, start_date, end_date, status, created_at, deposit_paid_at, payment_due_by")
    .eq("scooter", scooter)
    .in("status", [...HOLDING_STATUSES])
    .gte("end_date", start_date)
    .lte("start_date", end_date);

  // FAIL CLOSED. This error used to be discarded, which meant `data` was null,
  // `ranges` was empty, the loop counted zero holds and the function returned
  // "free" — so a transient Supabase failure silently reported every vehicle as
  // available. At payment time that is how two customers both capture a deposit
  // on the same physical scooter. Saying "we can't confirm availability right
  // now" costs one booking; saying "free" when it isn't costs a booking AND a
  // refund AND the customer's trip.
  if (error) {
    console.error(`isVehicleFree: availability check FAILED for ${scooter} — treating as unavailable`, error);
    return false;
  }

  const ranges = ((data ?? []) as { id: string; start_date: string; end_date: string; status: string; created_at: string | null; deposit_paid_at: string | null }[])
    .filter((r) => r.id !== excludeId && isActiveHold(r));

  for (let d = new Date(start_date); d <= new Date(end_date); d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const held = ranges.reduce((n, r) => (day >= r.start_date && day <= r.end_date ? n + 1 : n), 0);
    if (held >= units) return false;
  }
  return true;
}
