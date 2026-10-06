import {
  priceBreakdown,
  extractDailyPrice,
  type DeliveryPricedCategory,
  type PriceableVehicle,
} from "@/lib/booking-pricing";
import { vehicleHref, vehicleName } from "@/lib/vehicle-slug";

// ── WHAT A RENTAL COSTS, WORKED OUT ONCE (SEO audit 2026-09-29 C18) ─────────
//
// The vehicle detail pages have carried a 1-day / 3-day / 1-week table since
// M159, computed inline with priceBreakdown(). /browse/car needed the same
// numbers for every model — "how much is car rental in Rodrigues" is the query
// it ranks on — and a second copy of the arithmetic on the category page is
// how the two tables would come to disagree. So both pages ask this file, and
// this file asks priceBreakdown(), the function /api/bookings charges with.

/** The rental lengths both tables show. */
export const COST_DAYS = [1, 3, 7] as const;

/** Scooters add the 2-day rate: it is a price of its own (SCOOTER_RATES). */
export const SCOOTER_COST_DAYS = [1, 2, 3, 7] as const;

export type CostTier = {
  days: number;
  /** "1 day", "3 days", "1 week". */
  label: string;
  /** Rental only, whole rupees: no delivery, no deposit. */
  rental: number;
  perDay: number;
  /** Percent below the 1-day rate. 0 for a car since M159 removed the
   *  automatic tiers; a scooter's published list (SCOOTER_RATES) lands here
   *  too. No page prints it as a "% OFF" badge (owner brief, 6 Oct 2026). */
  off: number;
};

export function costLabel(days: number): string {
  return days === 1 ? "1 day" : days === 7 ? "1 week" : `${days} days`;
}

/**
 * The rate table for one vehicle, or [] when there is nothing honest to show.
 *
 * Fewer than two priced rows is not a table — the page shows the day rate
 * beside the name already — so it returns nothing rather than one line.
 */
export function costTiers(
  vehicle: PriceableVehicle | undefined,
  categories?: DeliveryPricedCategory[],
  days: readonly number[] = COST_DAYS,
): CostTier[] {
  const priced = days
    .map((d) => ({ d, b: priceBreakdown(vehicle, d, categories) }))
    .filter((t): t is { d: number; b: NonNullable<typeof t.b> } => Boolean(t.b));
  if (priced.length < 2) return [];
  const base = Math.round(priced[0].b.rental / priced[0].d);
  return priced.map(({ d, b }) => {
    const perDay = Math.round(b.rental / d);
    const off = base > 0 ? Math.round(100 - (perDay / base) * 100) : 0;
    return { days: d, label: costLabel(d), rental: b.rental, perDay, off };
  });
}

export type ModelCost = { name: string; href: string; tiers: CostTier[] };

type CostedVehicle = PriceableVehicle & { id?: string; name?: string };

/**
 * One row per MODEL, not per fleet unit.
 *
 * The owner runs two Swifts and two Avenis, and their slugs come from the name,
 * so twin units share one page (see the Product grouping in
 * app/browse/[category]/page.tsx). Grouped by that URL, priced from the
 * cheapest unit — what "from" means on the card — in catalogue order.
 */
export function modelCostTable(
  items: CostedVehicle[],
  categories?: DeliveryPricedCategory[],
): ModelCost[] {
  const byHref = new Map<string, CostedVehicle[]>();
  for (const it of items) {
    const href = vehicleHref(it);
    byHref.set(href, [...(byHref.get(href) ?? []), it]);
  }
  const rows: ModelCost[] = [];
  for (const [href, units] of byHref) {
    const priced = units.filter((u) => extractDailyPrice(u.price) > 0);
    if (!priced.length) continue;
    const cheapest = priced.reduce((a, b) =>
      extractDailyPrice(b.price) < extractDailyPrice(a.price) ? b : a,
    );
    const tiers = costTiers(cheapest, categories);
    if (tiers.length) rows.push({ name: vehicleName(cheapest), href, tiers });
  }
  return rows;
}
