import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import {
  ClipboardList,
  Flower2,
  Footprints,
  Map as MapIcon,
  PartyPopper,
  Plane,
  ShoppingBag,
  Siren,
  Smartphone,
  Sparkles,
  Truck,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import HubDoorCard from "@/components/marketplace/HubDoorCard";
import RentalsSection from "@/components/marketplace/RentalsSection";
import { getContent } from "@/lib/content";
import { createAnonClient } from "@/lib/supabase/anon";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import {
  HUB_BRANCHES,
  doorsOf,
  otherShelves,
  type HubAction,
  type HubExperience,
  type HubFacts,
} from "@/lib/marketplace/hub";
import { buildRentalsRail } from "@/lib/marketplace/rentals-rail";
import { getMarketplaceHome } from "@/lib/marketplace/catalog";
import { listVehicleProviders } from "@/lib/marketplace/vehicle-providers";
import { experiencesOfType } from "@/lib/experiences";
import { recommendedCount } from "@/lib/listing-gates";
import { storeState } from "@/lib/esim/state";

// ── BUY IT. BOOK IT. GET IT DONE. ───────────────────────────────────────────
//
// One page that answers "what can this site actually do for me", for somebody
// who does not already know which of eight routes they wanted.
//
// ── WHY THIS IS NOT /shop ───────────────────────────────────────────────────
// /shop is the SHELF, and it is deliberately spare: its own header comment
// records that the first product used to sit 400px down under a headline, a
// sentence, a search box and a category grid, and that all of it was removed
// because everything a shopper does on arrival is search, tap a category, or
// look at products. Putting a card hero back on that page would undo a
// measured decision. So the hub is its own route and /shop is one of its doors.
//
// ── THE ROOT OF THE MARKETPLACE TREE (architecture review 2026-09-30) ───────
// Five branches — Products, Services, Rentals, Tourist essentials, Requests &
// concierge — each a group of doors onto pages that already exist. Nothing was
// moved to make them: the doors are data in lib/marketplace/hub.ts, the Rentals
// branch is built from the live fleet (lib/marketplace/rentals-rail.ts), and a
// door is shown only while the page behind it has something on it. A branch
// with no open door is not drawn at all — a heading over nothing is a door to
// an empty room.
//
// A card with a null href still renders dark and says "Soon" — one field, so
// the link, the cursor, the wording and the aria cannot drift apart.

export const revalidate = 3600;

// No "book a car wash" (SEO audit 2026-09-29 T4): the car-wash vertical was
// cancelled and its tables dropped, so the snippet no longer offers it. The
// Wash card below still leads to its shelf.
//
// "Buy from local shops" is different: shops are a live vertical waiting for
// its first store (C16/T4). The clause is said only while sitemap_stores() —
// the predicate /shop is indexed by, see lib/listing-gates.ts — lists a shop,
// so it leaves the snippet while /shop is noindexed and comes back by itself
// with the first shop. A failed read is unknown and keeps the clause, as
// robotsWhileEmpty keeps /shop indexable.
const DESCRIPTION_WITH_SHOPS =
  "Buy from local shops, or have something delivered anywhere on Rodrigues. One place for everything Roule Rodrigues can get done for you.";
const DESCRIPTION_NO_SHOPS =
  "Have something delivered anywhere on Rodrigues. One place for everything Roule Rodrigues can get done for you.";

/** Shops sitemap_stores() lists; null when the read failed. Cookieless, so
 *  the page stays ISR (lib/supabase/anon.ts), and cached so the metadata and
 *  the page share one read per render. */
const listedShops = cache(async (): Promise<number | null> => {
  try {
    const { data, error } = await createAnonClient().rpc("sitemap_stores");
    if (error) return null;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return null;
  }
});

/** What /shop and its shelves would show: the same marketplace_home() read
 *  /shop renders its product count and CategoryStrip from. Null = unknown. */
const shopHome = cache(async () => {
  try {
    return await getMarketplaceHome(createAnonClient());
  } catch {
    return null;
  }
});

/** How many businesses /marketplace/wash lists, by its own query; null =
 *  unknown. The line pointing at it is shown only while it lists somebody. */
const washListed = cache(async (): Promise<number | null> => {
  try {
    const listed = await listVehicleProviders(createAnonClient());
    return listed ? listed.length : null;
  } catch {
    return null;
  }
});

const descriptionFor = (shops: number | null) =>
  shops === 0 ? DESCRIPTION_NO_SHOPS : DESCRIPTION_WITH_SHOPS;

export async function generateMetadata(): Promise<Metadata> {
  const description = descriptionFor(await listedShops());
  return {
    // "Rodrigues Marketplace" belongs to /shop, whose own h1 claims it: "Rodrigues
    // Marketplace — buy from the island's shops". Both pages carried that title,
    // so two indexable URLs competed for one phrase and the site's own navigation
    // pointed the word at whichever it happened to mean. This page's h1 has always
    // said what it actually is.
    title: "Buy it. Book it. Get it done. | Roule Rodrigues",
    description,
    alternates: { canonical: `${SITE_URL}/marketplace` },
    openGraph: {
      title: "Buy it. Book it. Get it done. | Roule Rodrigues",
      description,
      url: `${SITE_URL}/marketplace`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

/** Icons live here, not in hub.ts — that module stays plain data so it can be
 *  tested in node without React. */
const ICON: Record<string, React.ElementType> = {
  shop: ShoppingBag,
  celebrations: PartyPopper,
  wash: Sparkles,
  pro: Wrench,
  massage: Flower2,
  hiking: Footprints,
  esim: Smartphone,
  transfers: Plane,
  map: MapIcon,
  emergency: Siren,
  deliver: Truck,
  task: ClipboardList,
  concierge: UtensilsCrossed,
};

const EXPERIENCE_GATES: HubExperience[] = ["massage", "hiking", "boat", "fishing"];

export default async function MarketplacePage() {
  const [content, shops, home, wash] = await Promise.all([
    getContent(),
    listedShops(),
    shopHome(),
    washListed(),
  ]);

  const items = content.recommended?.items ?? [];
  const facts: HubFacts = {
    products: typeof home?.productCount === "number" ? home.productCount : null,
    shelves: home
      ? new Set((home.categories ?? []).filter((c) => c.count > 0).map((c) => c.slug))
      : null,
    experiences: Object.fromEntries(
      EXPERIENCE_GATES.map((t) => [t, recommendedCount(content, experiencesOfType(items, t))]),
    ) as Record<HubExperience, number | null>,
    foodConcierge: content.foodConcierge?.enabled === true,
    esimSelling: storeState().selling,
  };
  const rail = buildRentalsRail(content);
  const shelves = otherShelves(home?.categories ?? null);
  // /marketplace/wash lists BUSINESSES, the Wash door the WORK — see below.
  const showWashLine = wash !== 0;

  const branches = HUB_BRANCHES.map((b) => {
    const doors: HubAction[] = b.key === "rentals" ? [] : doorsOf(b.key, facts);
    const shown =
      b.key === "rentals"
        ? rail.categories.length > 0
        : doors.length > 0 ||
          (b.key === "products" && shelves.length > 0) ||
          (b.key === "services" && showWashLine);
    return { ...b, doors, shown };
  }).filter((b) => b.shown);

  const jsonLd: object[] = [
    breadcrumbLd([
      { name: "Roule Rodrigues", url: SITE_URL },
      { name: "Marketplace", url: `${SITE_URL}/marketplace` },
    ]),
  ];
  // The rental links exactly as the Rentals section shows them — names and
  // URLs only. The Product/Offer markup stays on the rental pages that own it.
  if (rail.categories.length > 0) {
    jsonLd.push(
      itemListLd("Rentals on Rodrigues", [
        ...rail.categories.map((c) => ({ name: c.label, url: `${SITE_URL}${c.href}` })),
        ...rail.vehicles.map((v) => ({ name: v.name, url: `${SITE_URL}${v.href}` })),
      ]),
    );
  }

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={
          content.recommended.enabled && content.recommended.items.length > 0
        }
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="min-h-screen bg-dark">
        <div className="mx-auto max-w-3xl px-5 pt-28 pb-16 md:pt-32">
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Back
          </BackLink>

          <p className="mt-5 font-bebas text-[11px] tracking-[0.3em] text-yellow">
            RODRIGUES MARKETPLACE
          </p>
          {/* Three clauses, three things: the deliberate shape of the whole
              page. Kept on one line at every width — broken across three it
              reads as a list of features rather than as one promise. */}
          <h1 className="mt-2 font-syne text-[26px] font-extrabold leading-tight text-offwhite sm:text-4xl">
            Buy it. Book it. Get it done.
          </h1>
          <p className="mt-2 max-w-xl font-dm text-sm leading-relaxed text-muted">
            {descriptionFor(shops)}
          </p>

          {/* The tree at a glance, and a way to jump down it on a phone: five
              sections is several screens. Only the branches drawn below. */}
          <nav aria-label="Marketplace sections" className="mt-5">
            <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {branches.map((b) => (
                <li key={b.key} className="shrink-0">
                  <a
                    href={`#${b.key}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-white/12 px-4 font-dm text-xs font-medium text-muted transition-colors hover:border-yellow/40 hover:text-yellow"
                  >
                    {b.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {branches.map((b) => (
            <section
              key={b.key}
              id={b.key}
              aria-labelledby={`${b.key}-title`}
              className="mt-10 scroll-mt-28 md:scroll-mt-32"
            >
              <h2
                id={`${b.key}-title`}
                className="font-syne text-xl font-extrabold text-offwhite"
              >
                {b.title}
              </h2>
              <p className="mt-1 font-dm text-[13px] leading-relaxed text-muted">{b.blurb}</p>

              {b.key === "rentals" ? (
                <RentalsSection rail={rail} />
              ) : (
                b.doors.length > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {b.doors.map((a) => (
                      <HubDoorCard key={a.key} action={a} icon={ICON[a.key] ?? ShoppingBag} />
                    ))}
                  </div>
                )
              )}

              {/* The rest of the live shelves, so Products reaches every one
                  /shop's CategoryStrip does — only those with a product on
                  them, in the owner's order (marketplace_home, M185). */}
              {b.key === "products" && shelves.length > 0 && (
                <p className="mt-4 font-dm text-[12.5px] leading-relaxed text-muted">
                  More shelves:{" "}
                  {shelves.map((s, i) => (
                    <span key={s.slug}>
                      {i > 0 && " · "}
                      <Link
                        href={`/shop/c/${s.slug}`}
                        className="text-yellow underline underline-offset-4"
                      >
                        {s.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}

              {/* ── THE SHELF AND THE SUPPLIERS ARE DIFFERENT QUESTIONS ──────
                  The Wash card goes to /shop/c/vehicle-care, which lists the
                  WORK — a valet you book, a shampoo you buy. This lists the
                  BUSINESSES, with whether each comes to you and whether they
                  take a booking online. Somebody who wants their car cleaned
                  wants the first; somebody who wants a particular garage wants
                  the second.

                  It is a line and not a card because it is the rarer question.
                  It is here at all because the page had no inbound link the
                  moment the card was repointed, and lib/nav/reachable-pages
                  .test.ts said so. Since review 2026-09-30 it is shown only
                  while that page lists somebody (its own query; unknown keeps
                  it): "No car washes listed yet" is not a place to send anyone. */}
              {b.key === "services" && showWashLine && (
                <p className="mt-4 font-dm text-[12.5px] leading-relaxed text-muted">
                  Looking for a particular garage?{" "}
                  <Link
                    href="/marketplace/wash"
                    className="text-yellow underline underline-offset-4"
                  >
                    See car wash and valeting businesses
                  </Link>
                </p>
              )}
            </section>
          ))}

          <p className="mt-10 font-dm text-[12.5px] leading-relaxed text-muted">
            Run a business on Rodrigues?{" "}
            <Link
              href="/list-your-scooter"
              className="text-yellow underline underline-offset-4"
            >
              List it here
            </Link>{" "}
            — shops, kitchens and services are all welcome.
          </p>
        </div>
      </main>
    </>
  );
}
