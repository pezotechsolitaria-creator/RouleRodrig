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
