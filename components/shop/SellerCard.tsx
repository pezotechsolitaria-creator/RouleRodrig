import Link from "next/link";
import { Store as StoreIcon, PackageCheck, CalendarClock, ChevronRight } from "lucide-react";
import type { ProductSeller } from "@/lib/marketplace/types";
import StarRating from "./StarRating";
import AddressLink from "@/components/AddressLink";

// ── The trust block ─────────────────────────────────────────────────────────
//
// The single biggest thing separating a marketplace from a shop: before paying
// a stranger, a buyer wants to know who the stranger is. /food never shows this
// — a kitchen is metadata there — and here it is part of the purchase.
//
// ── EVERY LINE IS A COLUMN, NOT A CLAIM ────────────────────────────────────
// Rating and review count come from `stores.rating_*`, maintained by trigger
// from reviews written against COLLECTED orders. "Orders completed" counts
// orders that actually reached `collected`. "On the marketplace since" is the
// row's own created_at. There is no "Verified seller" badge, no "responds in
// 2 hours", no "trusted" — none of those are things this database knows, and
// inventing a trust signal is worse than showing none, because a buyer who
// later discovers it was decoration stops believing the real ones too.
//
// A shop with no history says so plainly. "New shop" is information; a blank
// space is a page that failed to load.
export default function SellerCard({
  seller, showLink = true,
}: {
  seller: ProductSeller;
  showLink?: boolean;
}) {
  const since = new Date(seller.createdAt);
  const sinceLabel = Number.isNaN(since.getTime())
    ? null
    : since.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const rated = seller.ratingCount > 0 && seller.ratingAvg !== null;

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
      <p className="font-bebas text-[11px] tracking-[0.28em] text-muted/70">SOLD BY</p>

      <div className="mt-2 flex items-center gap-3">
        {seller.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={seller.logoUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
            <StoreIcon size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-syne text-base font-bold text-offwhite">{seller.name}</p>
          {rated ? (
            <span className="mt-0.5 flex items-center gap-1.5 font-dm text-xs text-offwhite/85">
              <StarRating value={Number(seller.ratingAvg)} size={12} />
              {Number(seller.ratingAvg).toFixed(1)}
              <span className="text-muted">
                ({seller.ratingCount} review{seller.ratingCount === 1 ? "" : "s"})
              </span>
            </span>
          ) : (
            <span className="mt-0.5 block font-dm text-xs text-muted">
              No reviews yet — buyers can rate after collecting an order.
            </span>
          )}
        </div>
      </div>

      {seller.tagline && (
        <p className="mt-3 font-dm text-sm leading-relaxed text-muted">{seller.tagline}</p>
      )}

      <dl className="mt-3 space-y-1.5 font-dm text-xs text-muted">
        {/* Tappable: this is the surface where someone decides whether to go
            and collect, so "where is it" has to be one tap, not a copy-paste
            into another app. `explain` because the answer changes a journey. */}
        {(seller.address || (seller.lat != null && seller.lng != null)) && (
          <dd>
            <AddressLink
              address={seller.address}
              lat={seller.lat}
              lng={seller.lng}
              name={seller.name}
              explain
            />
          </dd>
        )}
        {seller.completedOrders > 0 && (
          <div className="flex items-center gap-2">
            <PackageCheck size={12} className="shrink-0 text-muted/70" />
            <dd>
              {seller.completedOrders} order{seller.completedOrders === 1 ? "" : "s"} completed through
              Roulé Rodrigues
            </dd>
          </div>
        )}
        {sinceLabel && (
          <div className="flex items-center gap-2">
            <CalendarClock size={12} className="shrink-0 text-muted/70" />
            <dd>On the marketplace since {sinceLabel}</dd>
          </div>
        )}
      </dl>

      {showLink && (
        <Link
          href={`/shop/${seller.slug}`}
          className="mt-4 flex items-center justify-between rounded-xl border border-white/10 px-3.5 py-2.5 font-dm text-sm font-semibold text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
        >
          See all {seller.productCount} product{seller.productCount === 1 ? "" : "s"}
          <ChevronRight size={15} />
        </Link>
      )}
    </div>
  );
}
