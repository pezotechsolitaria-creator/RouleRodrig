import Link from "next/link";
import { Star, Store as StoreIcon } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";
import type { MarketProduct } from "@/lib/marketplace/types";
import ProductImage from "./ProductImage";
import QuickAdd from "./QuickAdd";

// ── The marketplace product card ────────────────────────────────────────────
//
// The single most important object in the redesign, because it is the one a
// shopper sees a hundred times and a product page maybe twice.
//
// ── THE HIERARCHY, AND WHY IT IS NOT FOOD'S ────────────────────────────────
// A dish card answers "do I want to eat this". A product card answers a longer
// question — "what is it, what does it cost, can I get it, and WHO am I buying
// from" — because on a marketplace the seller is part of the purchase decision
// and on a food platform the kitchen is not. So, in order:
//
//   1. the picture (or the plate that stands in for it)
//   2. the name
//   3. the price
//   4. whether it can be bought at all
//   5. the seller
//   6. how it reaches you
//   7. a rating, when one genuinely exists
//   8. one tap to add
//
// The seller sits UNDER the price in muted type: present on every card, never
// competing with the product. That is the whole difference between this and the
// shop directory this page replaced.
//
// ── WHAT IT REFUSES TO SAY ─────────────────────────────────────────────────
// No star row when nothing has been rated (an empty five-star outline reads as
// "rated zero"). No struck-through price unless a shop actually set one. No
// "only 2 left!" unless the number is the real stock figure. Every claim here
// is a column, not a flourish.

const chip = "rounded-full bg-dark/85 px-2 py-0.5 font-dm text-[10px] font-medium backdrop-blur-sm";

export default function MarketProductCard({
  product, priority = false, showSeller = true,
}: {
  product: MarketProduct;
  priority?: boolean;
  /** Off on a shop's own storefront, where every card has the same seller. */
  showSeller?: boolean;
}) {
  const p = product;
  const href = `/shop/${p.storeSlug}/${p.slug}`;
  const buyable = p.inStock && p.acceptingOrders;
  const canQuickAdd = Boolean(buyable && p.quickAdd);
  const rating = p.ratingCount > 0 ? p.ratingAvg : null;
  const discount =
    p.compareAt && p.compareAt > p.minPrice
      ? Math.round(((p.compareAt - p.minPrice) / p.compareAt) * 100)
      : null;
  // Only worth saying when it is actually running out. A shop with 40 jars does
  // not need a scarcity badge, and inventing one is the cheapest trick in
  // ecommerce.
  const lowStock = buyable && p.stockTotal > 0 && p.stockTotal <= 3;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-dark-card transition-all hover:border-yellow/30 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-white/5">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-105">
          <ProductImage
            imageUrl={p.imageUrl}
            name={p.name}
            slug={p.slug}
            categoryName={p.categoryName}
            priority={priority}
          />
        </div>

        {discount !== null && (
          <span className={`absolute left-2 top-2 ${chip} bg-yellow text-dark`}>−{discount}%</span>
        )}
        {!p.inStock ? (
          <span className={`absolute right-2 top-2 ${chip} text-muted`}>Sold out</span>
        ) : !p.acceptingOrders ? (
          // The cause is a lapsed subscription. The customer gets the
          // consequence — see lib/shop/plain-words.ts.
          <span className={`absolute right-2 top-2 ${chip} text-muted`}>Not selling online</span>
        ) : lowStock ? (
          <span className={`absolute right-2 top-2 ${chip} text-orange-300`}>
            {p.stockTotal} left
          </span>
        ) : null}

        {canQuickAdd && (
          <div className="absolute bottom-2 right-2">
            <QuickAdd
              storeId={p.storeId}
              storeName={p.storeName}
              productName={p.name}
              variant={p.quickAdd!}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        {/* Two lines, then ellipsis: a long name must not push the price out of
            the card, and truncating to one line loses the distinguishing word
            on names like "Miel de Rodrigues — Grand pot". */}
        <p className="line-clamp-2 font-dm text-sm font-medium leading-snug text-offwhite">{p.name}</p>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-syne text-base font-extrabold text-yellow">
            {p.variantCount > 1 && p.minPrice !== p.maxPrice && (
              <span className="font-dm text-xs font-medium text-muted">from </span>
            )}
            Rs {centsToDecimalString(p.minPrice)}
          </span>
          {p.unit && <span className="font-dm text-[11px] text-muted">/ {p.unit}</span>}
          {p.compareAt && p.compareAt > p.minPrice && (
            <span className="font-dm text-[11px] text-muted line-through">
              Rs {centsToDecimalString(p.compareAt)}
            </span>
          )}
        </div>

        {rating !== null && (
          <span className="mt-1 inline-flex items-center gap-1 font-dm text-[11px] text-offwhite/80">
            <Star size={11} className="fill-yellow text-yellow" />
            {Number(rating).toFixed(1)}
            <span className="text-muted">({p.ratingCount})</span>
          </span>
        )}

        {/* The seller. Muted, one line, always present — this is a marketplace. */}
        {showSeller && (
          <span className="mt-auto flex min-w-0 items-center gap-1.5 pt-2 font-dm text-[11px] text-muted">
            {p.storeLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.storeLogo} alt="" loading="lazy" className="h-4 w-4 shrink-0 rounded object-cover" />
            ) : (
              <StoreIcon size={11} className="shrink-0 opacity-70" />
            )}
            <span className="truncate">{p.storeName}</span>
            {p.storeRatingCount > 0 && p.storeRatingAvg !== null && (
              <span className="shrink-0 text-muted/70">· {Number(p.storeRatingAvg).toFixed(1)}★</span>
            )}
          </span>
        )}
      </div>
    </Link>
  );
}
