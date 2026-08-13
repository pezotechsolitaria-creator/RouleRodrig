import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { ShopHeader } from "@/components/shop/ShopChrome";
import ProductListing from "@/components/shop/ProductListing";
import { browseProducts, PRODUCTS_PER_PAGE } from "@/lib/marketplace/catalog";
import { readFilters } from "@/lib/marketplace/urls";

// Free-text search results.
//
// Dynamic for the same reason as /shop: every card carries live stock and the
// shop's open/closed state, and a cached result set is wrong exactly when it
// matters. Search pages are also the one surface that must never be indexed —
// an infinite space of query strings is a crawl trap, and Google has said so
// for fifteen years. Categories are the indexable surface (/shop/c/[slug]).
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

  const result = await browseProducts(supabase, {
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
  });

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/shop" backLabel="Marketplace" />
      <ProductListing
        base="/shop/search"
        filters={f}
        result={result}
        perPage={PRODUCTS_PER_PAGE}
        heading={f.q ? `Results for “${f.q}”` : "All products"}
        subheading={
          f.q
            ? null
            : "Everything the island's shops are selling right now — narrow it down on the left."
        }
      />
    </main>
  );
}
