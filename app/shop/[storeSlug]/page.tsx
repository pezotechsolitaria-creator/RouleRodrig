import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Store as StoreIcon, Phone, MapPin } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import ProductCard, { type ShopProductCard } from "@/components/shop/ProductCard";
import StoreHoursCard from "@/components/shop/StoreHoursCard";
import CategoryRail from "@/components/shop/CategoryRail";
import StarRating from "@/components/shop/StarRating";
import { ShopHeader } from "@/components/shop/ShopChrome";
import JsonLd from "@/components/JsonLd";
import { storeLd, breadcrumbLd } from "@/lib/schema";

type StoreReview = {
  id: string;
  rating: number;
  body: string | null;
  createdAt: string;
  author: string | null;
};

export const revalidate = 60;

async function getStore(slug: string) {
  const supabase = await createClient();
  // RLS (stores_public_read) already restricts this to active stores whose
  // merchant is approved — a draft/paused/unapproved store 404s here exactly
  // like a deleted one, never leaking existence.
  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, tagline, description, logo_url, cover_url, address, phone, whatsapp, rating_avg, rating_count")
    .eq("slug", slug)
    .maybeSingle();
  if (!store) return null;

  // A kitchen is not a shop (M50). browse_stores() already excludes kitchens
  // from the directory, but the directory is not the only way in — a slug typed,
  // linked or indexed would still render a storefront full of dishes with a
  // shop's chrome, priced and addable outside the food surface that owns their
  // availability rules. The exclusion has to hold on the page too, exactly as
  // M42 had to for events.
  const { data: kitchen } = await supabase
    .from("food_kitchens")
    .select("store_id")
    .eq("store_id", store.id)
    .maybeSingle();
  if (kitchen) return null;

  return store;
}

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  if (!store) return {};
  const description = store.tagline || store.description || `Shop ${store.name} on Roulé Rodrigues.`;
  const url = `${SITE_URL}/shop/${store.slug}`;
  return {
    title: `${store.name} | Roulé Rodrigues Marketplace`,
    description,
    // Its OWN canonical. Without this the root layout's canonical was inherited,
    // so every storefront declared itself a duplicate of the homepage — which
    // de-indexes the entire marketplace.
    alternates: { canonical: url },
    openGraph: {
      title: store.name,
      description,
      url,
      type: "website",
      images: [store.cover_url || store.logo_url || `${SITE_URL}/og-image.jpg`],
    },
  };
}

const slugify = (s: string) => `cat-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

export default async function StorePage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  if (!store) notFound();

  const supabase = await createClient();
  // products_public_read already restricts to status='active' + a visible
  // store. The weekly hour rules are static enough to cache with the page;
  // the live open/closed verdict is derived in the browser by StoreHoursCard,
  // because this page is ISR (revalidate = 60) and a server-rendered badge
  // would be baked into the cached HTML and wrong right at the opening minute.
  const [{ data: products }, { data: hours }, { data: reviewData }] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, categories(name), " +
          "product_variants(id, name, price, stock_quantity, is_active), product_media(url, position)",
      )
      .eq("store_id", store.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("store_hours")
      .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed")
      .eq("store_id", store.id)
      .is("date", null)
      .order("weekday"),
    // Through the RPC, not a table read: the reviewer's name is derived from
    // the order inside the function, so nothing here needs SELECT on
    // orders.customer_name (M29).
    supabase.rpc("store_reviews", { p_store_id: store.id, p_limit: 8 }),
  ]);

  const reviews = ((reviewData as StoreReview[] | null) ?? []).filter((r) => r.body);

  type ProductRow = {
    id: string; name: string; slug: string;
    categories: { name: string } | { name: string }[] | null;
    product_variants: { id: string; name: string | null; price: number; stock_quantity: number; is_active: boolean }[];
    product_media: { url: string; position: number }[];
  };

  const cards: (ShopProductCard & { category: string })[] = ((products ?? []) as unknown as ProductRow[]).map((p) => {
    const variants = (p.product_variants ?? []).filter((v) => v.is_active);
    const media = (p.product_media ?? []).slice().sort((a, b) => a.position - b.position);
    const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    // Quick-add can only serve a product whose variant choice is already made
    // for you — exactly one purchasable variant. Everything else routes
    // through the product page, where the option picker lives.
    const only = variants.length === 1 ? variants[0] : null;
    return {
      slug: p.slug,
      name: p.name,
      minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : 0,
      imageUrl: media[0]?.url ?? null,
      inStock: variants.some((v) => v.stock_quantity > 0),
      quickAddVariant: only && only.stock_quantity > 0
        ? { id: only.id, price: only.price, stockQuantity: only.stock_quantity }
        : null,
      variantCount: variants.length,
      category: cat?.name ?? "More",
    };
  });

  // Group into category sections, "More" always last — the store page reads
  // as a menu with a jump rail, not one undifferentiated grid.
  const sections = [...new Set(cards.map((c) => c.category))]
    .sort((a, b) => (a === "More" ? 1 : b === "More" ? -1 : a.localeCompare(b)))
    .map((name) => ({ id: slugify(name), name, items: cards.filter((c) => c.category === name) }));

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      {/* Structured data. Every other page on this site emits JSON-LD and the
          marketplace was the one exception — these shops had a title and a
          canonical but were, to a crawler, anonymous pages. `Store` plus its
          offer catalogue is what makes a shop eligible to appear as a business
          rather than as a generic result.

          Built from the SAME `cards` the page renders below, deliberately:
          Google devalues (and can penalise) markup describing content that is
          not on the page, so the catalogue can never drift from what a visitor
          actually sees. The rating is passed through only when real reviews
          exist — storeLd drops it otherwise. */}
      <JsonLd
        data={[
          storeLd({
            name: store.name,
            slug: store.slug,
            description: store.tagline || store.description,
            image: store.cover_url || store.logo_url,
            address: store.address,
            phone: store.phone,
            rating:
              store.rating_count > 0 && store.rating_avg !== null
                ? { avg: Number(store.rating_avg), count: store.rating_count }
                : null,
            products: cards.slice(0, 30).map((c) => ({
              name: c.name,
              url: `${SITE_URL}/shop/${store.slug}/${c.slug}`,
              price: c.minPrice || undefined,
              image: c.imageUrl,
            })),
          }),
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Shops", url: `${SITE_URL}/shop` },
            { name: store.name, url: `${SITE_URL}/shop/${store.slug}` },
          ]),
        ]}
      />
      <ShopHeader backHref="/shop" backLabel="All shops" />

      <div className="mx-auto max-w-4xl">
        {/* Cover — the shop's own photography leads, exactly like the store
            pages travelers already know; the logo overlaps its lower edge. */}
        <div className="relative">
          <div className="h-36 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-yellow/10 to-transparent sm:h-52">
            {store.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.cover_url} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="absolute -bottom-7 left-4">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover ring-4 ring-dark" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-4 ring-dark">
                <StoreIcon size={26} />
              </span>
            )}
          </div>
        </div>

        <div className="mt-10">
          <h1 className="font-syne text-2xl font-extrabold text-offwhite">{store.name}</h1>
          {store.tagline && <p className="mt-0.5 font-dm text-sm text-muted">{store.tagline}</p>}
          {store.rating_count > 0 && store.rating_avg !== null ? (
            <a href="#reviews" className="mt-1.5 inline-flex items-center gap-2 font-dm text-sm text-offwhite hover:text-yellow">
              <StarRating value={Number(store.rating_avg)} />
              {Number(store.rating_avg).toFixed(1)}
              <span className="text-muted">
                ({store.rating_count} review{store.rating_count === 1 ? "" : "s"})
              </span>
            </a>
          ) : (
            // Honest instead of blank. "No reviews yet" tells a visitor the
            // shop is new, not that the site forgot to load something — and it
            // says who is allowed to change that.
            <p className="mt-1.5 font-dm text-xs text-muted">No reviews yet — buyers can rate after collecting an order.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-dm text-xs text-muted">
            {store.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={12} /> {store.phone}
              </span>
            )}
            {store.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={12} /> {store.address}
              </span>
            )}
          </div>
        </div>

        {store.description && (
          <p className="mt-4 max-w-2xl font-dm text-sm leading-relaxed text-muted">{store.description}</p>
        )}

        {(hours ?? []).length > 0 && (
          <div className="mt-5 max-w-md">
            <StoreHoursCard days={hours ?? []} initialStatus={null} />
          </div>
        )}
      </div>

      <div className="mt-6">
        <CategoryRail sections={sections.map(({ id, name }) => ({ id, name }))} />
      </div>

      <div className="mx-auto max-w-4xl">
        {cards.length === 0 ? (
          <p className="mt-6 font-dm text-sm text-muted">This shop hasn&apos;t listed any products yet.</p>
        ) : (
          sections.map((section) => (
            <section key={section.id} id={section.id} className="mt-8 scroll-mt-32">
              {sections.length > 1 && (
                <h2 className="font-syne text-lg font-bold text-offwhite">{section.name}</h2>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {section.items.map((p) => (
                  <ProductCard
                    key={p.slug}
                    storeSlug={store.slug}
                    storeId={store.id}
                    storeName={store.name}
                    product={p}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {/* Only reviews with words get a card — a wall of "★★★★★" with no text
            adds nothing the average above has not already said. The COUNT
            still reflects every rating, including the silent ones. */}
        {reviews.length > 0 && (
          <section id="reviews" className="mt-10 scroll-mt-32">
            <h2 className="font-syne text-lg font-bold text-offwhite">What buyers say</h2>
            <p className="mt-1 font-dm text-xs text-muted">
              Every review here comes from a collected order at this shop.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {reviews.map((r) => (
                <figure key={r.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                  <StarRating value={r.rating} size={13} />
                  <blockquote className="mt-2 font-dm text-sm leading-relaxed text-offwhite/90">{r.body}</blockquote>
                  <figcaption className="mt-2 font-dm text-xs text-muted">
                    {r.author ?? "Verified buyer"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
