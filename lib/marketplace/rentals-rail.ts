import type { FleetItem, SiteContent } from "@/lib/defaults";
import { buildBrowseCategories, isSellableFleetItem, vehiclePriceNumber } from "@/lib/site-data";
import { categoryFrom } from "@/lib/browse-copy";
import { unitToBook, vehicleHref, vehicleName } from "@/lib/vehicle-slug";
import { experiencesOfType } from "@/lib/experiences";
import { recommendedCount } from "@/lib/listing-gates";
import { isSeedContent } from "@/lib/llms-txt";

// ── RENTALS INSIDE THE MARKETPLACE, WITHOUT A SECOND ENGINE ─────────────────
//
// Architecture review 2026-09-30, item 2. The brief asked for every rental to
// become a Marketplace listing. The repo says no, for money reasons: a rental
// is a `bookings` row in RUPEES with per-asset holds, owner approval (M91), a
// PayPal deposit or pay-in-person (M220); a marketplace order is price × qty in
// CENTS with no dates at all. Moving the fleet would have broken all of it and
// the /browse ranking history with it.
//
// So Rentals joins the Marketplace at the NAVIGATION layer. This reads the
// fleet the /browse pages read and hands the hub links to those pages — the
// same categories, the same "from" price, the same vehicle URLs — and owns no
// rule of its own. Each decision is somebody else's function:
//
//   which categories      buildBrowseCategories (the homepage hub + sitemap set)
//   the from-price        categoryFrom, the figure /browse/<category> prints
//   a vehicle's URL       vehicleHref, the one the page and its Offer url use
//   is it for sale        isSellableFleetItem (a priced row, never a draft)
//   which twin it shows   unitToBook, the unit the vehicle page books
//
// Boats and fishing are NOT rentals here and are never called rentals: they
// are skippered experiences on place_bookings. They get one cross-link line,
// only while each vertical has a provider.

export type RentalCategoryLink = {
  /** The vehicle category id, e.g. "scooter". */
  id: string;
  /** The owner's own label for it, e.g. "Scooters". */
  label: string;
  href: string;
  /** Cheapest sellable daily rate; null on a seed read (nobody's price). */
  fromPerDay: number | null;
  /** "motor" unless the owner set otherwise — see VehicleCategory.rentalKind. */
  kind: "motor" | "equipment";
};

export type RentalVehicleLink = {
  name: string;
  href: string;
  category: string;
  /** The daily rate its own page prints (priceNumber of the owner's price). */
  perDay: number | null;
};

export type WaterLink = { type: "boat" | "fishing"; href: string; label: string };

export type RentalsRail = {
  categories: RentalCategoryLink[];
  vehicles: RentalVehicleLink[];
  water: WaterLink[];
};

/**
 * The rental categories a visitor can book today: enabled by the owner AND
 * holding at least one priced vehicle. A category that is switched off, or
 * holds only drafts, is absent — never a door to an empty page.
 *
 * getContent() answers DEFAULT_CONTENT when its read fails, and the seed's
 * "From Rs 600" is nobody's price (lib/home-description.ts): on a seed read the
 * categories still link, with no figure.
 */
export function rentalCategories(content: SiteContent): RentalCategoryLink[] {
  const enabled = new Map(
    (content.vehicleCategories ?? []).filter((c) => c.enabled).map((c) => [c.id, c]),
  );
  const seed = isSeedContent(content);
  // soldOutToday is live state from four privileged reads (getFleetView), and
  // nothing here shows it — the hub is ISR for an hour, which would make
  // "sold out" a guess. buildBrowseCategories does not read it either.
  const fleet = (content.fleet ?? []).map((f) => ({ ...f, soldOutToday: false }));

  return buildBrowseCategories(content, fleet)
    .filter((c) => !c.href && enabled.has(c.slug))
    .map((c) => ({
      id: c.slug,
      label: c.label,
      href: `/browse/${c.slug}`,
      fromPerDay: seed ? null : categoryFrom(content.fleet, c.slug, content.vehicleCategories),
      kind: enabled.get(c.slug)?.rentalKind ?? "motor",
    }));
}

/** The whole Rentals section of /marketplace. */
export function buildRentalsRail(content: SiteContent): RentalsRail {
  const categories = rentalCategories(content);
  const live = new Set(categories.map((c) => c.id));

  // One card per vehicle PAGE. The fleet models physical units (two Avenis
  // rows, two Swifts) and slugs come from the name, so twins share a page —
  // the sitemap dedupes the same way.
  //
  // The card speaks for the unit that page books, not for the first row
  // (architecture review 2026-09-30, twin-unit fix): the vehicle page picks
  // unitToBook() among its sellable twins, so with the first Avenis withdrawn
  // it sells the free one at that one's own price. Judging the first row
  // alone dropped a bookable model from the hub. Grouping by vehicleHref is
  // the grouping findVehicleUnits() does (same category, same slug), and Map
  // keeps first-appearance order, so the card order is the fleet's.
  //
  // soldOutToday is cleared for the reason rentalCategories gives: the hub is
  // ISR for an hour and reads no live holds, so unitToBook here falls back to
  // the first unit that is for hire.
  //
  // None on a seed read: the seed's names are not the live fleet's, and a
  // card built from them would link a vehicle page that 404s.
  const vehicles: RentalVehicleLink[] = [];
  if (!isSeedContent(content)) {
    const pages = new Map<string, { category: string; units: FleetItem[] }>();
    for (const v of content.fleet ?? []) {
      const category = v.category ?? "scooter";
      if (!live.has(category) || !isSellableFleetItem(v)) continue;
      const href = vehicleHref({ ...v, category });
      const page = pages.get(href) ?? { category, units: [] };
      page.units.push({ ...v, soldOutToday: false });
      pages.set(href, page);
    }
    for (const [href, { category, units }] of pages) {
      const unit = unitToBook(units);
      // Every twin off the road: the page says "Unavailable", so a hub card
      // inviting a tap would contradict it. The category door still leads
      // there.
      if (!unit || unit.available === false) continue;
      vehicles.push({ name: vehicleName(unit), href, category, perDay: vehiclePriceNumber(unit, content.vehicleCategories) });
    }
  }

  // "On the water, with a skipper." Shown while the vertical has a provider;
  // unknown (the content row was not read) keeps the link, by the rule in
  // lib/listing-gates.ts.
  const items = content.recommended?.items ?? [];
  const water = (
    [
      { type: "boat", href: "/experiences/boat", label: "boat trips" },
      { type: "fishing", href: "/experiences/fishing", label: "fishing trips" },
    ] as const
  )
    .filter((w) => recommendedCount(content, experiencesOfType(items, w.type)) !== 0)
    .map((w) => ({ ...w }));

  return { categories, vehicles, water };
}

/** "Rs 1,899" — English grouping, as /browse and the hub tiles write it. */
export function rupees(n: number): string {
  return `Rs ${n.toLocaleString("en-US")}`;
}
