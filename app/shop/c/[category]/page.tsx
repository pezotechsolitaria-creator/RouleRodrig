import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { ShopHeader } from "@/components/shop/ShopChrome";
import ProductListing from "@/components/shop/ProductListing";
import { browseProducts, PRODUCTS_PER_PAGE } from "@/lib/marketplace/catalog";
import { readFilters } from "@/lib/marketplace/urls";

// ── The indexable half of the listing ───────────────────────────────────────
//
// /shop/search is noindex — an unbounded space of query strings is a crawl trap.
// A CATEGORY is the opposite: a small, stable, human-meaningful set of URLs that
// can genuinely rank for the searches this island should own ("Rodrigues honey",
// "vannerie Rodrigues", "piment Rodrigues"). So categories get real paths, real
// canonicals, real breadcrumbs and an ItemList of what is actually on the page.
//
// Both render the SAME component. The only differences are the URL the filters
// build onto and the fact that here the category is the page rather than a
// filter you can switch off.
export const dynamic = "force-dynamic";

async function loadCategory(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("name, slug, icon")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return data as { name: string; slug: string; icon: string | null } | null;
}

export async function generateMetadata({
  params,
}: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const cat = await loadCategory(category);
  if (!cat) return {};
  const title = `${cat.name} from Rodrigues — buy online | Roulé Rodrigues`;
  const description = `Buy ${cat.name.toLowerCase()} from Rodrigues Island shops and producers. Pick up in person or get it delivered island-wide.`;
  return {
    title,
    description,
    // Its OWN canonical. Inheriting the root layout's would declare every
    // category a duplicate of the homepage, which de-indexes the lot.
    alternates: { canonical: `${SITE_URL}/shop/c/${cat.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/shop/c/${cat.slug}`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function CategoryPage({
  params, searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { category } = await params;
  const cat = await loadCategory(category);
  // A category that does not exist (or was deactivated in admin) is a 404, not
  // an empty grid under a made-up heading.
  if (!cat) notFound();

  // The path is the authority for the category; anything in the query string is
  // ignored, so /shop/c/honey?category=spices cannot show spices under a honey
  // heading and a honey canonical.
  const f = { ...readFilters(await searchParams), category: cat.slug };
  const supabase = await createClient();

  const result = await browseProducts(supabase, {
    q: f.q,
    category: cat.slug,
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
      {result.products.length > 0 && (
        <JsonLd
          data={[
            breadcrumbLd([
              { name: "Home", url: SITE_URL },
              { name: "Marketplace", url: `${SITE_URL}/shop` },
              { name: cat.name, url: `${SITE_URL}/shop/c/${cat.slug}` },
            ]),
            // Built from the SAME products the page renders. Markup describing
            // things that are not on the page is devalued, and can be penalised.
            itemListLd(
              `${cat.name} from Rodrigues`,
              result.products.map((p) => ({
                name: p.name,
                url: `${SITE_URL}/shop/${p.storeSlug}/${p.slug}`,
              })),
            ),
          ]}
        />
      )}
      <ProductListing
        base={`/shop/c/${cat.slug}`}
        filters={f}
        result={result}
        perPage={PRODUCTS_PER_PAGE}
        categoryLocked
        heading={cat.name}
        subheading={`${cat.name} from the island's own shops and producers.`}
      />
    </main>
  );
}
