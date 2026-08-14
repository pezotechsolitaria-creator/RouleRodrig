import Link from "next/link";
import { Star } from "lucide-react";
import { centsToShortString } from "@/lib/money";
import type { MarketProduct } from "@/lib/marketplace/types";
import ProductImage from "./ProductImage";
import QuickAdd from "./QuickAdd";

// ── The marketplace product card ────────────────────────────────────────────
//
// The object a shopper meets a hundred times, so it is the one worth getting
// exactly right — and the first version got the ORDER wrong. It led with a
// two-line product name and put the price under it in body type, which is how a
// catalogue reads, not how a shop reads.
//
// ── PRICE LEADS ────────────────────────────────────────────────────────────
// Every marketplace this island's visitors already use — Amazon, eBay, Temu —
// resolves the same hierarchy: the picture, then the PRICE at the largest type
// on the card, then the name small underneath. That is not decoration, it is
// the order the questions arrive in. "What is it" is answered by the image
// before any text is read; "can I afford it" is the next question and it should
// not require reading a line of prose to answer.
//
// It is also already this system's own rule: gold marks the price that matters
// (the Gold-Is-Information rule), so a gold price at the top of the card is the
// house style and the reference pattern agreeing.
//
// The SELLER stays, one line, muted, at the bottom. That is the whole
// difference between this and /food, where a kitchen never appears on a grid
// card: on a marketplace, who is selling is part of the decision. It is present
// and it never competes.
//
// ── WHAT IT STILL REFUSES TO SAY ───────────────────────────────────────────
// No star row when nothing has been rated — an empty five-star outline reads as
// "rated zero". No struck-through price unless a shop actually set one. No
// "Only 2 left!" unless 2 is the real stock figure, and no "1,000 sold" at all,
// because this platform does not have that number. Every claim is a column.

const badge =
  "absolute rounded-md px-1.5 py-0.5 font-dm text-[10px] font-bold leading-tight backdrop-blur-sm";

export default function MarketProductCard({
  product, priority = false, showSeller = true,
}: {
  product: MarketProduct;
  priority?: boolean;
  /** Off on a shop's own storefront, where every card has the same seller. */
  showSeller?: boolean;
}) {
  const p = product;
  const buyable = p.inStock && p.acceptingOrders;
  const canQuickAdd = Boolean(buyable && p.quickAdd);
  const rating = p.ratingCount > 0 ? p.ratingAvg : null;
  const discount =
    p.compareAt && p.compareAt > p.minPrice
      ? Math.round(((p.compareAt - p.minPrice) / p.compareAt) * 100)
      : null;
  // Only worth saying when it is genuinely running out. A shop with 40 jars
  // does not need a scarcity badge, and inventing one is the cheapest trick in
  // ecommerce.
  const lowStock = buyable && p.stockTotal > 0 && p.stockTotal <= 3;

  return (
    <Link
      href={`/shop/${p.storeSlug}/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-dark-card transition-colors hover:border-yellow/40 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-white/5">
        <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]">
          <ProductImage
            imageUrl={p.imageUrl}
            name={p.name}
            slug={p.slug}
            categoryName={p.categoryName}
            priority={priority}
          />
        </div>

        {discount !== null && (
          <span className={`${badge} left-1.5 top-1.5 bg-yellow text-dark`}>−{discount}%</span>
        )}
        {!p.inStock ? (
          <span className={`${badge} right-1.5 top-1.5 bg-dark/85 text-muted`}>Sold out</span>
        ) : !p.acceptingOrders ? (
          // The cause is a lapsed subscription. The customer gets the
          // consequence — see lib/shop/plain-words.ts.
          <span className={`${badge} right-1.5 top-1.5 bg-dark/85 text-muted`}>Not selling</span>
        ) : lowStock ? (
          <span className={`${badge} right-1.5 top-1.5 bg-dark/85 text-orange-300`}>
            {p.stockTotal} left
          </span>
        ) : null}

        {canQuickAdd && (
          <div className="absolute bottom-1.5 right-1.5">
            <QuickAdd
              storeId={p.storeId}
              storeName={p.storeName}
              productName={p.name}
              variant={p.quickAdd!}
            />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {/* Price first, and the largest thing in the text block. */}
        <p className="flex flex-wrap items-baseline gap-x-1.5 leading-none">
          <span className="font-syne text-[17px] font-extrabold tracking-tight text-yellow">
            {p.variantCount > 1 && p.minPrice !== p.maxPrice && (
              <span className="font-dm text-[11px] font-medium text-muted">from </span>
            )}
            Rs {centsToShortString(p.minPrice)}
          </span>
          {p.compareAt && p.compareAt > p.minPrice && (
            <span className="font-dm text-[11px] text-muted line-through">
              {centsToShortString(p.compareAt)}
            </span>
          )}
          {p.unit && <span className="font-dm text-[10px] text-muted">/{p.unit}</span>}
        </p>

        <p className="line-clamp-2 font-dm text-[12.5px] leading-snug text-offwhite/85">{p.name}</p>

        {rating !== null && (
          <span className="inline-flex items-center gap-1 font-dm text-[11px] leading-none text-offwhite/75">
            <Star size={10} className="fill-yellow text-yellow" />
            {Number(rating).toFixed(1)}
            <span className="text-muted">({p.ratingCount})</span>
          </span>
        )}

        {showSeller && (
          <span className="mt-auto truncate pt-1 font-dm text-[11px] leading-none text-muted">
            {p.storeName}
          </span>
        )}
      </div>
    </Link>
  );
}
