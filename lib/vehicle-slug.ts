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
export function findVehicle(
  fleet: FleetItem[],
  category: string,
  slug: string,
): FleetItem | undefined {
  const want = slug.toLowerCase();
  const inCategory = fleet.filter((f) => (f.category ?? "scooter") === category);
  return (
    inCategory.find((f) => vehicleSlug(f) === want) ??
    inCategory.find((f) => (f.id ?? "").toLowerCase() === want)
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
