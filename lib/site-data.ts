import { getContent } from "@/lib/content";
import { getPrivileged } from "@/lib/supabase/admin";
import { isActiveHold } from "@/lib/holds";
import type { FleetItem, SiteContent } from "@/lib/defaults";
import type { BrowseCategory } from "@/components/WhatLookingFor";

export type FleetView = FleetItem & { soldOutToday: boolean };

export interface ReviewCard {
  id: string;
  name: string;
  origin: string | null;
  rating: number;
  text: string;
  scooter_name: string | null;
}

/**
 * Shared server-side data for the homepage and the /browse category pages:
 * the fleet enriched with live "sold out today" state, real approved ratings,
 * honest recent-booking counts, approved reviews (for the marquee), and the
 * business WhatsApp number. All four reads run in parallel (one round-trip of
 * latency instead of four) and are best-effort — the page never blocks on them.
 */
export async function getFleetView() {
  const content = await getContent();

  const todayIsland = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Rodrigues = UTC+4
  const heldToday: Record<string, number> = {};
  const recentBookings: Record<string, number> = {};
  const ratings: Record<string, { avg: number; count: number }> = {};
  let reviews: ReviewCard[] = [];

  try {
    const supabase = await getPrivileged();
    const sevenAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [todayRes, recentRes, ratingRes, reviewRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("scooter, status, created_at")
        .in("status", ["pending", "confirmed"])
        .lte("start_date", todayIsland)
        .gte("end_date", todayIsland),
      supabase
        .from("bookings")
        .select("scooter, created_at, status")
        .gte("created_at", sevenAgo)
        .neq("status", "cancelled"),
      supabase.from("product_reviews").select("scooter_id, rating").eq("status", "approved"),
      supabase
        .from("product_reviews")
        .select("id, name, origin, rating, text, scooter_name")
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    for (const b of todayRes.data ?? []) {
      if (!isActiveHold(b)) continue;
      heldToday[b.scooter] = (heldToday[b.scooter] ?? 0) + 1;
    }
    for (const b of recentRes.data ?? []) {
      if (!b.scooter) continue;
      recentBookings[b.scooter] = (recentBookings[b.scooter] ?? 0) + 1;
    }
    const acc: Record<string, { sum: number; count: number }> = {};
    for (const r of ratingRes.data ?? []) {
      const id = r.scooter_id as string | null;
      const rating = Number(r.rating);
      if (!id || !Number.isFinite(rating)) continue;
      acc[id] = { sum: (acc[id]?.sum ?? 0) + rating, count: (acc[id]?.count ?? 0) + 1 };
    }
    for (const [id, v] of Object.entries(acc)) {
      ratings[id] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
    }
    reviews = ((reviewRes.data ?? []) as ReviewCard[]).filter((r) => r.text && r.name);
  } catch {
    /* best-effort — never block the page */
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

  return { content, fleet, ratings, recentBookings, businessWhatsApp, reviews };
}

// ── Shared category builder (homepage hub + browse pages + sticky tabs) ──────
function priceNumber(price: string): number | null {
  const m = price.match(/[\d,]+/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function firstImage(items: { image?: string; images?: string[] }[]): string | undefined {
  for (const it of items) {
    const img = it.images?.[0] || it.image;
    if (img) return img;
  }
  return undefined;
}

export function buildBrowseCategories(
  content: SiteContent,
  fleet: FleetView[],
  recentBookings: Record<string, number> = {},
): BrowseCategory[] {
  const cats: BrowseCategory[] = [];
  const vehicleBookings: Record<string, number> = {}; // slug → total recent bookings
  for (const vc of content.vehicleCategories.filter((c) => c.enabled)) {
    const items = fleet.filter((f) => (f.category ?? "scooter") === vc.id);
    if (!items.length) continue;
    const prices = items.map((it) => priceNumber(it.price)).filter((n): n is number => n != null);
    const min = prices.length ? Math.min(...prices) : null;
    vehicleBookings[vc.id] = items.reduce((n, it) => n + (recentBookings[it.id] ?? 0), 0);
    cats.push({
      slug: vc.id,
      label: vc.label,
      image: firstImage(items),
      count: items.length,
      ...(min != null ? { priceFrom: `From Rs ${min.toLocaleString()}/day` } : {}),
    });
  }
  // "Popular" = the most-booked vehicle category (real data). With no bookings
  // yet, fall back to the first/flagship vehicle category (editorial pick).
  const vehicleSlugs = Object.keys(vehicleBookings);
  if (vehicleSlugs.length) {
    let top = vehicleSlugs[0];
    for (const s of vehicleSlugs) if (vehicleBookings[s] > vehicleBookings[top]) top = s;
    const winner = cats.find((c) => c.slug === top);
    if (winner) winner.popular = true;
  }
  {
    // Stay·Eat·Do live in the hub as their own tiles — show each whenever it has
    // items (no longer gated on the old homepage-section "enabled" flag).
    // Food is different: instead of a restaurant LISTING, the tile opens the
    // WhatsApp food concierge (/food) — a human recommends & books the table.
    const fc = content.foodConcierge;
    const rest = content.recommended.items.filter((p) => p.category === "restaurant");
    if (fc?.enabled) {
      cats.push({
        slug: "food",
        href: "/food",
        label: "Food & Dining",
        image: firstImage(rest),
        emoji: "🍽️",
        count: 0,
        tagline: "Free concierge · we book your table",
      });
    }
    const act = content.recommended.items.filter((p) => p.category === "activity" && !p.isTour);
    if (act.length) cats.push({ slug: "activities", label: "Activities", image: firstImage(act), emoji: "🤿", count: act.length });
    const tours = content.recommended.items.filter((p) => p.category === "activity" && p.isTour);
    if (tours.length) cats.push({ slug: "tours", label: "Guided Tours", image: firstImage(tours), emoji: "🧭", count: tours.length });
    const stays = content.recommended.items.filter((p) => p.category === "hotel");
    if (stays.length) cats.push({ slug: "stays", label: "Stays", image: firstImage(stays), emoji: "🏝️", count: stays.length });
  }
  const ga = (content.gettingAround?.options ?? []).filter((o) => o.icon !== "bus");
  if (content.gettingAround?.enabled && ga.length) {
    cats.push({ slug: "getting-around", label: "Getting around", emoji: "🚕", count: ga.length });
  }
  const events = content.events.filter((e) => e.title);
  if (events.length) {
    cats.push({ slug: "events", label: "What's on", image: firstImage(events), emoji: "🎉", count: events.length });
  }
  return cats;
}
