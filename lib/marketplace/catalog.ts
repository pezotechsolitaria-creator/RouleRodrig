import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrowseProductsResult, MarketplaceHome, ProductDetail, ProductSort } from "./types";
import { withGalleries } from "@/lib/product-gallery";
import { toProductSort } from "./types";

// Server-side reads for the marketplace.
//
// Same discipline as lib/food/queries.ts: one RPC per screen, no assembly here.
// The moment this layer starts deciding "is it buyable" or "what is the price",
// the database and the UI hold two answers to one question — and the customer
// meets the disagreement at the Add button.

export const PRODUCTS_PER_PAGE = 24;

const EMPTY: BrowseProductsResult = {
  total: 0, limit: PRODUCTS_PER_PAGE, offset: 0,
  deliveryFeeFrom: null, priceMin: null, priceMax: null,
  categories: [], sellers: [], products: [],
};

export type BrowseProductsOptions = {
  q?: string | null;
  category?: string | null;
  fulfillment?: string | null;
  seller?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  inStock?: boolean;
  openNow?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
};

/**
 * The island-wide product catalogue: search, filter, facet counts, one trip.
 *
 * Returns an EMPTY result rather than throwing when the RPC fails, and the
 * caller decides what that means. A listing page can show its error state; a
 * homepage rail must simply not render, because a failed rail is not news the
 * shopper can act on.
 */
export async function browseProducts(
  supabase: SupabaseClient,
  opts: BrowseProductsOptions = {},
): Promise<BrowseProductsResult> {
  const sort: ProductSort = toProductSort(opts.sort);
  const limit = opts.limit ?? PRODUCTS_PER_PAGE;
  const offset = opts.offset ?? 0;

  const { data, error } = await supabase.rpc("browse_products", {
    p_q: opts.q?.trim() || null,
    p_category: opts.category || null,
    p_fulfillment: opts.fulfillment || null,
    p_seller: opts.seller || null,
    p_min_price: opts.minPrice ?? null,
    p_max_price: opts.maxPrice ?? null,
    p_in_stock: opts.inStock ?? false,
    p_open_now: opts.openNow ?? false,
    p_sort: sort,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("browse_products failed", error);
    return { ...EMPTY, limit, offset };
  }
  const result = (data as BrowseProductsResult) ?? { ...EMPTY, limit, offset };
  return { ...result, products: await withGalleries(supabase, result.products) };
}

/** Catalogue size, category counts, the seller strip and what really sells. */
export async function getMarketplaceHome(supabase: SupabaseClient): Promise<MarketplaceHome | null> {
  const { data, error } = await supabase.rpc("marketplace_home");
  if (error) {
    console.error("marketplace_home failed", error);
    return null;
  }
  return (data as MarketplaceHome) ?? null;
}

/**
 * One product page: the product, its variants and photos, the seller's trust
 * facts, its reviews. Null when it does not exist OR must not be shown here —
 * a kitchen's dish, an event's ticket, a draft shop's listing all come back
 * null and the page 404s, which is the same answer a deleted product gives and
 * therefore leaks nothing about which of those it was.
 */
export async function getProductDetail(
  supabase: SupabaseClient,
  storeSlug: string,
  productSlug: string,
): Promise<ProductDetail | null> {
  const { data, error } = await supabase.rpc("product_detail", {
    p_store_slug: storeSlug,
    p_product_slug: productSlug,
  });
  if (error) {
    console.error("product_detail failed", error);
    return null;
  }
  return (data as ProductDetail) ?? null;
}

/**
 * "More like this" — same category, anywhere on the marketplace.
 *
 * Deliberately NOT limited to the same shop. A shopper looking at one producer's
 * honey is well served by seeing another producer's, and a marketplace that
 * hides its own competition is just a shop with extra steps. The current
 * product is filtered out by the caller.
 */
export async function relatedProducts(
  supabase: SupabaseClient,
  opts: { category: string | null; excludeId: string; limit?: number },
): Promise<BrowseProductsResult["products"]> {
  const limit = opts.limit ?? 8;
  const result = await browseProducts(supabase, {
    category: opts.category,
    limit: limit + 1,
    sort: "recommended",
  });
  return result.products.filter((p) => p.id !== opts.excludeId).slice(0, limit);
}

/**
 * The products behind a list of ids, in the order given.
 *
 * Used by the "People are buying" rail and by Buy-again, both of which know
 * WHICH products they want and still must not render one the catalogue would
 * refuse to show. Going through browse_products keeps that guarantee: an
 * archived product, a paused shop or an unsubscribed merchant simply drops out
 * of the result instead of rendering a card that 404s on tap.
 */
export async function productsByIds(
  supabase: SupabaseClient,
  ids: string[],
  limit = 12,
): Promise<BrowseProductsResult["products"]> {
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  // One page big enough to contain them: the catalogue is small and this avoids
  // an id-list RPC whose only job would be to re-derive the same visibility.
  const all = await browseProducts(supabase, { limit: 48, sort: "recommended" });
  const found = all.products.filter((p) => wanted.has(p.id));
  found.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return found.slice(0, limit);
}
