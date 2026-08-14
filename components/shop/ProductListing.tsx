import Link from "next/link";
import { PackageSearch, ArrowUpDown } from "lucide-react";
import type { BrowseProductsResult, CategoryFacet } from "@/lib/marketplace/types";
import { SORT_LABEL, PRODUCT_SORTS } from "@/lib/marketplace/types";
import {
  listingHref, hasActiveFilters, activeFilterCount, type ProductFilters,
} from "@/lib/marketplace/urls";
import MarketProductCard from "./MarketProductCard";
import CategoryStrip from "./CategoryStrip";
import FilterPanel from "./FilterPanel";
import FilterSheet from "./FilterSheet";
import ListingAnalytics from "./ListingAnalytics";

// ── One listing, two entrances ──────────────────────────────────────────────
//
// /shop/search (free text) and /shop/c/[slug] (the SEO surface) are the same
// screen with a different way in, so they share this component. Two
// implementations would drift within a week, and the classic version of that
// bug is a filter that exists on one and not the other.
//
// ── WHAT CAME OUT ──────────────────────────────────────────────────────────
// A repeated search box (the header carries it now, and it is sticky), a
// subtitle under every heading, and a full-width row of six sort chips. The
// page opened with roughly a third of a phone screen of chrome before the first
// product. It now opens with one heading line, one toolbar row, then the grid.
//
// DESKTOP keeps the persistent sidebar: the filters are the navigation on a wide
// screen and hiding them behind a button wastes the space that makes desktop
// worth using. MOBILE gets the same panel in a bottom sheet — not a shrunken
// sidebar, which at 375px is either a squeezed column or a full-screen takeover.

const GRID = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export default function ProductListing({
  base, filters, result, heading, categoryLocked = false, perPage, categories,
}: {
  /** "/shop/search" or "/shop/c/honey" — the path filters are built onto. */
  base: string;
  filters: ProductFilters;
  result: BrowseProductsResult;
  heading: string;
  categoryLocked?: boolean;
  perPage: number;
  /** The rail, so a shopper can switch shelf without going back. */
  categories?: CategoryFacet[];
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

  const clearAllHref = listingHref(base, f, {
    q: "",
    category: categoryLocked ? f.category : "",
    fulfillment: "", seller: "", maxPrice: null, inStock: false, openNow: false,
  });

  return (
    <div className="mx-auto max-w-7xl">
      <ListingAnalytics query={f.q} category={f.category} resultCount={result.total} />

      {/* Switching shelf without going back is the single most-used move on a
          category page, so the rail travels with it. */}
      {(categories?.length ?? 0) > 0 && (
        <CategoryStrip categories={categories!} activeSlug={categoryLocked ? f.category : undefined} />
      )}

      <h1 className="mt-3 font-syne text-xl font-extrabold text-offwhite sm:text-2xl">{heading}</h1>

      <div className="mt-3 lg:flex lg:gap-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <div className="mb-3 flex items-center justify-between px-3">
              <span className="font-syne text-sm font-bold text-offwhite">Filter</span>
              {filtering && (
                <Link href={clearAllHref} className="font-dm text-xs text-yellow hover:underline">
                  Clear
                </Link>
              )}
            </div>
            {panel}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* One row: how many, how to narrow, how to order. */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterSheet activeCount={filterCount}>{panel}</FilterSheet>
            <span className="shrink-0 font-dm text-xs text-muted">
              {result.total} item{result.total === 1 ? "" : "s"}
            </span>
            <span className="ml-auto hidden shrink-0 items-center gap-1 font-dm text-[11px] text-muted sm:inline-flex">
              <ArrowUpDown size={11} />
            </span>
            {PRODUCT_SORTS.map((s) => (
              <Link
                key={s}
                href={listingHref(base, f, { sort: s })}
                className={`shrink-0 rounded-full border px-2.5 py-1 font-dm text-[11px] font-medium transition-colors ${
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
              <div className={`mt-2 ${GRID}`}>
                {result.products.map((p, i) => (
                  <MarketProductCard key={p.id} product={p} priority={i < 6} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav aria-label="Pagination" className="mt-7 flex items-center justify-center gap-4 font-dm text-sm">
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
            <NoResults base={base} filters={f} result={result} categoryLocked={categoryLocked} clearAllHref={clearAllHref} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * An empty result is a place to help, not a place to apologise.
 *
 * It names what was searched, then offers the two things that actually recover
 * the visit: drop the filters (usually the real cause), or jump to a shelf that
 * does have stock. The categories come from the SAME query, so every suggestion
 * is guaranteed to have products behind it.
 */
function NoResults({
  base, filters: f, result, categoryLocked, clearAllHref,
}: {
  base: string;
  filters: ProductFilters;
  result: BrowseProductsResult;
  categoryLocked: boolean;
  clearAllHref: string;
}) {
  const filtering = hasActiveFilters(f, categoryLocked);
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-dark-card px-6 py-10 text-center">
      <PackageSearch size={22} className="mx-auto text-muted" />
      <h2 className="mt-3 font-syne text-base font-bold text-offwhite">
        {f.q ? <>Nothing for &ldquo;{f.q}&rdquo;</> : "Nothing matches those filters"}
      </h2>
      <p className="mx-auto mt-1 max-w-sm font-dm text-xs text-muted">
        {filtering
          ? "Try removing a filter, or open a shelf that has stock right now."
          : "Nothing is listed here yet."}
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtering && (
          <Link
            href={clearAllHref}
            className="rounded-lg border border-yellow/50 px-3.5 py-2 font-dm text-xs font-bold text-yellow transition-colors hover:bg-yellow/10"
          >
            Clear filters
          </Link>
        )}
        <Link
          href="/shop"
          className="rounded-lg border border-white/15 px-3.5 py-2 font-dm text-xs font-semibold text-offwhite transition-colors hover:border-white/30"
        >
          Browse everything
        </Link>
      </div>

      {result.categories.length > 0 && (
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {result.categories.slice(0, 6).map((c) => (
            <Link
              key={c.slug}
              href={`/shop/c/${c.slug}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-dm text-[11px] text-offwhite transition-colors hover:border-yellow/40 hover:text-yellow"
            >
              {c.name} <span className="text-muted">{c.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
