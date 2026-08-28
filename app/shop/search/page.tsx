import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import MarketHeader from "@/components/shop/MarketHeader";
import ProductListing from "@/components/shop/ProductListing";
import { T, TName } from "@/components/shop/ShopCopy";
import { browseProducts, getMarketplaceHome, PRODUCTS_PER_PAGE } from "@/lib/marketplace/catalog";
import { readFilters } from "@/lib/marketplace/urls";

// Free-text search results.
//
// Dynamic for the same reason as /shop: every card carries live stock and the
// shop's open/closed state, and a cached result set is wrong exactly when it
// matters. Search pages are also the one surface that must never be indexed —
// an unbounded space of query strings is a crawl trap. Categories are the
// indexable surface (/shop/c/[slug]).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search the Rodrigues Marketplace | Roulé Rodrigues",
  description: "Search products from Rodrigues Island shops and producers.",
  alternates: { canonical: `${SITE_URL}/shop/search` },
  robots: { index: false, follow: true },
};

export default async function MarketplaceSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = readFilters(await searchParams);
  const supabase = await createClient();

  const [result, home] = await Promise.all([
    browseProducts(supabase, {
      q: f.q,
      category: f.category,
      fulfillment: f.fulfillment,
      seller: f.seller,
      maxPrice: f.maxPrice,
      inStock: f.inStock,
      openNow: f.openNow,
      sort: f.sort,
      limit: PRODUCTS_PER_PAGE,
      offset: (f.page - 1) * PRODUCTS_PER_PAGE,
    }),
    // The rail, so a shopper whose search found nothing can still tap a shelf.
    getMarketplaceHome(supabase),
  ]);

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <MarketHeader back={{ href: "/shop", label: "the marketplace", labelKey: "marketplace" }} defaultQuery={f.q} />
      <ProductListing
        base="/shop/search"
        filters={f}
        result={result}
        perPage={PRODUCTS_PER_PAGE}
        categories={home?.categories ?? []}
        heading={f.q ? <TName k="listing.query" v={f.q} /> : <T k="listing.allProducts" />}
      />
    </main>
  );
}
