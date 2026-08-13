import Link from "next/link";
import { Search, PackageSearch } from "lucide-react";
import type { BrowseProductsResult } from "@/lib/marketplace/types";
import { SORT_LABEL, PRODUCT_SORTS } from "@/lib/marketplace/types";
import {
  listingHref, hasActiveFilters, activeFilterCount, type ProductFilters,
} from "@/lib/marketplace/urls";
import MarketProductCard from "./MarketProductCard";
import FilterPanel from "./FilterPanel";
import FilterSheet from "./FilterSheet";
import ListingAnalytics from "./ListingAnalytics";

// ── One listing, two entrances ──────────────────────────────────────────────
//
// /shop/search (free text) and /shop/c/[category] (the SEO surface) are the
// same screen with a different way in, so they share this component. Two
// implementations would drift within a week — the classic version of that bug
// is a filter that exists on one and not the other, which makes the same
// catalogue answer two different questions.
//
// DESKTOP: a persistent sidebar. The filters are the navigation on a wide
// screen and hiding them behind a button wastes the space that makes desktop
// worth using.
// MOBILE: the same panel in a bottom sheet, plus a horizontally scrolling sort
// row. Not a shrunken sidebar — a sidebar at 375px is either a squeezed column
// or a full-screen takeover, and neither is how anyone shops on a phone.

export default function ProductListing({
  base, filters, result, heading, subheading, categoryLocked = false, perPage,
}: {
  /** "/shop/search" or "/shop/c/honey" — the path filters are built onto. */
  base: string;
  filters: ProductFilters;
  result: BrowseProductsResult;
  heading: string;
  subheading?: string | null;
  categoryLocked?: boolean;
  perPage: number;
}) {
  const f = filters;
  const totalPages = Math.max(1, Math.ceil(result.total / perPage));
  const filtering = hasActiveFilters(f, categoryLocked);
  const filterCount = activeFilterCount(f, categoryLocked);

  const panel = (
    <FilterPanel
      base={base}
      filters={f}
      categories={result.categories}
      sellers={result.sellers}
      priceMin={result.priceMin}
      priceMax={result.priceMax}
      categoryLocked={categoryLocked}
    />
  );

  return (
    <div className="mx-auto max-w-6xl">
      <ListingAnalytics
        query={f.q}
        category={f.category}
        resultCount={result.total}
      />

      <h1 className="font-syne text-2xl font-extrabold text-offwhite sm:text-3xl">{heading}</h1>
      {subheading && <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">{subheading}</p>}

      {/* Search stays on the listing, pre-filled: refining a search is far more
          common than starting a new one, and sending people back to the home
          page to type again is how a result set gets abandoned. */}
      <form action={base} method="get" role="search" className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={f.q}
            placeholder="Search products, shops or categories…"
            aria-label="Search products"
            className="w-full rounded-2xl border border-white/10 bg-dark-card py-3 pl-10 pr-4 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
          />
        </div>
        {/* Everything else the shopper had set rides along, so searching inside
            a filtered view keeps the filters. */}
        {!categoryLocked && f.category && <input type="hidden" name="category" value={f.category} />}
        {f.fulfillment && <input type="hidden" name="fulfillment" value={f.fulfillment} />}
        {f.seller && <input type="hidden" name="seller" value={f.seller} />}
        {f.maxPrice !== null && <input type="hidden" name="max" value={f.maxPrice} />}
        {f.inStock && <input type="hidden" name="stock" value="1" />}
        {f.openNow && <input type="hidden" name="open" value="1" />}
        {f.sort !== "recommended" && <input type="hidden" name="sort" value={f.sort} />}
        <button
          type="submit"
          className="rounded-2xl bg-yellow px-5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          Search
        </button>
      </form>

      <div className="mt-6 lg:flex lg:gap-8">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20">
            <div className="mb-4 flex items-center justify-between px-3">
              <span className="font-syne text-sm font-bold text-offwhite">Filter</span>
              {filtering && (
                <Link
                  href={listingHref(base, { ...f, q: f.q }, {
                    category: categoryLocked ? f.category : "",
                    fulfillment: "", seller: "", maxPrice: null, inStock: false, openNow: false,
                  })}
                  className="font-dm text-xs text-yellow hover:underline"
                >
                  Clear all
                </Link>
              )}
            </div>
            {panel}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterSheet activeCount={filterCount}>{panel}</FilterSheet>
            <span className="shrink-0 font-dm text-xs text-muted">
              {result.total} product{result.total === 1 ? "" : "s"}
            </span>
            <span className="ml-auto hidden h-4 w-px shrink-0 bg-white/10 sm:block" />
            {PRODUCT_SORTS.map((s) => (
              <Link
                key={s}
                href={listingHref(base, f, { sort: s })}
                className={`shrink-0 rounded-full border px-3 py-1.5 font-dm text-xs font-medium transition-colors ${
                  f.sort === s
                    ? "border-yellow/60 bg-yellow/15 text-yellow"
                    : "border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite"
                }`}
              >
                {SORT_LABEL[s]}
              </Link>
            ))}
          </div>

          {result.products.length > 0 ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {result.products.map((p, i) => (
                  <MarketProductCard key={p.id} product={p} priority={i < 4} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-4 font-dm text-sm">
                  {f.page > 1 ? (
                    <Link href={listingHref(base, f, { page: f.page - 1 })} className="font-semibold text-yellow hover:underline">
                      ← Previous
                    </Link>
                  ) : (
                    <span className="text-muted/40">← Previous</span>
                  )}
                  <span className="text-muted">Page {f.page} of {totalPages}</span>
                  {f.page < totalPages ? (
                    <Link href={listingHref(base, f, { page: f.page + 1 })} className="font-semibold text-yellow hover:underline">
                      Next →
                    </Link>
                  ) : (
                    <span className="text-muted/40">Next →</span>
                  )}
                </nav>
              )}
            </>
          ) : (
            <NoResults base={base} filters={f} result={result} categoryLocked={categoryLocked} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * An empty result is a place to help, not a place to apologise.
 *
 * It says what was searched, then offers the two things that actually recover
 * the visit: drop the filters (which is usually the real cause), or jump to a
 * category that does have stock. The category list comes from the SAME query,
 * so every suggestion here is guaranteed to have products behind it.
 */
function NoResults({
  base, filters: f, result, categoryLocked,
}: {
  base: string; filters: ProductFilters; result: BrowseProductsResult; categoryLocked: boolean;
}) {
  const filtering = hasActiveFilters(f, categoryLocked);
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-muted">
        <PackageSearch size={22} />
      </span>
      <h2 className="mt-4 font-syne text-lg font-bold text-offwhite">
        {f.q ? <>We couldn&apos;t find &ldquo;{f.q}&rdquo;</> : "Nothing matches those filters"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-sm font-dm text-sm text-muted">
        {filtering
          ? "Try removing a filter — or look through a category that has stock right now."
          : "Nothing is listed here yet. The island's shops are adding products shop by shop."}
      </p>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {filtering && (
          <Link
            href={listingHref(base, f, {
              q: "", category: categoryLocked ? f.category : "",
              fulfillment: "", seller: "", maxPrice: null, inStock: false, openNow: false,
            })}
            className="rounded-xl border border-yellow/50 px-4 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
          >
            Clear filters
          </Link>
        )}
        <Link
          href="/shop"
          className="rounded-xl border border-white/15 px-4 py-2.5 font-dm text-sm font-semibold text-offwhite transition-colors hover:border-white/30"
        >
          Browse everything
        </Link>
      </div>

      {result.categories.length > 0 && (
        <div className="mt-7">
          <p className="font-bebas text-[11px] tracking-[0.28em] text-muted/70">STILL AVAILABLE</p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {result.categories.slice(0, 6).map((c) => (
              <Link
                key={c.slug}
                href={`/shop/c/${c.slug}`}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 font-dm text-xs text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
              >
                {c.name} <span className="text-muted">({c.count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
