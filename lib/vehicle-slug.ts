import type { FleetItem } from "@/lib/defaults";

// ── A VEHICLE NEEDS A URL YOU CAN SEND SOMEBODY ─────────────────────────────
//
// Every vehicle's detail view was a modal: no route, no history entry, nothing
// to paste. This business closes its deals on WhatsApp — five of its ten
// reviews describe being met at a guest house — and the owner could not send
// "here is the Avenis, Rs 699 a day" as a link. Every conversation had to drop
// the customer on a category grid and ask them to find the bike again.
//
// The id is not usable as that URL. Two vehicles carry hand-written ids
// ("burgman", "avenis") and the third carries "veh-1783380348440", a timestamp
// — so slugs come from the NAME, which is what a person would type anyway, with
// the id as the fallback for a vehicle whose name is punctuation only.

export function vehicleSlug(v: { id?: string; name?: string }): string {
  const fromName = (v.name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return fromName || (v.id ?? "");
}

/** The vehicle a slug names, or undefined. Matches the slug first, then the raw
 *  id — so links written before slugs existed keep resolving. */
export function findVehicle<T extends Pick<FleetItem, "id" | "name" | "category"> = FleetItem>(
  fleet: T[],
  category: string,
  slug: string,
): T | undefined {
  const want = slug.toLowerCase();
  const inCategory = fleet.filter((f) => (f.category ?? "scooter") === category);
  return (
    inCategory.find((f) => vehicleSlug(f) === want) ??
    inCategory.find((f) => (f.id ?? "").toLowerCase() === want)
  );
}

// ── TWIN UNITS SHARE ONE PAGE, SO THE PAGE MUST SPEAK FOR ALL OF THEM ───────
//
// Architecture review 2026-09-30. The fleet models PHYSICAL units: the owner
// runs two AVENIS 125cc as two rows ("avenis" and "scooter-1780519312391"), and
// the slug comes from the name, so both live at /browse/scooter/avenis-125cc.
// The page resolved only the FIRST row — so with that one out on hire it said
// "Fully booked today" and pointed its Book link at the busy unit while its
// twin stood free. Availability is counted per fleet id (lib/holds.ts,
// lib/availability.ts), so a booking made against the busy id competes for the
// busy unit even though the free one is the same model.
//
// Nothing here changes a stored id: the rows stay two rows (deleting a twin
// once destroyed real inventory), the booking API is untouched, and the page
// simply hands the visitor the unit that can actually be booked.

/** Every row sharing the page `slug` names: the unit it resolves to plus its
 *  same-name twins. Empty when the slug names nothing in this category. */
export function findVehicleUnits<T extends Pick<FleetItem, "id" | "name" | "category">>(
  fleet: T[],
  category: string,
  slug: string,
): T[] {
  const first = findVehicle(fleet, category, slug);
  if (!first) return [];
  const page = vehicleSlug(first);
  return fleet.filter(
    (f) => (f.category ?? "scooter") === category && vehicleSlug(f) === page,
  );
}

/**
 * The unit a Book link should reserve: the first one that is for hire AND not
 * out on a trip today; else one that is for hire (every unit busy today — the
 * page says "fully booked today", and picking dates is the right next step);
 * else the first (every unit withdrawn). So "Fully booked" shows only when ALL
 * twins are out, and "not available" only when all are withdrawn.
 */
export function unitToBook<T extends { available?: boolean; soldOutToday?: boolean }>(
  units: T[],
): T | undefined {
  return (
    units.find((u) => u.available !== false && u.soldOutToday !== true) ??
    units.find((u) => u.available !== false) ??
    units[0]
  );
}

/** Where this vehicle lives. One definition, so the page, the links, the
 *  sitemap and the Offer url in the structured data cannot disagree. */
export function vehicleHref(v: { id?: string; name?: string; category?: string }): string {
  return `/browse/${v.category ?? "scooter"}/${vehicleSlug(v)}`;
}

/**
 * The vehicle name as it should be shown to a human.
 *
 * The fleet is typed into an admin textarea, so names arrive with whatever
 * whitespace the owner's keyboard produced. One of them shipped as
 * "Suzuki Swift (Latest Gen) " with a trailing space, which rendered in the
 * page <title> as "Suzuki Swift (Latest Gen)  — Rs 1499/day" — a double space
 * in the one string Google prints in the search result. Slugs already
 * normalise; display names did not.
 */
export function vehicleName(v: { name?: string; id?: string }): string {
  return (v.name ?? "").replace(/\s+/g, " ").trim() || (v.id ?? "Vehicle");
}
