import type { Metadata } from "next";
import Link from "next/link";
import { Search, Store as StoreIcon, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { centsToDecimalString } from "@/lib/money";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import StoreCard, { type BrowseStoreCard } from "@/components/shop/StoreCard";
import { ShopHeader } from "@/components/shop/ShopChrome";
import { sellerPitch, type MonetizationModel } from "@/lib/marketplace/fees";

// Deliberately dynamic, NOT ISR: browse_stores() computes each shop's
// open/closed verdict inside the query, and an "Open now" badge cached for
// even a minute is wrong exactly at 08:00 and 18:00 — the minutes it matters.
// (Contrast /shop/[storeSlug], which is ISR and re-derives the badge client-side.)
export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

const DESCRIPTION =
  "Buy from local shops in Rodrigues Island — honey, chilli, crafts and more. Order online, pay cash or by bank transfer, pick up or get it delivered island-wide.";

export const metadata: Metadata = {
  title: "Local Shops in Rodrigues | Roulé Rodrigues Marketplace",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: {
    title: "Local Shops in Rodrigues | Roulé Rodrigues Marketplace",
    description: DESCRIPTION,
    url: `${SITE_URL}/shop`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

type BrowseCategory = { slug: string; name: string; icon: string | null; storeCount: number };
type BrowseResult = {
  total: number;
  limit: number;
  offset: number;
  deliveryFeeFrom: number | null;
  stores: BrowseStoreCard[];
};

type Filters = {
  q: string;
  category: string;
  fulfillment: string;
  open: boolean;
  sort: string;
  page: number;
};

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

// Every filter control is a plain GET link/form — the URL is the whole state,
// so filters survive refresh and are shareable. page resets on any change.
function shopHref(f: Filters, overrides: Partial<Filters>): string {
  const merged = { ...f, page: 1, ...overrides };
  const p = new URLSearchParams();
  if (merged.q) p.set("q", merged.q);
  if (merged.category) p.set("category", merged.category);
  if (merged.fulfillment) p.set("fulfillment", merged.fulfillment);
  if (merged.open) p.set("open", "1");
  if (merged.sort && merged.sort !== "featured") p.set("sort", merged.sort);
  if (merged.page > 1) p.set("page", String(merged.page));
  const qs = p.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

const chipBase = "shrink-0 rounded-full border px-3 py-1.5 font-dm text-xs font-medium transition-colors";
const chipOn = `${chipBase} border-yellow/60 bg-yellow/15 text-yellow`;
const chipOff = `${chipBase} border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite`;

// The launch state IS the empty state: with zero approved merchants this page's
// job is to recruit the first shops, not to apologise to customers for a bare
// directory. /merchant/login has a "Create your shop account" mode already.
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
        shop by shop. The first ones will appear right here.
      </p>

      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-white/10 bg-dark-card p-6 text-left">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">RUN A SHOP IN RODRIGUES?</p>
        <p className="mt-2 font-syne text-lg font-bold text-offwhite">Be one of the first on the marketplace</p>
        <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
          List your products, take orders online, and get paid directly in cash or by bank transfer —
          {" "}{pitch}.
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

export default async function ShopDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f: Filters = {
    q: first(sp.q).slice(0, 100),
    category: first(sp.category).slice(0, 60),
    fulfillment: ["rr_delivery", "own_delivery", "pickup"].includes(first(sp.fulfillment))
      ? first(sp.fulfillment)
      : "",
    open: first(sp.open) === "1",
    sort: ["featured", "newest", "name", "rating"].includes(first(sp.sort)) ? first(sp.sort) : "featured",
    page: Math.max(1, Math.min(50, parseInt(first(sp.page), 10) || 1)),
  };

  const supabase = await createClient();
  const [storesRes, catsRes, settingsRes] = await Promise.all([
    supabase.rpc("browse_stores", {
      p_q: f.q || null,
      p_category: f.category || null,
      p_fulfillment: f.fulfillment || null,
      p_open_now: f.open,
      p_sort: f.sort,
      p_limit: PAGE_SIZE,
      p_offset: (f.page - 1) * PAGE_SIZE,
    }),
    supabase.rpc("browse_store_categories"),
    // What this page PROMISES a prospective seller about money has to come
    // from the thing that actually charges them, not from a string typed once.
    // marketplace_settings is publicly readable (marketplace_settings_public_read).
    supabase
      .from("marketplace_settings")
      .select("monetization_model, default_commission_rate")
      .eq("id", "main")
      .maybeSingle(),
  ]);

  // A failed directory query is a real error page (app/shop/error.tsx), not a
  // fake "no shops" state that would read as the marketplace being empty.
  if (storesRes.error) {
    console.error("browse_stores failed", storesRes.error);
    throw new Error("Failed to load the shop directory.");
  }
  const result = (storesRes.data ?? { total: 0, limit: PAGE_SIZE, offset: 0, deliveryFeeFrom: null, stores: [] }) as BrowseResult;
  // Categories power the filter bar only — losing them must not sink the page.
  if (catsRes.error) console.error("browse_store_categories failed", catsRes.error);
  const categories = ((catsRes.data ?? []) as BrowseCategory[]).filter((c) => c.storeCount > 0);

  // Falls back to the honest default if the settings read fails: never invent a
  // cheaper offer than the one actually configured.
  const settings = settingsRes.data as { monetization_model?: string; default_commission_rate?: number } | null;
  const pitch = sellerPitch(
    (settings?.monetization_model as MonetizationModel) ?? "subscription",
    Number(settings?.default_commission_rate ?? 0),
  );

  const hasFilters = Boolean(f.q || f.category || f.fulfillment || f.open);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <main className="min-h-screen bg-dark px-4 pb-44 pt-0 text-offwhite md:pb-28">
      <ShopHeader backHref="/" backLabel="Home" />
      {result.stores.length > 0 && (
        <JsonLd
          data={[
            breadcrumbLd([
              { name: "Home", url: SITE_URL },
              { name: "Local shops", url: `${SITE_URL}/shop` },
            ]),
            itemListLd(
              "Local shops in Rodrigues",
              result.stores.map((s) => ({ name: s.name, url: `${SITE_URL}/shop/${s.slug}` })),
            ),
          ]}
        />
      )}

      <div className="mx-auto max-w-4xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">MARKETPLACE</p>
        <h1 className="mt-1 font-syne text-2xl font-extrabold sm:text-3xl">Local shops in Rodrigues</h1>
        <p className="mt-2 max-w-2xl font-dm text-sm text-muted">
          Order from the island&apos;s own shops — pick up in person or get it delivered
          {result.deliveryFeeFrom !== null && (
            <> island-wide from Rs {centsToDecimalString(result.deliveryFeeFrom)}</>
          )}
          .
        </p>

        {/* Search — plain GET form; active filters ride along as hidden inputs. */}
        <form action="/shop" method="get" className="mt-5 flex gap-2" role="search">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              defaultValue={f.q}
              placeholder="Search shops or products…"
              className="w-full rounded-2xl border border-white/10 bg-dark-card py-3 pl-10 pr-4 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
            />
          </div>
          {f.category && <input type="hidden" name="category" value={f.category} />}
          {f.fulfillment && <input type="hidden" name="fulfillment" value={f.fulfillment} />}
          {f.open && <input type="hidden" name="open" value="1" />}
          {f.sort !== "featured" && <input type="hidden" name="sort" value={f.sort} />}
          <button
            type="submit"
            className="rounded-2xl bg-yellow px-5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
          >
            Search
          </button>
        </form>

        {categories.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link href={shopHref(f, { category: "" })} className={f.category === "" ? chipOn : chipOff}>
              All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
                href={shopHref(f, { category: f.category === c.slug ? "" : c.slug })}
                className={f.category === c.slug ? chipOn : chipOff}
              >
                {c.name} <span className="opacity-60">({c.storeCount})</span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={shopHref(f, { open: !f.open })} className={f.open ? chipOn : chipOff}>
            Open now
          </Link>
          <Link
            href={shopHref(f, { fulfillment: f.fulfillment === "rr_delivery" ? "" : "rr_delivery" })}
            className={f.fulfillment === "rr_delivery" ? chipOn : chipOff}
          >
            Delivery
          </Link>
          <Link
            href={shopHref(f, { fulfillment: f.fulfillment === "pickup" ? "" : "pickup" })}
            className={f.fulfillment === "pickup" ? chipOn : chipOff}
          >
            Pickup
          </Link>
          <span className="mx-1 hidden h-4 w-px bg-white/10 sm:block" />
          {(
            [
              ["featured", "Featured"],
              ["newest", "Newest"],
              ["rating", "Top rated"],
              ["name", "A–Z"],
            ] as const
          ).map(([value, label]) => (
            <Link key={value} href={shopHref(f, { sort: value })} className={f.sort === value ? chipOn : chipOff}>
              {label}
            </Link>
          ))}
        </div>

        {result.stores.length > 0 ? (
          <>
            <p className="mt-6 font-dm text-xs text-muted">
              {result.total} shop{result.total === 1 ? "" : "s"}
              {hasFilters ? " match" : ""}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.stores.map((s) => (
                <StoreCard key={s.id} store={s} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-4 font-dm text-sm">
                {f.page > 1 ? (
                  <Link href={shopHref(f, { page: f.page - 1 })} className="font-semibold text-yellow hover:underline">
                    ← Previous
                  </Link>
                ) : (
                  <span className="text-muted/40">← Previous</span>
                )}
                <span className="text-muted">
                  Page {f.page} of {totalPages}
                </span>
                {f.page < totalPages ? (
                  <Link href={shopHref(f, { page: f.page + 1 })} className="font-semibold text-yellow hover:underline">
                    Next →
                  </Link>
                ) : (
                  <span className="text-muted/40">Next →</span>
                )}
              </div>
            )}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
              <p className="font-dm text-sm text-muted">
                Run a shop in Rodrigues? Sell on the marketplace — {pitch}.
              </p>
              <Link href="/merchant/login" className="font-dm text-sm font-bold text-yellow hover:underline">
                Open your shop →
              </Link>
            </div>
          </>
        ) : hasFilters ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
            <p className="font-syne text-lg font-bold text-offwhite">
              No shops match{f.q ? <> &ldquo;{f.q}&rdquo;</> : " these filters"}
            </p>
            <p className="mt-2 font-dm text-sm text-muted">
              Try a different search, or browse everything that&apos;s open.
            </p>
            <Link
              href="/shop"
              className="mt-4 inline-block rounded-xl border border-yellow/50 px-5 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <LaunchState pitch={pitch} />
        )}
      </div>
    </main>
  );
}
