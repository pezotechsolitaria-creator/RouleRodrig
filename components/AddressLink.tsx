import { MapPin, MapPinOff } from "lucide-react";
import { googleMapsLink, placeSearchLink, hasUsablePin } from "@/lib/orders/location";

// ── An address you can tap ──────────────────────────────────────────────────
//
// The owner, about "Baie aux Huîtres": tapping a shop's address has to show
// where the shop actually IS. Every address on this site was plain grey text —
// a customer deciding whether to collect an order had to copy it out and search
// for it themselves, which on a phone, on an island, is where the decision ends.
//
// One component so that a shop, a restaurant, a seller card and an order page
// all behave identically. It renders an ordinary `<a>` with a real href, so it
// works before JavaScript loads and opens the visitor's own map app on a phone
// — which is the thing they actually want, because the next tap after "where is
// it" is always "take me there".
//
// ── THE TWO CASES, AND WHY THEY MUST LOOK DIFFERENT ────────────────────────
// EXACT (the shop has set lat/lng) → a pin on the doorstep.
// APPROXIMATE (address only)       → a search that lands on the village.
//
// Five of this island's six live shops currently have no pin, so the second
// case is the common one and pretending otherwise would send someone to the
// wrong end of a bay. Same rule as everywhere else in this codebase: never
// state a fact the database does not hold. The distinction is carried in the
// icon, in the accessible name, and — where the difference could waste a
// journey — in one short line the caller opts into with `explain`.
export default function AddressLink({
  address, lat, lng, name, className = "", size = 12, explain = false,
}: {
  address: string | null | undefined;
  lat?: number | null;
  lng?: number | null;
  /** The shop or kitchen. Leads the search when there is no pin. */
  name?: string | null;
  className?: string;
  size?: number;
  /** Adds a short line when the pin is only approximate. For pages where the
   *  customer is deciding whether to travel. */
  explain?: boolean;
}) {
  const text = address?.trim();
  // No address and no pin is nothing to show. An address-less pin is still
  // worth a link — the coordinates are the more precise fact of the two.
  const exact = hasUsablePin(lat, lng);
  if (!text && !exact) return null;

  const href = exact ? googleMapsLink(lat as number, lng as number) : placeSearchLink(name, text!);
  const label = text ?? "Open the map";

  return (
    <span className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={
          exact
            ? `Show ${name ? `${name}, ` : ""}${label} on the map`
            : `Search the map for ${name ? `${name}, ` : ""}${label} — approximate, this ${
                name ? "shop" : "place"
              } has not set an exact pin`
        }
        className="group/addr inline-flex max-w-full items-center gap-1 underline-offset-2 transition-colors hover:text-yellow hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
      >
        {exact ? (
          <MapPin size={size} className="shrink-0 text-yellow/80" />
        ) : (
          // A struck-through pin, because the honest statement is "no pin",
          // not "a pin somewhere near here".
          <MapPinOff size={size} className="shrink-0 opacity-60" />
        )}
        <span className="truncate">{label}</span>
      </a>
      {explain && !exact && (
        <span className="mt-0.5 block text-[11px] leading-snug opacity-70">
          This is the area, not the exact spot — call ahead if you are not sure.
        </span>
      )}
    </span>
  );
}
