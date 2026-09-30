import type { RecommendedPlace } from "@/lib/defaults";
import { GUIDE_FOR_PLACE, placePrice } from "@/lib/place-detail";
import { placeHref } from "@/lib/place-href";

// ── THE ÎLE AUX COCOS GUIDES QUOTE THE LISTING, NOT A NUMBER TYPED ONCE ─────
//
// SEO audit 2026-09-29 C1(3)/C12. /guide/ile-aux-cocos said "Rs 2,000 per
// person" and /fr/ile-aux-cocos "Rs 2 000", while the listing — the thing a
// customer actually books — said "Rs 1999/Person". Two figures on one domain,
// and the one in the guide was wrong. Both "See the excursion" buttons also led
// to /browse/tours, a shelf, instead of the excursion's own priced page.
//
// So the listing is looked up the way PlaceDetail finds its guide, in reverse:
// the place whose GUIDE_FOR_PLACE is this guide. The price is placePrice() —
// the owner's note first, the deposit never mistaken for it — and the link is
// placeHref(), which every card on the site uses. No listing, no price: the
// guides then say nothing about a figure rather than keep an old one.

export const ILE_AUX_COCOS_GUIDE = "/guide/ile-aux-cocos";

/** Where the buttons went before, and still go if the listing disappears. */
const FALLBACK_HREF = "/browse/tours";

export type CocosBooking = {
  /** The listing's own name, verbatim — it carries the operator. */
  name: string | null;
  href: string;
  /** Whole rupees, or null when the listing states none. */
  price: number | null;
  /** The owner's note prices it per person ("Rs 1999/Person"). */
  perPerson: boolean;
};

export function ileAuxCocosBooking(items: RecommendedPlace[]): CocosBooking {
  const listing = (items ?? []).find(
    (p) => Boolean(p.name?.trim()) && GUIDE_FOR_PLACE(p)?.href === ILE_AUX_COCOS_GUIDE,
  );
  if (!listing) return { name: null, href: FALLBACK_HREF, price: null, perPerson: false };
  return {
    name: listing.name.trim(),
    href: placeHref(listing),
    price: placePrice(listing),
    perPerson: /person|personne|\bpp\b|\bpax\b/i.test(listing.priceNote ?? ""),
  };
}
