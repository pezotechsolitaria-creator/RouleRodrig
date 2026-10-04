import type { MapLocation, SiteContent } from "@/lib/defaults";
import { placeHref } from "@/lib/place-href";
import { isSellableFleetItem } from "@/lib/site-data";
import { vehicleHref, vehicleName } from "@/lib/vehicle-slug";

// ── "BOOK NEAR HERE", FROM THE OWNER'S OWN LINKS ONLY (architecture review 2026-09-30, item 2) ──
//
// Nothing joins a place to the listings around it: stores have free-text
// addresses, experiences a free-text meeting point, and five gazetteers
// disagree on names. Guessing a match by name or distance would put a boat trip
// that leaves from the other side of the island under "near here". So the only
// source is relatedListingIds, which the owner fills in by hand, and an id that
// no longer resolves to something bookable is skipped rather than rendered as
// a link to nowhere.

export type NearHere = { href: string; name: string };

export function bookNearHere(
  place: Pick<MapLocation, "relatedListingIds">,
  content: Pick<SiteContent, "recommended" | "fleet" | "vehicleCategories">,
): NearHere[] {
  const out: NearHere[] = [];
  const seen = new Set<string>();
  const enabled = new Set(content.vehicleCategories.filter((c) => c.enabled).map((c) => c.id));

  for (const id of place.relatedListingIds ?? []) {
    let hit: NearHere | null = null;

    // A stay, a tour, an experience: its own page or its listing, the same
    // route every card on the site takes (lib/place-href.ts). getContent()
    // has already removed hidden ones.
    const listing = content.recommended.items.find((p) => p.id === id);
    if (listing?.name?.trim()) hit = { href: placeHref(listing), name: listing.name.trim() };

    // A vehicle: only one that is on sale (priced) in a category the owner has
    // switched on — the same two rules that decide whether its page is listed.
    if (!hit) {
      const v = content.fleet.find((f) => f.id === id);
      if (v && isSellableFleetItem(v) && enabled.has(v.category ?? "scooter")) {
        hit = { href: vehicleHref(v), name: vehicleName(v) };
      }
    }

    if (hit && !seen.has(hit.href)) {
      seen.add(hit.href);
      out.push(hit);
    }
  }
  return out;
}
