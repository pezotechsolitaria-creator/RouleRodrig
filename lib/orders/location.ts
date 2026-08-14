// GPS is the marketplace's delivery address — see the marketplace business
// rules. These helpers turn a stored lat/lng into the things a merchant or a
// driver actually needs: a map they can navigate from, coordinates they can
// paste, and a message they can forward on WhatsApp.

/** 5 decimal places ~= 1.1 m, plenty for a doorstep and short enough to read aloud. */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function googleMapsLink(lat: number, lng: number): string {
  // `search` (not `dir`) so it opens a pin the viewer can then navigate from
  // with their own chosen start point.
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function openStreetMapLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}

/**
 * A map search for a place that has NOT set its coordinates.
 *
 * Deliberately a different function from googleMapsLink, because it makes a
 * different promise. That one opens a pin on a doorstep; this opens a search
 * and lands wherever the map provider decides. Most shops on this island have
 * an address and no pin, so the real choice is between a search and nothing —
 * and a search for "Baie aux Huîtres, Rodrigues" is what a person would do next
 * anyway.
 *
 * The NAME leads the query: searching for the business resolves to the actual
 * shop far more often than searching the locality alone, and it degrades to the
 * locality when the provider has never heard of the business. Callers must
 * label the result approximate — see components/AddressLink.tsx.
 */
export function placeSearchLink(name: string | null | undefined, address: string): string {
  const trimmedAddress = address.trim();
  // The island name is appended to disambiguate for the geocoder — but only
  // when the ADDRESS does not already carry it. "Mont Lubin, Rodrigues,
  // Rodrigues" reads as a typo and narrows nothing. A shop merely NAMED after
  // the island ("Miel de Rodrigues") still needs the suffix, because a business
  // name is not a place.
  const needsIsland = !/\brodrigues\b/i.test(trimmedAddress);
  const query = [name?.trim(), trimmedAddress, needsIsland ? "Rodrigues" : null]
    .filter((p): p is string => Boolean(p))
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Whether a stored pin is usable at all. */
export function hasUsablePin(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  // 0,0 is the Gulf of Guinea, and the classic "the field defaulted to zero"
  // artefact. Sending a customer there is worse than sending them nowhere.
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Rodrigues sits at roughly 19.66–19.78 S, 63.34–63.51 E.
 *
 * A pin outside this box is nearly always a sign flip (19.7 typed for -19.7) or
 * a swapped pair — the two mistakes anyone typing coordinates into a form
 * actually makes, and both of them silently point at the middle of an ocean.
 *
 * This is a WARNING for the person entering it, never a filter on what
 * customers see: a real shop with an unusual pin must still be findable.
 */
export function looksOffRodrigues(lat: number, lng: number): boolean {
  return lat < -20.1 || lat > -19.3 || lng < 63.0 || lng > 63.8;
}

/**
 * A WhatsApp share link carrying the order reference and both map links.
 * Deliberately includes BOTH providers: drivers on this island don't reliably
 * have Google Maps, and OSM works offline in several popular apps.
 */
export function whatsappShareLink(opts: {
  lat: number;
  lng: number;
  orderNumber: string;
  customerName?: string | null;
  instructions?: string | null;
}): string {
  const lines = [
    `Delivery for order ${opts.orderNumber}`,
    opts.customerName ? `Customer: ${opts.customerName}` : null,
    `Location: ${formatCoords(opts.lat, opts.lng)}`,
    googleMapsLink(opts.lat, opts.lng),
    openStreetMapLink(opts.lat, opts.lng),
    opts.instructions ? `Notes: ${opts.instructions}` : null,
  ].filter(Boolean);
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const FULFILLMENT_LABEL: Record<string, string> = {
  pickup: "Pickup from shop",
  customer_delivery: "Customer arranges delivery",
  rr_delivery: "Roulé Rodrigues delivery",
};
