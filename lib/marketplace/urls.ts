import { PRODUCT_SORTS, FULFILMENT_FILTERS, type ProductSort } from "./types";

// ── The URL IS the filter state ─────────────────────────────────────────────
//
// Every control on a listing page is a plain link or a GET form, so a filtered
// view is shareable, survives a refresh and the back button, and works before
// any JavaScript has loaded — which on an island connection is most of the time
// a page is first seen. That is the same decision /shop and /food already made;
// this module is where the URL is built so the two listing surfaces (search and
// category) cannot drift into different query parameters.
//
// It is pure and tested. A filter that silently drops another filter is the
// classic bug here — clicking a category and losing the "in stock" you set two
// taps ago — and it is invisible in review.

export type ProductFilters = {
  q: string;
  category: string;
  fulfillment: string;
  seller: string;
  maxPrice: number | null;
  inStock: boolean;
  openNow: boolean;
  sort: ProductSort;
  page: number;
};

export const EMPTY_FILTERS: ProductFilters = {
  q: "", category: "", fulfillment: "", seller: "",
  maxPrice: null, inStock: false, openNow: false,
  sort: "recommended", page: 1,
};

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

/** Read filters out of an untrusted search-params bag. Nothing here throws. */
export function readFilters(sp: Record<string, string | string[] | undefined>): ProductFilters {
  const rawMax = parseInt(first(sp.max), 10);
  return {
    q: first(sp.q).slice(0, 100),
    category: first(sp.category).slice(0, 60).toLowerCase(),
    fulfillment: (FULFILMENT_FILTERS as readonly string[]).includes(first(sp.fulfillment))
      ? first(sp.fulfillment)
      : "",
    seller: first(sp.seller).slice(0, 80).toLowerCase(),
    // Prices are integer cents. A negative or absurd ceiling is dropped rather
    // than clamped, because a silently-changed filter is worse than none.
    maxPrice: Number.isFinite(rawMax) && rawMax > 0 && rawMax <= 100_000_000 ? rawMax : null,
    inStock: first(sp.stock) === "1",
    openNow: first(sp.open) === "1",
    sort: (PRODUCT_SORTS as readonly string[]).includes(first(sp.sort))
      ? (first(sp.sort) as ProductSort)
      : "recommended",
    page: Math.max(1, Math.min(50, parseInt(first(sp.page), 10) || 1)),
  };
}

/**
 * A listing URL with one or more filters changed.
 *
 * `page` resets to 1 on ANY other change — staying on page 4 of a result set
 * that just became 6 items long shows an empty page and reads as a broken site.
 * Pass `page` explicitly to paginate.
 */
export function listingHref(
  base: string,
  f: ProductFilters,
  overrides: Partial<ProductFilters> = {},
): string {
  const changesFilter = Object.keys(overrides).some((k) => k !== "page");
  const merged: ProductFilters = { ...f, ...(changesFilter ? { page: 1 } : {}), ...overrides };

  const p = new URLSearchParams();
  if (merged.q) p.set("q", merged.q);
  // A category page carries its category in the PATH, so repeating it in the
  // query string would put the same fact in two places that can disagree.
  if (merged.category && !base.startsWith("/shop/c/")) p.set("category", merged.category);
  if (merged.fulfillment) p.set("fulfillment", merged.fulfillment);
  if (merged.seller) p.set("seller", merged.seller);
  if (merged.maxPrice !== null) p.set("max", String(merged.maxPrice));
  if (merged.inStock) p.set("stock", "1");
  if (merged.openNow) p.set("open", "1");
  if (merged.sort !== "recommended") p.set("sort", merged.sort);
  if (merged.page > 1) p.set("page", String(merged.page));

  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Whether anything is narrowing the catalogue — drives the "Clear all" link. */
export function hasActiveFilters(f: ProductFilters, ignoreCategory = false): boolean {
  return Boolean(
    f.q ||
      (!ignoreCategory && f.category) ||
      f.fulfillment ||
      f.seller ||
      f.maxPrice !== null ||
      f.inStock ||
      f.openNow,
  );
}

/** How many filters are on, for the mobile "Filters (2)" button. */
export function activeFilterCount(f: ProductFilters, ignoreCategory = false): number {
  let n = 0;
  if (!ignoreCategory && f.category) n++;
  if (f.fulfillment) n++;
  if (f.seller) n++;
  if (f.maxPrice !== null) n++;
  if (f.inStock) n++;
  if (f.openNow) n++;
  return n;
}
