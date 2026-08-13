import { MapPin, Navigation, Phone, Store } from "lucide-react";

// ── WHERE TO COLLECT ───────────────────────────────────────────────────────
//
// The pickup flow used to name the SELLER and never the PLACE: a customer chose
// "Pick up", paid, received an 8-character code — and was never once shown an
// address. "Ti Kitchen" is not a location, least of all on an island where half
// the collection points have no street number.
//
// So this component exists to be shown at every point where "pick up" is a
// live fact:
//   * at CHECKOUT, before paying — so nobody buys food they cannot reach
//   * on the ORDER page and the guest TRACKING page
//   * beside the pickup code, which is where the customer looks on arrival
//
// ── THE ORDER OF THE THREE FACTS IS DELIBERATE ─────────────────────────────
// 1. the landmark, because it is the direction a local would actually give
// 2. the address, for anyone typing it somewhere
// 3. the pin, as a button — one tap into Maps beats any sentence
//
// It renders NOTHING when there is nothing useful to say. A card headed "Where
// to collect" containing only the shop's name is worse than no card: it looks
// like the answer, and it is not.

export type PickupLocation = {
  storeName?: string | null;
  address?: string | null;
  /** The landmark. Food kitchens set this; shops usually do not. */
  hint?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  /**
   * The seller's WhatsApp, falling back to their phone (M96).
   *
   * Checkout uses it for the one customer M89 left with no route at all: a
   * visitor who cannot make a local bank transfer. Optional, so a seller who
   * has published no number simply gets no button.
   */
  whatsapp?: string | null;
};

/** True when there is at least one fact worth showing beyond the seller's name. */
export function hasPickupLocation(loc: PickupLocation | null | undefined): boolean {
  if (!loc) return false;
  return Boolean(loc.address?.trim() || loc.hint?.trim() || (loc.lat != null && loc.lng != null));
}

export function directionsUrl(lat: number, lng: number): string {
  // `dir_action=navigate` starts turn-by-turn immediately rather than dropping
  // the customer on a map they still have to interpret.
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&dir_action=navigate`;
}

export default function PickupLocationCard({
  location,
  /** Shown above the card. "Where to collect" reads oddly before paying. */
  title = "Where to collect",
  className = "",
}: {
  location: PickupLocation;
  title?: string;
  className?: string;
}) {
  if (!hasPickupLocation(location)) return null;

  const { storeName, address, hint, lat, lng, phone } = location;
  const hasPin = lat != null && lng != null;

  return (
    <div className={`rounded-2xl border border-white/10 bg-dark-card p-4 ${className}`}>
      <p className="flex items-center gap-1.5 font-bebas text-[11px] tracking-[0.25em] text-yellow">
        <MapPin size={13} /> {title.toUpperCase()}
      </p>

      {storeName && (
        <p className="mt-2 flex items-center gap-2 font-syne text-base font-extrabold text-offwhite">
          <Store size={15} className="shrink-0 text-muted" /> {storeName}
        </p>
      )}

      {/* The landmark first — it is the direction a local would give, and on
          this island it is frequently the only one that works. */}
      {hint?.trim() && (
        <p className="mt-1.5 font-dm text-sm leading-relaxed text-offwhite/90">{hint}</p>
      )}

      {address?.trim() && (
        <p className="mt-1 font-dm text-sm leading-relaxed text-muted">{address}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {hasPin && (
          <a
            href={directionsUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-yellow px-4 py-2.5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            <Navigation size={14} /> Get directions
          </a>
        )}
        {phone?.trim() && (
          // A tel: link, because the last hundred metres on this island are
          // solved by a phone call, not by a map.
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 font-dm text-sm font-semibold text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
          >
            <Phone size={14} /> Call them
          </a>
        )}
      </div>

      {!hasPin && (
        <p className="mt-2.5 font-dm text-xs text-muted">
          No map pin set for this address — call ahead if you are not sure.
        </p>
      )}
    </div>
  );
}
