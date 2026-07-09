import { getContent } from "@/lib/content";
import { getPrivileged } from "@/lib/supabase/admin";
import { isActiveHold } from "@/lib/holds";
import type { FleetItem } from "@/lib/defaults";

export type FleetView = FleetItem & { soldOutToday: boolean };

/**
 * Shared server-side data for the homepage and the /browse category pages:
 * the fleet enriched with live "sold out today" state, real approved ratings,
 * honest recent-booking counts, and the business WhatsApp number.
 * All Supabase reads are best-effort — the page never blocks on them.
 */
export async function getFleetView() {
  const content = await getContent();

  // Rodrigues = UTC+4
  const todayIsland = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10);
  const heldToday: Record<string, number> = {};
  const recentBookings: Record<string, number> = {};
  const ratings: Record<string, { avg: number; count: number }> = {};

  try {
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("bookings")
      .select("scooter, status, created_at")
      .in("status", ["pending", "confirmed"])
      .lte("start_date", todayIsland)
      .gte("end_date", todayIsland);
    for (const b of data ?? []) {
      if (!isActiveHold(b)) continue;
      heldToday[b.scooter] = (heldToday[b.scooter] ?? 0) + 1;
    }
  } catch {
    /* availability is best-effort */
  }

  try {
    const supabase = await getPrivileged();
    const sevenAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data } = await supabase
      .from("bookings")
      .select("scooter, created_at, status")
      .gte("created_at", sevenAgo)
      .neq("status", "cancelled");
    for (const b of data ?? []) {
      if (!b.scooter) continue;
      recentBookings[b.scooter] = (recentBookings[b.scooter] ?? 0) + 1;
    }
  } catch {
    /* social proof is best-effort */
  }

  try {
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("product_reviews")
      .select("scooter_id, rating")
      .eq("status", "approved");
    const acc: Record<string, { sum: number; count: number }> = {};
    for (const r of data ?? []) {
      const id = r.scooter_id as string | null;
      const rating = Number(r.rating);
      if (!id || !Number.isFinite(rating)) continue;
      acc[id] = { sum: (acc[id]?.sum ?? 0) + rating, count: (acc[id]?.count ?? 0) + 1 };
    }
    for (const [id, v] of Object.entries(acc)) {
      ratings[id] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
    }
  } catch {
    /* ratings are best-effort */
  }

  const fleet: FleetView[] = content.fleet.map((s) => {
    const activeUnits = (s.assets ?? []).filter((a) => a.active !== false).length;
    const capacity = activeUnits > 0 ? activeUnits : Math.max(1, s.units ?? 1);
    return { ...s, soldOutToday: (heldToday[s.id] ?? 0) >= capacity };
  });

  const businessWhatsApp =
    content.social.whatsapp ||
    content.contact.whatsappNumbers?.[0]?.number ||
    content.contact.phone ||
    "";

  return { content, fleet, ratings, recentBookings, businessWhatsApp };
}
