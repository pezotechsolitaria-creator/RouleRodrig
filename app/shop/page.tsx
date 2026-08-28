import type { Metadata } from "next";
import Link from "next/link";
import {
  Store as StoreIcon,
  ArrowRight,
  ChevronRight,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { centsToShortString } from "@/lib/money";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import MarketHeader from "@/components/shop/MarketHeader";
import CategoryStrip from "@/components/shop/CategoryStrip";
import MarketProductCard from "@/components/shop/MarketProductCard";
import HomeAnalytics from "@/components/shop/HomeAnalytics";
import { T, TCount, TName, LabelledLink } from "@/components/shop/ShopCopy";
import AddressLink from "@/components/AddressLink";
import {
  browseProducts,
  getMarketplaceHome,
  productsByIds,
} from "@/lib/marketplace/catalog";
import { sellerPitch, type MonetizationModel } from "@/lib/marketplace/fees";

// ── /shop — the shelf, not the shopfront speech ─────────────────────────────
//
// The first product used to sit roughly 400px down, under a label, a headline,
// a sentence, a search box, three lines of reassurance and a category grid. All
// of it true, none of it what anyone came for.
//
// Everything a marketplace shopper does on arrival is search, tap a category,
// or look at products, and all three are now above the fold: search in the
// header bar, categories as a swipeable rail beneath it, products immediately
// after. No headline, no paragraph, no eyebrow. The h1 is screen-reader-only
// because the products say what the page is faster than a sentence can.
//
// ── WHY IT IS DYNAMIC, NOT ISR ─────────────────────────────────────────────
// Every card carries stock and whether the shop is open right now. A page
// cached for even a minute is wrong at 08:00, at 17:00, and on the last jar —
// exactly the minutes it matters. Same call as /food, for the same reason.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Buy from Rodrigues Island's own shops and producers — honey, piment, spices, baskets, crafts and souvenirs. Order online, pick up in person or get it delivered island-wide.";

export const metadata: Metadata = {
  title: "Rodrigues Marketplace — buy local products online | Roulé Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: {
    title: "Rodrigues Marketplace | Roulé Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/shop`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

/**
 * Below this, rails are noise.
 *
 * "People are buying" and "New arrivals" drawn from a catalogue of six products
 * show the same six under three headings, which makes a small marketplace look
 * like a broken big one. Under the threshold the page is one uninterrupted
 * grid; the rails switch themselves on when there is enough to curate.
 */
const RAIL_THRESHOLD = 16;

/** One row, one line, no subtitle. Section headings are overhead, not content. */
function RowHeading({ title, href }: { title: React.ReactNode; href?: string }) {
  return (
    <div className="mt-6 mb-2 flex items-baseline justify-between gap-3">
      <h2 className="font-syne text-base font-extrabold text-offwhite">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 font-dm text-xs font-semibold text-yellow hover:underline"
        >
          <T k="home.seeAll" />{" "}
          <ChevronRight size={12} className="inline -translate-y-px" />
        </Link>
      )}
    </div>
  );
}

const GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

// The launch state IS the empty state: with nothing listed, this page's job is
// to recruit the first shops, not to apologise to customers for a bare shelf.
function LaunchState({ pitch }: { pitch: string }) {
  return (
    <div className="mt-8 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
        <StoreIcon size={26} />
      </span>
      <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">
        <T k="home.launch.title" />
      </h2>
      <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">
        <T k="home.launch.body" />
      </p>
      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-dark-card p-6 text-left">
        <p className="font-syne text-lg font-bold text-offwhite">
          <T k="home.launch.sellerTitle" />
        </p>
        {/* `pitch` is generated English prose from lib/marketplace/fees.ts,
            driven by the live monetization model — see the note in
            lib/shop/copy.i18n.ts. Interpolated unchanged, so in French and
            Kreol this sentence still ends in an English clause. */}
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
          <TName k="home.launch.sellerBody" v={pitch} />
        </p>
        <Link
          href="/merchant/login"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          <T k="home.launch.openShop" /> <ArrowRight size={15} />
        </Link>
      </div>
      <p className="mt-6 font-dm text-sm text-muted">
        <T k="home.launch.visiting" />{" "}
        <Link
          href="/explore"
          className="font-semibold text-yellow hover:underline"
        >
          <T k="home.launch.explore" />
        </Link>
      </p>
    </div>
  );
}

export default async function MarketplaceHomePage() {
  const supabase = await createClient();

  const [home, everything, settingsRes] = await Promise.all([
    getMarketplaceHome(supabase),
    browseProducts(supabase, { limit: 48, sort: "recommended" }),
    // What this page PROMISES a prospective seller about money comes from the
    // thing that actually charges them, not from a string typed once.
    supabase
      .from("marketplace_settings")
      .select("monetization_model, default_commission_rate")
      .eq("id", "main")
      .maybeSingle(),
  ]);

  const settings = settingsRes.data as {
    monetization_model?: string;
    default_commission_rate?: number;
  } | null;
  const pitch = sellerPitch(
    (settings?.monetization_model as MonetizationModel) ?? "subscription",
    Number(settings?.default_commission_rate ?? 0),
  );

  const productCount = home?.productCount ?? 0;
  const categories = home?.categories ?? [];
  const sellers = home?.sellers ?? [];
  const deliveryFrom = home?.deliveryFeeFrom ?? everything.deliveryFeeFrom;
  // How many shops can take an order right now. A failed read falls back to the
  // seller count: the notice below is a WARNING, and a missing answer must not
  // invent one that says the marketplace is shut.
  const sellingStoreCount = home?.sellingStoreCount ?? sellers.length;
  const big = productCount >= RAIL_THRESHOLD;

  const [bestsellers, newest] = big
    ? await Promise.all([
        productsByIds(supabase, home?.bestsellerIds ?? [], 6),
        browseProducts(supabase, { limit: 6, sort: "newest" }).then(
          (r) => r.products,
        ),
      ])
    : [[], []];

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      {/* MarketHeader has taken a `back` prop all along and this page never
          passed one — so the marketplace had a sticky bar with search and a
          cart badge and no way out of it. /shop/saved and the category pages
          pass it; the front door did not. */}
      <MarketHeader back={{ href: "/", label: "Home", labelKey: "home" }} />
      <HomeAnalytics
        productCount={productCount}
        categoryCount={categories.length}
        sellerCount={sellers.length}
      />

      {everything.products.length > 0 && (
        <JsonLd
          data={[
            breadcrumbLd([
              { name: "Home", url: SITE_URL },
              { name: "Marketplace", url: `${SITE_URL}/shop` },
            ]),
            itemListLd(
              "Products from Rodrigues shops",
              everything.products.map((p) => ({
                name: p.name,
                url: `${SITE_URL}/shop/${p.storeSlug}/${p.slug}`,
              })),
            ),
          ]}
        />
      )}

      <div className="mx-auto max-w-7xl">
        {/* The page still needs a heading for a screen reader and for search —
            it does not need to spend a screenful of a phone saying it. */}
        <h1 className="sr-only">
          <T k="home.srTitle" />
        </h1>

        <CategoryStrip categories={categories} />

        {/* ONE line — it has to stay one line at 375px, which is why the price
            drops its ".00" and the copy is this short. Two facts that change a
            purchase decision, in the place Amazon puts "Deliver to". */}
        {productCount > 0 && (
          <p className="mt-2 flex items-center gap-1.5 truncate font-dm text-[11px] text-muted">
            <Truck size={12} className="shrink-0 text-yellow/70" />
            {deliveryFrom !== null && (
              <TName
                k="home.deliveryFrom"
                v={centsToShortString(deliveryFrom)}
              />
            )}
            {deliveryFrom !== null && <span className="text-muted/50">·</span>}
            <span>
              <T k="home.payDirect" />
            </span>
          </p>
        )}

        {productCount === 0 ? (
          <LaunchState pitch={pitch} />
        ) : (
          <>
            {/* Every card already carries the badge; this says the WHY once,
                in one line, instead of leaving six badges unexplained. */}
            {sellingStoreCount === 0 && (
              <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-dm text-[11px] text-muted">
                <T k="home.paused" />
              </p>
            )}

            {big && bestsellers.length >= 2 && (
              <>
                <RowHeading
                  title={<T k="home.railBuying" />}
                  href="/shop/search"
                />
                <div className={GRID}>
                  {bestsellers.map((p, i) => (
                    <MarketProductCard
                      key={p.id}
                      product={p}
                      priority={i < 6}
                      index={i}
                    />
                  ))}
                </div>
              </>
            )}

            {big && newest.length >= 2 && (
              <>
                <RowHeading
                  title={<T k="home.railNew" />}
                  href="/shop/search?sort=newest"
                />
                <div className={GRID}>
                  {newest.map((p) => (
                    <MarketProductCard key={p.id} product={p} />
                  ))}
                </div>
              </>
            )}

            {/* The shelf. On a small catalogue it starts immediately under the
                category rail with no heading at all — a heading over the only
                grid on the page is a label for something already obvious. */}
            {big ? (
              <RowHeading
                title={<T k="home.railEverything" />}
                href={
                  everything.total > everything.products.length
                    ? "/shop/search"
                    : undefined
                }
              />
            ) : null}
            <div className={`${big ? "" : "mt-2.5 "}${GRID}`}>
              {everything.products.map((p, i) => (
                <MarketProductCard
                  key={p.id}
                  product={p}
                  priority={!big && i < 6}
                  index={i}
                />
              ))}
            </div>

            {/* ── The seller layer, at the bottom where it belongs ──────────
                Kept, because on a marketplace the shopper eventually asks "who
                am I buying from" — and moved below the shelf, because they ask
                it AFTER seeing something they want, not before. */}
            {sellers.length > 0 && (
              <>
                <RowHeading title={<T k="home.railShops" />} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {/* NOT one big link. The address is its own link now (tapping
                      it opens the shop's pin), and an <a> inside an <a> is
                      invalid HTML that browsers resolve by dropping one of
                      them — usually the one you wanted. */}
                  {sellers.map((s) => (
                    <div
                      key={s.slug}
                      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-dark-card p-3 transition-colors hover:border-yellow/40"
                    >
                      {s.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.logoUrl}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow/10 text-yellow">
                          <StoreIcon size={16} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/shop/${s.slug}`}
                          className="block truncate font-dm text-sm font-semibold text-offwhite hover:text-yellow"
                        >
                          {s.name}
                        </Link>
                        <div className="flex min-w-0 items-center gap-1.5 font-dm text-[11px] text-muted">
                          <span className="shrink-0">
                            <TCount k="counts.products" n={s.productCount} />
                          </span>
                          {s.address && (
                            <>
                              <span className="shrink-0 opacity-50">·</span>
                              <AddressLink
                                address={s.address}
                                lat={s.lat}
                                lng={s.lng}
                                name={s.name}
                                size={11}
                                className="min-w-0"
                              />
                            </>
                          )}
                        </div>
                      </div>
                      <LabelledLink
                        href={`/shop/${s.slug}`}
                        k="home.openStore"
                        v={s.name}
                        className="shrink-0 text-muted hover:text-yellow"
                      >
                        <ChevronRight size={15} />
                      </LabelledLink>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-dark-card px-4 py-3">
              <p className="font-dm text-xs text-muted">
                <TName k="home.sellHere" v={pitch} />
              </p>
              <Link
                href="/merchant/login"
                className="font-dm text-xs font-bold text-yellow hover:underline"
              >
                <T k="home.openYourShopShort" />
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
