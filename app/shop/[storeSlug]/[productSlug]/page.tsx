import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Truck, Store as StoreIcon, Handshake, ShieldCheck, Star } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { centsToDecimalString, centsToShortString } from "@/lib/money";
import { breadcrumbLd, marketplaceProductLd } from "@/lib/schema";
import { statusWords, FULFILMENT } from "@/lib/shop/plain-words";
import JsonLd from "@/components/JsonLd";
import AddToCartForm, { type CartableVariant } from "@/components/shop/AddToCartForm";
import ProductGallery from "@/components/shop/ProductGallery";
import SellerCard from "@/components/shop/SellerCard";
import MarketProductCard from "@/components/shop/MarketProductCard";
import StarRating from "@/components/shop/StarRating";
import SaveButton from "@/components/shop/SaveButton";
import AddressLink from "@/components/AddressLink";
import ProductAnalytics from "@/components/shop/ProductAnalytics";
import MarketHeader from "@/components/shop/MarketHeader";
import { getProductDetail, relatedProducts } from "@/lib/marketplace/catalog";

// ── The product page ────────────────────────────────────────────────────────
//
// This page used to be an image, a name, a paragraph and an Add button. It said
// nothing about who was selling, how you would get it, whether it was in stock,
// or what anyone thought of it — every question a person asks in the last ten
// seconds before spending money.
//
// It is now the strongest page in the marketplace, and the order of it is the
// order the questions arrive in: what is it → what does it cost → can I have it
// → who is selling it → how does it reach me → what did other buyers say →
// what else is like it.
//
// ISR at 60s: prices and copy are stable enough to cache for a minute, and the
// two things that are NOT — the shop's open/closed verdict and its exact stock
// — are re-derived below from data carried in the payload. The listing pages
// are force-dynamic for the same reason inverted.
export const revalidate = 60;

async function load(storeSlug: string, productSlug: string) {
  const supabase = await createClient();
  return getProductDetail(supabase, storeSlug, productSlug);
}

export async function generateMetadata({
  params,
}: { params: Promise<{ storeSlug: string; productSlug: string }> }): Promise<Metadata> {
  const { storeSlug, productSlug } = await params;
  const p = await load(storeSlug, productSlug);
  if (!p) return {};

  const price = p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
  const description =
    p.description?.slice(0, 155) ||
    `${p.name} from ${p.store.name} in Rodrigues — Rs ${centsToDecimalString(price)}. Pick it up or get it delivered.`;
  const url = `${SITE_URL}/shop/${p.store.slug}/${p.slug}`;

  return {
    title: `${p.name} — ${p.store.name} | Roulé Rodrigues`,
    description,
    // Its OWN canonical. Without this the root layout's is inherited and every
    // product declares itself a duplicate of the homepage, which de-indexes the
    // entire catalogue.
    alternates: { canonical: url },
    openGraph: {
      title: p.name,
      description,
      url,
      type: "website",
      images: [p.media[0]?.url || `${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function ProductPage({
  params,
}: { params: Promise<{ storeSlug: string; productSlug: string }> }) {
  const { storeSlug, productSlug } = await params;
  const p = await load(storeSlug, productSlug);
  // Null covers "does not exist", "archived", "the shop is a kitchen", "the
  // shop is an event box office" and "the shop is not published" — all 404, so
  // the response never reveals which.
  if (!p) notFound();

  const supabase = await createClient();
  const related = await relatedProducts(supabase, {
    category: p.category?.slug ?? null,
    excludeId: p.id,
    limit: 4,
  });

  const variants: CartableVariant[] = p.variants.map((v) => ({
    id: v.id,
    name: v.name,
    price: v.price,
    compareAt: v.compareAt,
    stockQuantity: v.stockQuantity,
    isActive: v.isActive,
  }));
  const prices = p.variants.map((v) => v.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const inStock = p.variants.some((v) => v.stockQuantity > 0);
  const status = p.schedule
    ? statusWords({
        hasSchedule: p.schedule.has_schedule,
        isOpen: p.schedule.is_open,
        isClosedToday: p.schedule.is_closed,
        opensAt: p.schedule.opens_at,
        closesAt: p.schedule.closes_at,
        nextOpenAt: p.schedule.next_open_at,
      })
    : { badge: "", tone: "unknown" as const };

  // Only what this shop actually offers. Reads the same columns create_order()
  // gates on, so the page can never promise a way of getting it that checkout
  // is about to refuse.
  const ways = [
    p.store.offersPickup && FULFILMENT.pickup,
    p.store.offersRrDelivery && FULFILMENT.rr_delivery,
    p.store.offersOwnDelivery && FULFILMENT.customer_delivery,
  ].filter(Boolean) as { label: string; hint: string; chip: string }[];

  const specs = Object.entries(p.attributes ?? {}).filter(([, v]) => typeof v === "string" && v);

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <MarketHeader back={{ href: `/shop/${p.store.slug}`, label: p.store.name }} />
      <ProductAnalytics
        productId={p.id}
        productName={p.name}
        storeId={p.store.id}
        storeName={p.store.name}
        price={minPrice}
        inStock={inStock}
        hasImage={p.media.length > 0}
        category={p.category?.slug ?? null}
      />
      <JsonLd
        data={[
          marketplaceProductLd({
            name: p.name,
            slug: p.slug,
            storeSlug: p.store.slug,
            storeName: p.store.name,
            description: p.description,
            brand: p.brand,
            sku: p.variants[0]?.sku ?? null,
            images: p.media.map((m) => m.url),
            category: p.category?.name ?? null,
            minPrice,
            maxPrice,
            inStock,
            offerCount: p.variants.length,
            rating: p.ratingCount > 0 && p.ratingAvg !== null
              ? { avg: Number(p.ratingAvg), count: p.ratingCount }
              : null,
            reviews: p.reviews.filter((r) => r.body),
          }),
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Marketplace", url: `${SITE_URL}/shop` },
            ...(p.category
              ? [{ name: p.category.name, url: `${SITE_URL}/shop/c/${p.category.slug}` }]
              : []),
            { name: p.name, url: `${SITE_URL}/shop/${p.store.slug}/${p.slug}` },
          ]),
        ]}
      />

      <div className="mx-auto max-w-5xl">
        {/* A visible breadcrumb, not just markup. It is the only way back to
            "more things like this" without using the browser's back button. */}
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 font-dm text-xs text-muted">
          <Link href="/shop" className="hover:text-yellow">Marketplace</Link>
          {p.category && (
            <>
              <ChevronRight size={12} className="opacity-50" />
              <Link href={`/shop/c/${p.category.slug}`} className="hover:text-yellow">{p.category.name}</Link>
            </>
          )}
          <ChevronRight size={12} className="opacity-50" />
          <span className="truncate text-offwhite/70">{p.name}</span>
        </nav>

        <div className="mt-4 grid gap-8 md:grid-cols-2">
          <div className="md:sticky md:top-20 md:self-start">
            <ProductGallery
              media={p.media}
              name={p.name}
              slug={p.slug}
              categoryName={p.category?.name}
            />
          </div>

          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {p.brand && (
                  <p className="font-bebas text-[11px] tracking-[0.28em] text-muted/70">
                    {p.brand.toUpperCase()}
                  </p>
                )}
                <h1 className="font-syne text-2xl font-extrabold leading-tight text-offwhite sm:text-3xl">
                  {p.name}
                </h1>
              </div>
              <SaveButton
                productId={p.id}
                productName={p.name}
                storeSlug={p.store.slug}
                productSlug={p.slug}
              />
            </div>

            {/* Only when there is something to say. "No reviews yet — buyers
                can rate this after their order is collected" is a sentence
                explaining an absence, directly above the price; the seller card
                further down already says the same thing once. */}
            {p.ratingCount > 0 && p.ratingAvg !== null && (
              <a href="#reviews" className="mt-2 inline-flex items-center gap-2 font-dm text-sm text-offwhite hover:text-yellow">
                <StarRating value={Number(p.ratingAvg)} size={14} />
                {Number(p.ratingAvg).toFixed(1)}
                <span className="text-muted">
                  ({p.ratingCount} review{p.ratingCount === 1 ? "" : "s"})
                </span>
              </a>
            )}

            <div className="mt-5 rounded-2xl border border-white/10 bg-dark-card p-4">
              {p.store.acceptingOrders ? (
                <AddToCartForm
                  storeId={p.store.id}
                  storeName={p.store.name}
                  productName={p.name}
                  variants={variants}
                />
              ) : (
                // The cause is a lapsed subscription. The customer gets the
                // consequence and a way forward, never the platform's billing.
                <div>
                  <p className="font-syne text-xl font-extrabold text-offwhite">
                    Rs {centsToDecimalString(minPrice)}
                    {maxPrice > minPrice && <span className="font-dm text-sm text-muted"> – {centsToDecimalString(maxPrice)}</span>}
                  </p>
                  <p className="mt-3 font-dm text-sm font-medium text-offwhite">
                    This shop isn&apos;t selling online yet
                  </p>
                  {(p.store.address || p.store.lat != null) && (
                    <div className="mt-1 font-dm text-xs text-muted">
                      You can still visit them:{" "}
                      <AddressLink
                        address={p.store.address}
                        lat={p.store.lat}
                        lng={p.store.lng}
                        name={p.store.name}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── How it reaches you ───────────────────────────────────────
                Before payment, not after. "I didn't know where to collect it"
                is a problem to solve while someone is still deciding. */}
            {ways.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-dark-card p-3.5">
                {/* The option names alone. Each one used to carry a sentence of
                    explanation under it — three sentences for a choice made
                    once, at checkout, where the explanations still live. */}
                <ul className="space-y-2">
                  {ways.map((w) => (
                    <li key={w.chip} className="flex items-center gap-2">
                      <span className="shrink-0 text-yellow/80">
                        {w.chip === FULFILMENT.rr_delivery.chip ? (
                          <Truck size={14} />
                        ) : w.chip === FULFILMENT.pickup.chip ? (
                          <StoreIcon size={14} />
                        ) : (
                          <Handshake size={14} />
                        )}
                      </span>
                      <span className="font-dm text-[13px] text-offwhite">{w.chip}</span>
                    </li>
                  ))}
                </ul>
                {p.store.offersRrDelivery && p.deliveryFeeFrom !== null && (
                  <p className="mt-2.5 border-t border-white/10 pt-2.5 font-dm text-xs text-muted">
                    Delivery from Rs {centsToShortString(p.deliveryFeeFrom)} — you pick your area at
                    checkout.
                  </p>
                )}
                {status.badge && (
                  <p className="mt-2 font-dm text-xs">
                    <span className={status.tone === "open" ? "text-emerald-400" : "text-muted"}>
                      {p.store.name} · {status.badge}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* One line. It was three, explaining a payment method the customer
                has not chosen yet and will be walked through at checkout. */}
            <p className="mt-3 flex items-center gap-2 font-dm text-xs text-muted">
              <ShieldCheck size={13} className="shrink-0 text-yellow/70" />
              Pay {p.store.name} direct by bank transfer. No card details.
            </p>

            {p.description && (
              <section className="mt-5">
                <p className="whitespace-pre-line font-dm text-sm leading-relaxed text-muted">
                  {p.description}
                </p>
              </section>
            )}

            {specs.length > 0 && (
              <section className="mt-6">
                <h2 className="font-syne text-base font-bold text-offwhite">Details</h2>
                <dl className="mt-2 divide-y divide-white/[0.06] rounded-xl border border-white/10">
                  {specs.map(([k, v]) => (
                    <div key={k} className="flex gap-4 px-3.5 py-2.5">
                      <dt className="w-32 shrink-0 font-dm text-xs uppercase tracking-wide text-muted">{k}</dt>
                      <dd className="min-w-0 font-dm text-sm text-offwhite">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <div className="mt-6">
              <SellerCard seller={p.store} />
            </div>
          </div>
        </div>

        {/* ── What buyers said ─────────────────────────────────────────────
            Only reviews with words get a card: a wall of stars adds nothing the
            average above has not already said. The COUNT still includes every
            rating, silent ones included. */}
        {p.reviews.filter((r) => r.body).length > 0 && (
          <section id="reviews" className="mt-12 scroll-mt-24">
            <h2 className="font-syne text-lg font-extrabold text-offwhite">What buyers said</h2>
            <p className="mt-1 font-dm text-xs text-muted">
              Every review here comes from someone who collected this product.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {p.reviews.filter((r) => r.body).map((r) => (
                <figure key={r.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                  <StarRating value={r.rating} size={13} />
                  <blockquote className="mt-2 font-dm text-sm leading-relaxed text-offwhite/90">
                    {r.body}
                  </blockquote>
                  <figcaption className="mt-2 flex items-center gap-1.5 font-dm text-xs text-muted">
                    <Star size={10} className="fill-yellow/60 text-yellow/60" />
                    {r.author ?? "Verified buyer"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="font-syne text-lg font-extrabold text-offwhite">
              {p.category ? `More ${p.category.name.toLowerCase()}` : "More from the marketplace"}
            </h2>
            <p className="mt-0.5 font-dm text-xs text-muted">
              From every shop on the island, not only this one.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((r) => (
                <MarketProductCard key={r.id} product={r} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
