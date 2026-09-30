import type { SiteContent } from "@/lib/defaults";
import type { HubLink } from "@/lib/nav/hubs";
import { fleetFromPrice, isSellableFleetItem } from "@/lib/site-data";
import { fromPriceOf } from "@/lib/experiences";

// ── A "FROM" PRICE, OR NONE (SEO audit 2026-09-29 C1, C8) ───────────────────
//
// The /fr hub and /llms.txt both lead lines with "from Rs …", and both used to
// type the figure: the hub's car "dès" price sat four hundred rupees under the
// fleet's, and llms.txt was a static file that could not read the fleet at all.
// They now ask this, which reads through the same helpers the landing pages
// use for their own <h1> —
// fleetFromPrice() for vehicles, fromPriceOf() (placePrice) for stays — so a
// hub, a landing page and llms.txt cannot quote three numbers for one thing.
//
// Null when there is nothing sellable to measure. fleetFromPrice() would answer
// its FLEET_PRICE_FALLBACK then, and a fallback is not a price anybody is
// charged; the caller prints no number instead.

export type PricedFrom = "scooter" | "car" | "stays";

/**
 * The stays a visitor can see: hotel rows with a name (SEO audit 2026-09-29
 * T2). /browse/stays (isNamed) and /fr/hebergement-rodrigues (staysOf) already
 * skip a nameless row, which renders nowhere; the /fr hub and llms.txt read
 * their "from" price here, and without the same rule a blank draft row priced
 * below every real stay would become the price they quote and no page honours.
 */
export function namedStays<T extends { category?: string | null; name?: string | null }>(items: T[]): T[] {
  return items.filter((p) => p.category === "hotel" && Boolean(p.name?.trim()));
}

export function liveFromPrice(
  content: Pick<SiteContent, "fleet" | "recommended">,
  from: PricedFrom,
): number | null {
  if (from === "stays") {
    return fromPriceOf(namedStays(content.recommended.items));
  }
  const sellable = content.fleet.some(
    (f) => (f.category ?? "scooter") === from && isSellableFleetItem(f),
  );
  return sellable ? fleetFromPrice(content.fleet, from) : null;
}

/**
 * A hub line (lib/nav/hubs.ts) led by its live "from" price, or its price-free
 * blurb when there is nothing to measure. One function, so the /fr hub and
 * /llms.txt print the same sentence; `format` is only how each writes money.
 */
export function hubBlurb(
  content: Pick<SiteContent, "fleet" | "recommended">,
  p: Pick<HubLink, "blurb" | "priced">,
  format: (rupees: number) => string,
): string {
  const n = p.priced ? liveFromPrice(content, p.priced.from) : null;
  return p.priced && n ? p.priced.blurb(format(n)) : p.blurb;
}
