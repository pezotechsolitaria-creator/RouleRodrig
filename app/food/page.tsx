import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Search,
  UtensilsCrossed,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { getFoodHome, browseFood } from "@/lib/food/queries";
import { DIETARY_TAGS } from "@/lib/food/types";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import FoodFaq from "@/components/food/FoodFaq";
import FrenchTwinLink from "@/components/FrenchTwinLink";
import { foodFaq } from "@/lib/food-faq";
import { faqPageLd } from "@/lib/schema";
import FoodCard from "@/components/food/FoodCard";
import FulfillmentBar from "@/components/food/FulfillmentBar";
import FoodCartBar from "@/components/food/FoodCartBar";
import {
  ConciergeLead,
  FoodBackHeader,
  FoodSearchInput,
  FoodTitle,
  LabelledNav,
  T,
  TCount,
  TDiet,
  TName,
  TRail,
} from "@/components/food/FoodCopy";

// /food — a food-first ordering surface.
//
// ── THE ONE PRODUCT RULE THIS PAGE ENFORCES ────────────────────────────────
// The customer opens it and thinks "what do I want to eat", never "which
// business is selling something". So there is no kitchen list, no kitchen
// filter, no kitchen page and no kitchen name on any grid card. Kitchens exist
// — they scope the cart and they cook the food — but they are metadata, and
// this screen never asks the customer to browse them.
//
// ── WHY IT IS DYNAMIC, NOT ISR ─────────────────────────────────────────────
// Every card carries whether the dish can be ordered RIGHT NOW, which folds in
// the kitchen's opening hours, the dish's serving window and today's remaining
// portions. A page cached for even a minute is wrong at 10:30, at 18:00, and
// on the last plate of ourite — exactly the minutes it matters. Same call as
// /shop, for the same reason.
export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Order food in Rodrigues Island — octopus, grilled fish, Creole curries and local snacks from island kitchens. Pick it up or get it delivered. Pay by bank transfer.";

export const metadata: Metadata = {
  title: "Order food in Rodrigues | Roulé Rodrigues",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/food`,
    // Mirrors the `languages` block on app/fr/manger-a-rodrigues. hreflang
    // only works when BOTH pages annotate each other.
    languages: {
      "en": `${SITE_URL}/food`,
      "fr": `${SITE_URL}/fr/manger-a-rodrigues`,
      "x-default": `${SITE_URL}/food`,
    },
  },
  openGraph: {
    title: "Order food in Rodrigues | Roulé Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/food`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const first = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");

const chip =
  "shrink-0 rounded-full border px-3.5 py-2 font-dm text-xs font-medium transition-colors";
const chipOn = `${chip} border-yellow/60 bg-yellow/15 text-yellow`;
const chipOff = `${chip} border-white/10 bg-dark-card text-muted hover:border-white/25 hover:text-offwhite`;

type Filters = {
  q: string;
  category: string;
  diet: string;
  sort: string;
  open: boolean;
};

// Every control is a plain GET link or form: the URL is the whole state, so a
// filtered menu is shareable, survives a refresh, and works before the JS has
// loaded on a slow island connection.
function foodHref(f: Filters, overrides: Partial<Filters>): string {
  const merged = { ...f, ...overrides };
  const p = new URLSearchParams();
  if (merged.q) p.set("q", merged.q);
  if (merged.category) p.set("category", merged.category);
  if (merged.diet) p.set("diet", merged.diet);
  if (merged.sort && merged.sort !== "recommended") p.set("sort", merged.sort);
  if (merged.open) p.set("open", "1");
  const qs = p.toString();
  return qs ? `/food?${qs}` : "/food";
}

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f: Filters = {
    q: first(sp.q).slice(0, 100),
    category: first(sp.category).slice(0, 60),
    diet: (DIETARY_TAGS as readonly string[]).includes(first(sp.diet))
      ? first(sp.diet)
      : "",
    sort: ["recommended", "price_asc", "fastest", "newest"].includes(
      first(sp.sort),
    )
      ? first(sp.sort)
      : "recommended",
    open: first(sp.open) === "1",
  };
  const searching = Boolean(
    f.q || f.category || f.diet || f.open || f.sort !== "recommended",
  );

  const supabase = await createClient();
  // The home payload is always fetched: even in search mode the page needs the
  // category rail and the delivery state, and it is one round trip.
  const [home, results] = await Promise.all([
    getFoodHome(supabase),
    searching
      ? browseFood(supabase, {
          q: f.q,
          category: f.category || null,
          dietary: f.diet ? [f.diet] : [],
          orderableOnly: f.open,
          sort: f.sort,
          limit: 48,
        })
      : Promise.resolve(null),
  ]);

  const empty = !home || home.dishCount === 0;

  // ── No regression on launch day ────────────────────────────────────────────
  // /food is the hub tile a tourist taps, and until the owner publishes the
  // first dish this catalog is empty. Shipping that as "We're between kitchens"
  // would REPLACE a working product — the WhatsApp concierge, which has signed
  // restaurant partners behind it — with what reads as a broken page.
  //
  // So while there is nothing to order, /food IS the concierge, and it flips to
  // the ordering surface by itself the moment a dish goes live. Nothing to
  // remember, no launch switch to throw, and no window where the busiest food
  // link on the site is a dead end.
  //
  // ?preview=1 bypasses it so the owner can see the new surface (and its empty
  // state) before publishing anything.
  if (empty && first(sp.preview) !== "1") redirect("/food/concierge");

  return (
    <main className="min-h-screen bg-dark px-4 pb-56 pt-0 text-offwhite md:pb-44">
      {/* ── A WAY BACK, THAT STAYS ─────────────────────────────
          There WAS one: a 14px arrow and the word Home, at text-sm, inside the
          scroll. It worked and it scrolled away — which on the page somebody
          browses longest is the same as not being there.

          ShopHeader is the house chrome for a commerce page and /events
          already uses it exactly like this. Its 44px arrow is the largest of
          the three back controls on the site, which suits the page that gets
          the most scrolling.

          Its cart badge is NOT a duplicate of FoodCartBar below: that pill
          reads useCart("food") and answers "what is in this order", while the
          badge counts EVERY basket and answers "do I have something waiting
          anywhere" — the question somebody who wandered in from /shop is
          carrying. */}
      <FoodBackHeader backHref="/" />
      {!empty && (
        <JsonLd
          data={[
            breadcrumbLd([
              { name: "Home", url: SITE_URL },
              { name: "Food", url: `${SITE_URL}/food` },
            ]),
            // English, because this page is its own canonical and a crawler
            // renders the default language. FoodFaq below shows the visitor
            // their own language, and both come from lib/food-faq.ts, so the
            // markup can never claim a question the page does not render.
            faqPageLd(`${SITE_URL}/food`, foodFaq("en")),
            ...(results?.items.length
              ? [
                  itemListLd(
                    "Food in Rodrigues",
                    results.items.map((i) => ({
                      name: i.name,
                      url: `${SITE_URL}/food/${i.slug}`,
                    })),
                  ),
                ]
              : home.rails[0]?.items.length
                ? [
                    itemListLd(
                      "Food in Rodrigues",
                      home.rails[0].items.map((i) => ({
                        name: i.name,
                        url: `${SITE_URL}/food/${i.slug}`,
                      })),
                    ),
                  ]
                : []),
          ]}
        />
      )}

      <div className="mx-auto max-w-2xl lg:max-w-5xl">
        {/* ── The question, asked plainly. Everything under it is an answer. ── */}
        <FoodTitle
          className="font-syne text-2xl font-extrabold leading-[1.05] sm:text-3xl"
          accentClassName="text-yellow"
        />
        {!empty && (
          <p className="mt-1 font-dm text-xs text-muted">
            <TCount k="chrome.dishCount" n={home.dishCount} />
            {home.kitchensOpen > 0 && (
              <> · <TCount k="chrome.cookingNow" n={home.kitchensOpen} /></>
            )}
          </p>
        )}

        {empty ? (
          <EmptyLaunchState />
        ) : (
          <>
            <form
              action="/food"
              method="get"
              role="search"
              className="mt-3 flex gap-2"
            >
              <FoodSearchInput
                defaultValue={f.q}
                className="w-full rounded-2xl border border-white/10 bg-dark-card py-3.5 pl-10 pr-4 font-dm text-sm text-offwhite placeholder:text-muted focus:border-yellow/50 focus:outline-none"
              >
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                />
              </FoodSearchInput>
              {f.category && (
                <input type="hidden" name="category" value={f.category} />
              )}
              {f.diet && <input type="hidden" name="diet" value={f.diet} />}
              <button
                type="submit"
                className="rounded-2xl bg-yellow px-5 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
              >
                <T k="chrome.search" />
              </button>
            </form>

            <div className="mt-3">
              <FulfillmentBar
                deliveryEnabled={home.deliveryEnabled}
                deliveryFeeFrom={home.deliveryFeeFrom}
              />
            </div>

            {/* Categories — a horizontal rail, thumb-scrollable, no wrapping.
                Only categories that actually have dishes appear (food_home()
                omits the empty ones), so this is never aspirational. */}
            {home.categories.length > 0 && (
              <LabelledNav
                k="chrome.categoriesLabel"
                className="mt-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <Link
                  href={foodHref(f, { category: "" })}
                  className={f.category === "" ? chipOn : chipOff}
                >
                  <T k="chrome.everything" />
                </Link>
                {home.categories.map((c) => (
                  <Link
                    key={c.slug}
                    href={foodHref(f, {
                      category: f.category === c.slug ? "" : c.slug,
                    })}
                    className={f.category === c.slug ? chipOn : chipOff}
                  >
                    <span aria-hidden>{c.emoji} </span>
                    {c.name}
                  </Link>
                ))}
              </LabelledNav>
            )}

            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Link
                href={foodHref(f, { open: !f.open })}
                className={f.open ? chipOn : chipOff}
              >
                <T k="chrome.readyNow" />
              </Link>
              <Link
                href={foodHref(f, {
                  sort: f.sort === "fastest" ? "recommended" : "fastest",
                })}
                className={f.sort === "fastest" ? chipOn : chipOff}
              >
                <T k="chrome.quickest" />
              </Link>
              <Link
                href={foodHref(f, {
                  sort: f.sort === "price_asc" ? "recommended" : "price_asc",
                })}
                className={f.sort === "price_asc" ? chipOn : chipOff}
              >
                <T k="chrome.cheapest" />
              </Link>
              <span className="mx-0.5 hidden w-px shrink-0 bg-white/10 sm:block" />
              {/* Halal first, and not alphabetically. The other three narrow a
                  menu somebody is already browsing; this one decides whether
                  they can eat here at all. A dish could be tagged halal in
                  admin since the vocabulary shipped, but no customer could ever
                  filter for it — the tag existed and the way to find it did
                  not, which is the same as it not existing. */}
              {(["halal", "vegetarian", "seafood", "gluten_free"] as const).map(
                (tag) => (
                  <Link
                    key={tag}
                    href={foodHref(f, { diet: f.diet === tag ? "" : tag })}
                    className={f.diet === tag ? chipOn : chipOff}
                  >
                    <TDiet tag={tag} />
                  </Link>
                ),
              )}
            </div>

            {searching ? (
              <SearchResults filters={f} results={results!} />
            ) : (
              <div className="mt-8 space-y-9">
                {home.rails.map((rail) => (
                  <section key={rail.key}>
                    <h2 className="font-syne text-lg font-extrabold text-offwhite">
                      <TRail railKey={rail.key} fallback={rail.title} />
                    </h2>
                    {/* A SWIPE RAIL, AND THE PEEK IS THE POINT.
                        c7f03e7 read "half the next dish is off the edge" as a
                        bug and went to one full-width card per row. It is not a
                        bug — it is the affordance. A partly visible third card
                        is the only thing that tells a thumb this row moves, and
                        it is why every food app on earth is built this way.
                        Killing it cost the swipe AND the two-up scan, and made
                        the page 8100px long.
                        So: a scroll-snapping rail on every size. What WAS
                        genuinely broken at this width is the price wrapping to
                        "Rs" / "320.00" — fixed properly in FoodCard rather than
                        by making the cards enormous. */}
                    <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible [&::-webkit-scrollbar]:hidden">
                      {rail.items.map((item, i) => (
                        <div
                          key={`${rail.key}-${item.id}`}
                          className="lg:w-auto"
                        >
                          <FoodCard item={item} variant="rail" index={i} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <FoodFaq />

            <FrenchTwinLink
              href="/fr/manger-a-rodrigues"
              label="Manger à Rodrigues — cette page en français"
            />

            <ConciergeFooter />
          </>
        )}
      </div>

      <FoodCartBar />
    </main>
  );
}

function SearchResults({
  filters,
  results,
}: {
  filters: Filters;
  results: { total: number; items: import("@/lib/food/types").FoodCard[] };
}) {
  if (results.items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-12 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-yellow/10 text-yellow">
          <SlidersHorizontal size={20} />
        </span>
        <p className="mt-4 font-syne text-lg font-bold text-offwhite">
          <T k="results.emptyTitle" />
        </p>
        <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
          {filters.q ? (
            <T k="results.emptyTyped" />
          ) : (
            <T k="results.emptyFiltered" />
          )}
        </p>
        <Link
          href="/food"
          className="mt-5 inline-block rounded-xl border border-yellow/50 px-5 py-2.5 font-dm text-sm font-bold text-yellow transition-colors hover:bg-yellow/10"
        >
          <T k="results.showEverything" />
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mt-7 font-dm text-xs text-muted">
        <TCount k="results.count" n={results.total} />
        {filters.q && <> <TName k="results.forQuery" v={filters.q} /></>}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {results.items.map((item, i) => (
          <FoodCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </>
  );
}

// The launch state IS the empty state. With no dishes published, this page's
// job is not to apologise — it is to send the visitor to the thing that DOES
// work today, which is the WhatsApp concierge.
function EmptyLaunchState() {
  return (
    <div className="mt-8 overflow-hidden rounded-3xl border border-yellow/20 bg-gradient-to-b from-yellow/10 to-transparent px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow/10 text-yellow ring-1 ring-inset ring-yellow/20">
        <UtensilsCrossed size={26} />
      </span>
      <h2 className="mt-5 font-syne text-2xl font-extrabold text-offwhite">
        <T k="launch.title" />
      </h2>
      <p className="mx-auto mt-3 max-w-md font-dm text-sm leading-relaxed text-muted">
        <T k="launch.body" />
      </p>
      <Link
        href="/food/concierge"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-yellow px-5 py-3 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
      >
        <MessageCircle size={16} /> <T k="launch.cta" />
      </Link>
    </div>
  );
}

// The concierge is not deleted — it answers a different question. Ordering a
// dish and being sat at a restaurant table by someone who knows the island are
// two products, and the second one already has paying partners.
function ConciergeFooter() {
  return (
    <div className="mt-12 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-dark-card px-5 py-4">
      <ConciergeLead
        className="font-dm text-sm text-muted"
        strongClassName="text-offwhite"
      />
      <Link
        href="/food/concierge"
        className="font-dm text-sm font-bold text-yellow hover:underline"
      >
        <T k="concierge.link" />
      </Link>
    </div>
  );
}
