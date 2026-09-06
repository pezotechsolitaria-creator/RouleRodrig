import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store as StoreIcon, Phone, PackageCheck, CalendarClock, ChevronRight, Wrench } from "lucide-react";
import { SITE_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import MarketProductCard from "@/components/shop/MarketProductCard";
import StoreHoursCard from "@/components/shop/StoreHoursCard";
import CategoryRail from "@/components/shop/CategoryRail";
import StarRating from "@/components/shop/StarRating";
import SellerAnalytics from "@/components/shop/SellerAnalytics";
import AddressLink from "@/components/AddressLink";
import MarketHeader from "@/components/shop/MarketHeader";
import { T, TCount, TName } from "@/components/shop/ShopCopy";
import JsonLd from "@/components/JsonLd";
import { storeLd, breadcrumbLd } from "@/lib/schema";
import { fulfilmentWords } from "@/lib/shop/plain-words";
import { UNCATEGORISED } from "@/lib/shop/copy.i18n";
import { browseProducts } from "@/lib/marketplace/catalog";
import BookService, { type BookableService } from "@/components/shop/BookService";

// ── The seller storefront ───────────────────────────────────────────────────
//
// It stays, and it matters — this is the difference between the marketplace and
// /food, where a kitchen has no page at all. Before paying a stranger on a small
// island, a buyer wants to know who the stranger is: what else they make, how
// long they have been trading, what other buyers said, where to find them.
//
// What CHANGED is its job. It used to be the way IN to the catalogue: to buy
// honey you first had to find the honey shop. Discovery now belongs to /shop
// and the category pages, and this page is the trust surface you arrive at from
// a product — which is the order the questions actually come in.
export const revalidate = 60;

async function getStore(slug: string) {
  const supabase = await createClient();
  // marketplace_stores (M96) is the ONE definition of "a shop the marketplace
  // may show": active, approved merchant, not a test fixture, not a kitchen
  // (M50), not an event box office (M42). This page used to re-derive two of
  // those rules by hand and had already drifted once.
  const { data } = await supabase
    .from("marketplace_stores")
    .select("id, name, slug, tagline, description, logo_url, cover_url, address, lat, lng, phone, whatsapp, rating_avg, rating_count, created_at")
    .eq("slug", slug)
    .maybeSingle();
  return data as {
    id: string; name: string; slug: string; tagline: string | null; description: string | null;
    logo_url: string | null; cover_url: string | null; address: string | null;
    lat: number | null; lng: number | null;
    phone: string | null; whatsapp: string | null;
    rating_avg: number | null; rating_count: number; created_at: string;
  } | null;
}

export async function generateMetadata({ params }: { params: Promise<{ storeSlug: string }> }): Promise<Metadata> {
  const { storeSlug } = await params;
  const store = await getStore(storeSlug);
  if (!store) return {};
  const description =
    store.tagline || store.description || `Buy from ${store.name} in Rodrigues — pick up in person or get it delivered.`;
  const url = `${SITE_URL}/shop/${store.slug}`;
  return {
    title: `${store.name} — Rodrigues | Roulé Rodrigues Marketplace`,
    description,
    // Its OWN canonical. Without this the root layout's is inherited, so every
    // storefront declares itself a duplicate of the homepage — which
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
  const [catalogue, { data: hours }, { data: reviewData }, { count: completed },
         { data: trade }, { data: bookable }] = await Promise.all([
    // Through browse_products, NOT a table read: the storefront grid and the
    // marketplace grid then agree about price, stock and quick-add, because
    // they are literally the same rows.
    browseProducts(supabase, { seller: store.slug, limit: 48, sort: "recommended" }),
    supabase
      .from("store_hours")
      .select("weekday, opens_at, closes_at, delivery_opens_at, delivery_closes_at, delivery_closed, is_closed")
      .eq("store_id", store.id)
      .is("date", null)
      .order("weekday"),
    // Through the RPC, not a table read: the reviewer's name is derived inside
    // the function, so nothing here needs SELECT on orders.customer_name (M29).
    supabase.rpc("store_reviews", { p_store_id: store.id, p_limit: 8 }),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .eq("status", "collected"),
    // ── IS THIS A TRADE? ────────────────────────────────────────────────
    // marketplace_stores excludes kitchens and box offices but NOT trades, so
    // a car wash arrives here like any other shop. What it sells is booked
    // time, and the page has to change its job accordingly.
    supabase
      .from("trade_providers")
      .select("trade, mobile, takes_online_bookings")
      .eq("store_id", store.id)
      .maybeSingle(),
    // Through the RPC, so "bookable" means the same thing here, in the slot
    // finder and at the checkout: a variant with a duration.
    supabase.rpc("store_bookable_services", { p_store_id: store.id }),
  ]);

  type StoreReview = { id: string; rating: number; body: string | null; createdAt: string; author: string | null };
  const reviews = ((reviewData as StoreReview[] | null) ?? []).filter((r) => r.body);

  // ── A TRADE'S CATALOGUE IS TWO CATALOGUES ───────────────────────────────
  // A car wash sells a full valet AND a bottle of wax off the shelf. The valet
  // is booked and the wax is bought, and mixing them into one grid would put an
  // "add to cart" on a thing that is time. The duration is what separates them,
  // which is the same rule create_order and service_slots use — so a product
  // cannot be bookable in one place and buyable in another.
  const services: BookableService[] = ((bookable ?? []) as {
    variant_id: string; product_id: string; name: string; price_cents: number; minutes: number;
  }[]).map((r) => ({
    variantId: r.variant_id,
    name: r.name,
    priceCents: r.price_cents,
    minutes: r.minutes,
  }));
  const serviceProductIds = new Set(
    ((bookable ?? []) as { product_id: string }[]).map((r) => r.product_id),
  );
  const products = catalogue.products.filter((p) => !serviceProductIds.has(p.id));

  // Group into category sections, UNCATEGORISED always last — a storefront
  // reads as a catalogue with a jump rail, not one undifferentiated grid.
  //
  // The sentinel is a KEY, not copy: it sorts the bucket last and it seeds the
  // #cat-more anchor CategoryRail scroll-spies against, so its VALUE is frozen
  // in lib/shop/copy.i18n.ts and only its label (store.moreSection) translates.
  const sections = [...new Set(products.map((p) => p.categoryName ?? UNCATEGORISED))]
    .sort((a, b) => (a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b)))
    .map((name) => ({
      id: slugify(name),
      name,
      items: products.filter((p) => (p.categoryName ?? UNCATEGORISED) === name),
    }));

  const since = new Date(store.created_at);
  const sinceLabel = Number.isNaN(since.getTime())
    ? null
    : since.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const first = products[0];
  const ways = first
    ? fulfilmentWords({
        offersPickup: first.offersPickup,
        offersRrDelivery: first.offersRrDelivery,
        offersOwnDelivery: first.offersOwnDelivery,
        acceptsCash: false,
        acceptsBankTransfer: false,
      })
    : [];

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      {/* Structured data built from the SAME rows the page renders: Google
          devalues (and can penalise) markup describing content that is not on
          the page, so the catalogue can never drift from what a visitor sees.
          The rating passes through only when real reviews exist. */}
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
            products: products.slice(0, 30).map((p) => ({
              name: p.name,
              url: `${SITE_URL}/shop/${store.slug}/${p.slug}`,
              price: p.minPrice || undefined,
              image: p.imageUrl,
            })),
          }),
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Marketplace", url: `${SITE_URL}/shop` },
            { name: store.name, url: `${SITE_URL}/shop/${store.slug}` },
          ]),
        ]}
      />
      <MarketHeader back={{ href: "/shop", label: "the marketplace", labelKey: "marketplace" }} />
      <SellerAnalytics storeId={store.id} storeName={store.name} productCount={products.length} />

      <div className="mx-auto max-w-6xl">
        {/* Cover — the shop's own photography leads; the logo overlaps its edge. */}
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

        <div className="mt-10 lg:flex lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            <h1 className="font-syne text-2xl font-extrabold text-offwhite sm:text-3xl">{store.name}</h1>
            {store.tagline && <p className="mt-0.5 font-dm text-sm text-muted">{store.tagline}</p>}

            {store.rating_count > 0 && store.rating_avg !== null ? (
              <a href="#reviews" className="mt-1.5 inline-flex items-center gap-2 font-dm text-sm text-offwhite hover:text-yellow">
                <StarRating value={Number(store.rating_avg)} />
                {Number(store.rating_avg).toFixed(1)}
                <span className="text-muted">
                  <TCount k="counts.reviews" n={store.rating_count} />
                </span>
              </a>
            ) : (
              // Honest instead of blank. "No reviews yet" tells a visitor the
              // shop is new, not that the page forgot to load something — and it
              // says who is allowed to change that.
              <p className="mt-1.5 font-dm text-xs text-muted">
                <T k="store.noReviews" />
              </p>
            )}

            {/* ── The trust row ───────────────────────────────────────────
                Counts and dates, every one of them a column in the database.
                No "verified" badge, no response time: this platform does not
                measure those, and a trust signal that is decoration teaches
                buyers to distrust the real ones too. */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 font-dm text-xs text-muted">
              {/* A trade with two services and nothing on the shelf was
                  reading "0 products" directly above a working booking panel —
                  a shop advertising that it sells nothing. Counted in the unit
                  the business actually deals in. */}
              <span className="inline-flex items-center gap-1.5">
                {services.length > 0 ? (
                  <>
                    <Wrench size={12} />{" "}
                    {services.length === 1 ? "1 service" : `${services.length} services`}
                  </>
                ) : (
                  <>
                    <StoreIcon size={12} /> <TCount k="counts.products" n={products.length} />
                  </>
                )}
              </span>
              {(completed ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <PackageCheck size={12} /> <TCount k="store.ordersCompleted" n={completed ?? 0} />
                </span>
              )}
              {/* `sinceLabel` is an en-GB month name computed above; formatting
                  dates in the reader's language is a lib/schedule-shaped change
                  this package does not own. */}
              {sinceLabel && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock size={12} /> <TName k="store.since" v={sinceLabel} />
                </span>
              )}
              {store.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={12} /> {store.phone}
                </span>
              )}
              {/* Tappable — this is the page someone opens to decide whether
                  to go there. */}
              {(store.address || (store.lat != null && store.lng != null)) && (
                <AddressLink
                  address={store.address}
                  lat={store.lat}
                  lng={store.lng}
                  name={store.name}
                />
              )}
            </div>

            {ways.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ways.map((w) => (
                  <span
                    key={w}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-dm text-[11px] font-medium text-muted"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}

            {store.description && (
              <p className="mt-4 max-w-2xl font-dm text-sm leading-relaxed text-muted">{store.description}</p>
            )}
          </div>

          {(hours ?? []).length > 0 && (
            <div className="mt-5 w-full max-w-md lg:mt-0 lg:w-72 lg:shrink-0">
              <StoreHoursCard days={hours ?? []} initialStatus={null} />
            </div>
          )}
        </div>
      </div>

      {/* ── The reason a trade has a page at all ────────────────────────
          Above the shelf, because booking a time IS what this business sells.
          A car wash whose valet sat below four bottles of wax would be a
          storefront arranged for the wrong customer. */}
      {services.length > 0 && (
        <div className="mx-auto mt-8 max-w-2xl">
          <BookService
            storeId={store.id}
            storeName={store.name}
            storePhone={store.phone}
            services={services}
            takesOnlineBookings={trade?.takes_online_bookings ?? false}
            mobile={trade?.mobile ?? false}
          />
        </div>
      )}

      {sections.length > 1 && (
        <div className="mt-6">
          <CategoryRail sections={sections.map(({ id, name }) => ({ id, name }))} />
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        {/* A trade with no goods on the shelf is not an empty shop — its whole
            catalogue is the panel above. Showing "nothing here yet" under a
            working booking form would tell a customer to leave. */}
        {products.length === 0 && services.length > 0 ? null : products.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
            <p className="font-syne text-lg font-bold text-offwhite">
              <T k="store.emptyTitle" />
            </p>
            <p className="mx-auto mt-1.5 max-w-sm font-dm text-sm text-muted">
              <T k="store.emptyBody" />
            </p>
            <Link
              href="/shop"
              className="mt-4 inline-flex items-center gap-1.5 font-dm text-sm font-bold text-yellow hover:underline"
            >
              <T k="store.browseMarketplace" /> <ChevronRight size={14} />
            </Link>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.id} id={section.id} className="mt-8 scroll-mt-32">
              {sections.length > 1 && (
                <h2 className="font-syne text-lg font-bold text-offwhite">
                  {/* Category names are the owner's words and stay put; the
                      UNCATEGORISED bucket is ours to name. */}
                  {section.name === UNCATEGORISED ? <T k="store.moreSection" /> : section.name}
                </h2>
              )}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {section.items.map((p, i) => (
                  // showSeller off: every card here has the same seller, and
                  // repeating it 20 times is noise on the one page where it is
                  // already the headline.
                  <MarketProductCard key={p.id} product={p} showSeller={false} priority={i < 4} index={i} />
                ))}
              </div>
            </section>
          ))
        )}

        {/* Only reviews with words get a card — a wall of "★★★★★" adds nothing
            the average above has not already said. The COUNT still reflects
            every rating, including the silent ones. */}
        {reviews.length > 0 && (
          <section id="reviews" className="mt-12 scroll-mt-32">
            <h2 className="font-syne text-lg font-extrabold text-offwhite">
              <T k="store.reviewsTitle" />
            </h2>
            <p className="mt-1 font-dm text-xs text-muted">
              <T k="store.reviewsNote" />
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r) => (
                <figure key={r.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                  <StarRating value={r.rating} size={13} />
                  <blockquote className="mt-2 font-dm text-sm leading-relaxed text-offwhite/90">{r.body}</blockquote>
                  <figcaption className="mt-2 font-dm text-xs text-muted">
                    {r.author ?? <T k="store.verifiedBuyer" />} ·{" "}
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
