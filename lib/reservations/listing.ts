import type { RecommendedPlace } from "@/lib/defaults";
import { placePrice } from "@/lib/place-detail";
import { providerOf } from "@/lib/experiences";
import type { ListingPricing, ProductType } from "./policy";

// ── A listing, as the reservation engine sees it ─────────────────────────────
//
// Everything the engine knows about a product comes from the listing the
// owner edits — never from code: the adult price is placePrice() (the owner's
// price note), child and baby prices are the listing's own fields, capacity
// is the listing's. The SNAPSHOT freezes it onto the reservation, so a later
// edit of the listing cannot rewrite what a guest was quoted.

/** Places the engine takes today. Stays and tables still use place_bookings. */
export function engineHandles(p: Pick<RecommendedPlace, "category">): boolean {
  return p.category === "activity";
}

export function productTypeOf(p: Pick<RecommendedPlace, "category" | "serviceType" | "isTour">): ProductType {
  if (p.category === "hotel") return "stay";
  if (p.category === "activity") {
    if (p.serviceType === "boat" || p.serviceType === "fishing") return "boat";
    if (p.isTour) return "experience";
    return "activity";
  }
  return "other";
}

const PER_PERSON = /person|personne|\bpp\b|\bpax\b|par pers|per head|\/\s*p\b/i;

export function pricingOf(p: RecommendedPlace): ListingPricing {
  const unit = placePrice(p);
  return {
    unit_mur: unit,
    // An activity is priced per person unless its note says otherwise; a stay
    // or a table never is.
    perPerson: p.category === "activity" ? PER_PERSON.test(p.priceNote ?? "") || !p.priceNote : false,
    child_mur: typeof p.childPrice === "number" && p.childPrice >= 0 ? Math.round(p.childPrice) : null,
    baby_mur: typeof p.babyPrice === "number" && p.babyPrice >= 0 ? Math.round(p.babyPrice) : null,
  };
}

// ── What capacity counts: seats, or trips ───────────────────────────────────
//
// One field, two editors, two meanings. The places editor labels `capacity`
// "SPOTS PER DATE" (Île aux Cocos: 36 seats); the services editor labels the
// SAME field "TRIPS PER DAY" beside "PEOPLE PER TRIP" (maxGuests). Counting
// people against a trips number caps the Sunrise hike — one guided hike a day
// for up to 8 — at a single person.
//
// So: when a trip takes more people than the listing has units, the units are
// trips — a reservation uses one, and its party may be up to maxGuests. Every
// other listing counts seats, and a party may not exceed either number.

export type CapacityRule = { mode: "seats" | "trips"; capacity: number; maxParty: number };

export function capacityOf(p: Pick<RecommendedPlace, "capacity" | "maxGuests">): CapacityRule {
  const cap = Math.max(1, Math.round(p.capacity ?? 1));
  const per = typeof p.maxGuests === "number" && p.maxGuests > 0 ? Math.round(p.maxGuests) : null;
  if (per != null && per > cap) return { mode: "trips", capacity: cap, maxParty: per };
  return { mode: "seats", capacity: cap, maxParty: Math.min(cap, per ?? cap) };
}

/** Capacity units one reservation of this party uses. */
export function unitsFor(rule: CapacityRule, partySize: number): number {
  return rule.mode === "trips" ? 1 : Math.max(1, partySize);
}

export type ProductSnapshot = {
  title: string;
  provider: string | null;
  image: string | null;
  unit_price_mur: number | null;
  per_person: boolean;
  child_price_mur: number | null;
  baby_price_mur: number | null;
  currency: "MUR";
  meeting_point: string | null;
  /** Units per date/slot — seats or trips (capacity_unit). */
  capacity: number;
  capacity_unit: "seats" | "trips";
  max_party: number;
  duration_minutes: number | null;
  price_note: string | null;
};

export function snapshotOf(p: RecommendedPlace): ProductSnapshot {
  const pr = pricingOf(p);
  const rule = capacityOf(p);
  return {
    title: p.name.trim(),
    provider: providerOf(p),
    image: p.images?.[0] || p.image || null,
    unit_price_mur: pr.unit_mur,
    per_person: pr.perPerson,
    child_price_mur: pr.child_mur ?? null,
    baby_price_mur: pr.baby_mur ?? null,
    currency: "MUR",
    meeting_point: p.meetingPoint?.trim() || null,
    capacity: rule.capacity,
    capacity_unit: rule.mode,
    max_party: rule.maxParty,
    duration_minutes: typeof p.durationMinutes === "number" ? p.durationMinutes : null,
    price_note: p.priceNote?.trim() || null,
  };
}

/** The capacity bucket: a date, or a date and time slot. */
export function slotKeyOf(date: string, time: string | null): string {
  return time ? `${date}@${time}` : date;
}
