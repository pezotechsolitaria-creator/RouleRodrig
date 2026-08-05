import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Store as StoreIcon, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ProductCard, { type ShopProductCard } from "@/components/shop/ProductCard";
import StoreHoursCard from "@/components/shop/StoreHoursCard";

export const revalidate = 60;

async function getStore(slug: string) {
  const supabase = await createClient();
  // RLS (stores_public_read) already restricts this to active stores whose
  // merchant is approved — a draft/paused/unapproved store 404s here exactly
  // like a deleted one, never leaking existence.
  const { data: store } = await supabase
    .from("stores")
    .select("id, name, slug, tagline, description, logo_url, cover_url, phone, whatsapp")
    .eq("slug", slug)
    .maybeSingle();
  return store;
}

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  if (!store) return {};
  return {
    title: `${store.name} | Roulé Rodrigues Marketplace`,
    description: store.tagline || store.description || `Shop ${store.name} on Roulé Rodrigues.`,
  };
}

export default async function StorePage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  if (!store) notFound();

  const supabase = await createClient();
  // products_public_read already restricts to status='active' + a visible
  // store, so this doesn't need its own status filter beyond store_id.
  // The weekly rules are static enough to cache with the page; the live
  // open/closed verdict is derived in the browser by StoreHoursCard, because
  // this page is ISR (revalidate = 60) and a server-rendered badge would be
  // baked into the cached HTML and wrong right at the opening/closing minute.
  const [{ data: products }, { data: hours }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, product_variants(price, stock_quantity), product_media(url, position)")
      .eq("store_id", store.id)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("store_hours")
      .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed")
      .eq("store_id", store.id)
      .is("date", null)
      .order("weekday"),
  ]);

  const cards: ShopProductCard[] = (products ?? []).map((p) => {
    const variants = (p.product_variants ?? []) as { price: number; stock_quantity: number }[];
    const media = (p.product_media ?? []) as { url: string; position: number }[];
    const cover = media.slice().sort((a, b) => a.position - b.position)[0];
    return {
      slug: p.slug,
      name: p.name,
      minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : 0,
      imageUrl: cover?.url ?? null,
      inStock: variants.some((v) => v.stock_quantity > 0),
    };
  });

  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start gap-4">
          {store.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
              <StoreIcon size={26} />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-syne text-2xl font-extrabold text-offwhite">{store.name}</h1>
            {store.tagline && <p className="mt-0.5 font-dm text-sm text-muted">{store.tagline}</p>}
            {store.phone && (
              <p className="mt-1 flex items-center gap-1.5 font-dm text-xs text-muted">
                <Phone size={12} /> {store.phone}
              </p>
            )}
          </div>
        </div>

        {store.description && (
          <p className="mt-5 max-w-2xl font-dm text-sm leading-relaxed text-muted">{store.description}</p>
        )}

        {(hours ?? []).length > 0 && (
          <div className="mt-5 max-w-md">
            <StoreHoursCard days={hours ?? []} initialStatus={null} />
          </div>
        )}

        <div className="mt-8">
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">PRODUCTS</p>
          {cards.length === 0 ? (
            <p className="mt-3 font-dm text-sm text-muted">This shop hasn&apos;t listed any products yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {cards.map((p) => (
                <ProductCard key={p.slug} storeSlug={store.slug} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
