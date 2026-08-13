import type { Metadata } from "next";
import Link from "next/link";
import { Search, Store as StoreIcon, ArrowRight, MapPin, Truck, ShieldCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { ShopHeader } from "@/components/shop/ShopChrome";
import MarketProductCard from "@/components/shop/MarketProductCard";
import CategoryTile from "@/components/shop/CategoryTile";
import HomeAnalytics from "@/components/shop/HomeAnalytics";
import { browseProducts, getMarketplaceHome, productsByIds } from "@/lib/marketplace/catalog";
import { sellerPitch, type MonetizationModel } from "@/lib/marketplace/fees";

// ── /shop — the marketplace, not the shop directory ─────────────────────────
//
// This page used to list SHOPS. It answered "which businesses exist on this
// island", which is a question almost nobody arrives with — to buy honey you
// first had to guess which shop sold honey, and if you guessed wrong you
// started again. The catalogue was reachable only two taps deep, and search
// only matched shop names.
//
// It now answers "what can I buy", because that is the question. Products lead;
// the seller travels with every card and gets a real trust block on the product
// page and a storefront of its own. That is the deliberate difference from
// /food, where the kitchen is metadata and never appears on a grid card: on a
// marketplace, WHO is selling is part of what you are deciding.
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
 * show the same six products three times under three headings, which makes a
 * small marketplace look like a broken big one. Under the threshold the page
 * shows ONE honest grid of everything; the rails switch themselves on when
 * there is genuinely enough to curate.
 */
const RAIL_THRESHOLD = 16;

function Rail({
  title, note, href, children,
}: {
  title: string; note?: string; href?: string; children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-syne text-lg font-extrabold text-offwhite sm:text-xl">{title}</h2>
          {note && <p className="mt-0.5 font-dm text-xs text-muted">{note}</p>}
        </div>
        {href && (
          <Link href={href} className="shrink-0 font-dm text-sm font-semibold text-yellow hover:underline">
            See all <ChevronRight size={14} className="inline -translate-y-px" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

// The launch state IS the empty state: with nothing listed, this page's job is
// to recruit the first shops, not to apologise to customers for a bare shelf.
function LaunchState({ pitch }: { pitch: string }) {
  return (
    <div className="mt-10 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
        <StoreIcon size={26} />
      </span>
      <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">
        The island&apos;s shops are coming online
      </h2>
      <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">
        Rodrigues honey, lemon and chilli, hand-woven baskets, embroidery — the marketplace is opening
        shop by shop. The first products will appear right here.
      </p>

      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-dark-card p-6 text-left">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">RUN A SHOP IN RODRIGUES?</p>
        <p className="mt-2 font-syne text-lg font-bold text-offwhite">Be one of the first on the marketplace</p>
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
          List your products, take orders online, and get paid directly by bank transfer before you
          hand anything over — {pitch}.
        </p>
        <Link
          href="/merchant/login"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
        >
          Open your shop <ArrowRight size={15} />
        </Link>
      </div>

      <p className="mt-6 font-dm text-sm text-muted">
        Just visiting?{" "}
        <Link href="/explore" className="font-semibold text-yellow hover:underline">
          Explore the island →
        </Link>
      </p>
    </div>
  );
}

export default async function MarketplaceHomePage() {
  const supabase = await createClient();

  const [home, everything, settingsRes] = await Promise.all([
    getMarketplaceHome(supabase),
    // The catalogue itself, best-first. One call serves both the "everything"
    // grid on a small catalogue and the "new arrivals" rail on a large one.
    browseProducts(supabase, { limit: 24, sort: "recommended" }),
    // What this page PROMISES a prospective seller about money has to come from
    // the thing that actually charges them, not from a string typed once.
    supabase
      .from("marketplace_settings")
      .select("monetization_model, default_commission_rate")
      .eq("id", "main")
      .maybeSingle(),
  ]);

  const settings = settingsRes.data as { monetization_model?: string; default_commission_rate?: number } | null;
  const pitch = sellerPitch(
    (settings?.monetization_model as MonetizationModel) ?? "subscription",
    Number(settings?.default_commission_rate ?? 0),
  );

  const productCount = home?.productCount ?? 0;
  const categories = home?.categories ?? [];
  const sellers = home?.sellers ?? [];
  // How many shops can take an order right now. When marketplace_home fails
  // this falls back to the seller count — the banner below is a WARNING, and a
  // failed read must not invent one that says the marketplace is shut.
  const sellingStoreCount = home?.sellingStoreCount ?? sellers.length;
  const deliveryFrom = home?.deliveryFeeFrom ?? everything.deliveryFeeFrom;
  const big = productCount >= RAIL_THRESHOLD;

  // Rails, but only where there is something real behind them. Each is fetched
  // ONLY when the catalogue is big enough to need curating — on a small one the
  // single grid below is both honest and more useful.
  const [bestsellers, newest] = big
    ? await Promise.all([
        productsByIds(supabase, home?.bestsellerIds ?? [], 8),
        browseProducts(supabase, { limit: 8, sort: "newest" }).then((r) => r.products),
      ])
    : [[], []];

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/" backLabel="Home" />
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

      <div className="mx-auto max-w-6xl">
        {/* ── The one thing this page is for ─────────────────────────────────
            Search leads, big and unmissable. On a marketplace it is the
            primary navigation, not a utility tucked in a corner — and it is a
            plain GET form, so it works before the JavaScript arrives. */}
        <section className="pt-2">
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MARKETPLACE</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold leading-tight sm:text-4xl">
            Buy from Rodrigues
          </h1>
          <p className="mt-2 max-w-xl font-dm text-sm text-muted">
            Honey, piment, spices, baskets and crafts — from the island&apos;s own shops and producers.
          </p>

          <form action="/shop/search" method="get" role="search" className="mt-5 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                name="q"
                placeholder="What are you looking for?"
                aria-label="Search the marketplace"
                className="w-full rounded-2xl border border-white/10 bg-dark-card py-4 pl-11 pr-4 font-dm text-[15px] text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-yellow px-6 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              Search
            </button>
          </form>

          {productCount > 0 && (
            <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-dm text-xs text-muted">
              <li className="inline-flex items-center gap-1.5">
                <StoreIcon size={13} className="text-yellow/70" />
                {productCount} product{productCount === 1 ? "" : "s"} from {sellers.length} island shop
                {sellers.length === 1 ? "" : "s"}
              </li>
              {deliveryFrom !== null && (
                <li className="inline-flex items-center gap-1.5">
                  <Truck size={13} className="text-yellow/70" />
                  Delivery island-wide from Rs {centsToDecimalString(deliveryFrom)}
                </li>
              )}
              <li className="inline-flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-yellow/70" />
                You pay the shop directly — no card needed
              </li>
            </ul>
          )}
        </section>

        {productCount === 0 ? (
          <LaunchState pitch={pitch} />
        ) : (
          <>
            {/* ── When nothing can actually be bought ────────────────────────
                Every card already says "Not selling online", and six identical
                badges with no explanation is the same non-answer repeated. Say
                it ONCE, plainly, and let people keep browsing and saving —
                which is what they can still usefully do.
                `sellingStoreCount` is store_subscription_active() counted over
                the catalogue; the customer gets the consequence, never the
                platform's billing (lib/shop/plain-words.ts). */}
            {sellingStoreCount === 0 && (
              <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="font-dm text-sm font-medium text-offwhite">
                  Online ordering is paused across the marketplace
                </p>
                <p className="mt-1 font-dm text-sm leading-relaxed text-muted">
                  You can still browse everything here and save what you like. To buy today, contact a
                  shop directly — their address and phone number are on their page.
                </p>
              </div>
            )}
            {sellingStoreCount > 0 && sellingStoreCount < sellers.length && (
              <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <p className="font-dm text-sm text-muted">
                  {sellers.length - sellingStoreCount} of these {sellers.length} shops aren&apos;t taking
                  online orders at the moment. Their products are still listed, marked on the card.
                </p>
              </div>
            )}

            {categories.length > 0 && (
              <section className="mt-9">
                <h2 className="font-syne text-lg font-extrabold text-offwhite sm:text-xl">Shop by category</h2>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {categories.map((c) => (
                    <CategoryTile key={c.slug} category={c} />
                  ))}
                </div>
              </section>
            )}

            {big && bestsellers.length >= 2 && (
              <Rail
                title="People are buying"
                note="Ordered most often in the last few months"
                href="/shop/search"
              >
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {bestsellers.map((p) => (
                    <MarketProductCard key={p.id} product={p} />
                  ))}
                </div>
              </Rail>
            )}

            {big && newest.length >= 2 && (
              <Rail title="New arrivals" note="Just listed by island shops" href="/shop/search?sort=newest">
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {newest.map((p) => (
                    <MarketProductCard key={p.id} product={p} />
                  ))}
                </div>
              </Rail>
            )}

            <Rail
              title={big ? "Everything on the marketplace" : "Everything for sale"}
              note={big ? undefined : "The whole marketplace, on one screen"}
              href={everything.total > everything.products.length ? "/shop/search" : undefined}
            >
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {everything.products.map((p, i) => (
                  <MarketProductCard key={p.id} product={p} priority={i < 4} />
                ))}
              </div>
            </Rail>

            {/* ── The seller layer ──────────────────────────────────────────
                Demoted from the front page to a strip, and deliberately kept:
                on a marketplace the shopper eventually asks "who am I buying
                from", and a shop with a name, a face and an address is the
                answer. It is a trust surface, not the way in. */}
            {sellers.length > 0 && (
              <section className="mt-12">
                <h2 className="font-syne text-lg font-extrabold text-offwhite sm:text-xl">
                  The shops behind them
                </h2>
                <p className="mt-0.5 font-dm text-xs text-muted">
                  Real businesses on the island. You collect from them, or they send it to you.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sellers.map((s) => (
                    <Link
                      key={s.slug}
                      href={`/shop/${s.slug}`}
                      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/30"
                    >
                      {s.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.logoUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
                          <StoreIcon size={18} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-syne text-sm font-bold text-offwhite group-hover:text-yellow">
                          {s.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 font-dm text-xs text-muted">
                          <span>{s.productCount} product{s.productCount === 1 ? "" : "s"}</span>
                          {s.address && (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate">
                              <MapPin size={10} className="shrink-0" />
                              <span className="truncate">{s.address}</span>
                            </span>
                          )}
                        </span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-muted group-hover:text-yellow" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
              <p className="font-dm text-sm text-muted">
                Run a shop in Rodrigues? Sell on the marketplace — {pitch}.
              </p>
              <Link href="/merchant/login" className="font-dm text-sm font-bold text-yellow hover:underline">
                Open your shop →
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
