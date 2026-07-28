import { getPrivileged } from "@/lib/supabase/admin";
import { getContent } from "@/lib/content";
import { isActiveHold } from "@/lib/holds";

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

  const { data } = await supabase
    .from("bookings")
    .select("id, start_date, end_date, status, created_at, deposit_paid_at")
    .eq("scooter", scooter)
    .in("status", ["pending", "confirmed"])
    .gte("end_date", start_date)
    .lte("start_date", end_date);

  const ranges = ((data ?? []) as { id: string; start_date: string; end_date: string; status: string; created_at: string | null; deposit_paid_at: string | null }[])
    .filter((r) => r.id !== excludeId && isActiveHold(r));

  for (let d = new Date(start_date); d <= new Date(end_date); d.setDate(d.getDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const held = ranges.reduce((n, r) => (day >= r.start_date && day <= r.end_date ? n + 1 : n), 0);
    if (held >= units) return false;
  }
  return true;
}
