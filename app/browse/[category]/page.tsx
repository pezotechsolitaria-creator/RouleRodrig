import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { fromPriceOf } from "@/lib/experiences";
import { breadcrumbLd, itemListLd, productLd, stayLd, experienceLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import {
  getFleetView,
  buildBrowseCategories,
  priceNumber,
} from "@/lib/site-data";
import AppPageHeader from "@/components/AppPageHeader";
import BrowseTabs from "@/components/BrowseTabs";
import Fleet from "@/components/Fleet";
import TrustBar from "@/components/TrustBar";
import BookingSection from "@/components/BookingSection";
import { pickConditions } from "@/lib/rental-conditions";
import RecommendedPlaces from "@/components/RecommendedPlaces";
import GettingAround from "@/components/GettingAround";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";

// ISR (see app/page.tsx). The per-vehicle booking calendar is client-fetched,
// so availability there stays live; card badges can be up to ~60s behind.
export const revalidate = 60;

// Special (non-vehicle) place categories → which items render on each page.
// Activities and Guided Tours share the "activity" category, split by isTour.
type Place = { category: string; isTour?: boolean };
const PLACE_SLUGS: Record<
  string,
  { label: string; filter: (p: Place) => boolean }
> = {
  restaurants: {
    label: "Restaurants",
    filter: (p) => p.category === "restaurant",
  },
  activities: {
    label: "Activities",
    filter: (p) => p.category === "activity" && !p.isTour,
  },
  tours: {
    label: "Guided Tours",
    filter: (p) => p.category === "activity" && !!p.isTour,
  },
  stays: { label: "Accommodations", filter: (p) => p.category === "hotel" },
};

// ── SEO ──────────────────────────────────────────────────────────────
// Each browse page targets a distinct search intent. Without this they all
// inherit the root layout's title and read to Google as duplicates of the
// homepage. Titles stay under ~60 chars and descriptions under ~155 so they
// aren't truncated in results. No prices here — they'd go stale silently.
// `fr` = the URL of this page's French equivalent. hreflang only works if BOTH
// pages point at each other — a one-way annotation is silently ignored, so this
// must stay in sync with the `languages` block on the French page.
const META: Record<
  string,
  { title: string; description: string; fr?: string }
> = {
  scooter: {
    title: "Scooter Rental in Rodrigues Island",
    description:
      "Rent a scooter in Rodrigues from local owners. Helmets included, island-wide pickup and real WhatsApp support. Compare models and book your dates online.",
    fr: "/fr/location-scooter-rodrigues",
  },
  car: {
    title: "Car Rental in Rodrigues Island, Mauritius",
    description:
      "Hire a car in Rodrigues for the family or a longer stay. Local owners, clear daily rates, island-wide pickup. Compare vehicles and book yours online today.",
    fr: "/fr/location-voiture-rodrigues",
  },
  stays: {
    title: "Where to Stay in Rodrigues Island",
    description:
      "Guesthouses, lodges and hotels across Rodrigues, recommended by locals. See photos and prices, then book directly with the owner — no booking fees.",
    // A one-way hreflang is silently ignored, so this half matters as much as
    // the one the French page declares.
    fr: "/fr/hebergement-rodrigues",
  },
  activities: {
    title: "Things to Do in Rodrigues Island",
    description:
      "Kitesurfing, snorkelling, hiking, island tours and more. Real activities in Rodrigues with photos and prices — book directly with the people who run them.",
  },
  tours: {
    title: "Guided Tours in Rodrigues Island",
    description:
      "Guided island tours in Rodrigues led by locals who know it best. See what's included, compare prices and book directly — no middleman, no booking fees.",
  },
  "getting-around": {
    title: "How to Get Around Rodrigues Island",
    description:
      "Getting around Rodrigues: taxis, airport transfers, scooter and car hire. Compare real local prices and contact drivers direct — no agency, no booking fees.",
  },
  events: {
    title: "Events & Festivals in Rodrigues Island",
    description:
      "What's on in Rodrigues right now: festivals, markets, live sega and local events, with dates and places. Updated by locals — plan your trip around them.",
  },
};

function pageMeta(
  title: string,
  description: string,
  category: string,
  fr?: string,
  image?: string,
): Metadata {
  const url = `${SITE_URL}/browse/${category}`;
  const images = [image ?? `${SITE_URL}/og-image.jpg`];
  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(fr
        ? {
            languages: {
              "en-US": url,
              "fr-FR": `${SITE_URL}${fr}`,
              "x-default": url,
            },
          }
        : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Roule Rodrigues",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;

  // Category-specific preview image, from the live fleet: a shared /browse/scooter
  // shows a scooter and /browse/car shows the Suzuki Swift — not one generic
  // photo for both. Non-vehicle categories fall back to the site OG image.
  let ogImage: string | undefined;
  let cats: ReturnType<typeof buildBrowseCategories> | null = null;
  // Hoisted out of the try: the title below needs the listings to price itself,
  // and a content read that half-failed must leave it null so the page falls
  // back to its plain title rather than to a price nobody honours.
  let listings: Parameters<typeof buildBrowseCategories>[0]["recommended"]["items"] | null = null;
  try {
    const { content, fleet, recentBookings } = await getFleetView();
    cats = buildBrowseCategories(content, fleet, recentBookings);
    listings = content.recommended.items;
    const first = fleet.find(
      (f) => (f.category ?? "scooter") === category && f.image,
    );
    if (first?.image)
      ogImage = first.image.startsWith("http")
        ? first.image
        : `${SITE_URL}${first.image}`;
  } catch {
    /* fall back to default image / no live cats */
  }

  const m = META[category];
  if (m) {
    // ── PRICE IN THE TITLE, THE WAY THE PAGES THAT SELL DO IT (M138) ───────
    //
    // "Location scooter Rodrigues dès Rs 699/jour" converts; "Where to Stay in
    // Rodrigues Island" does not. A price pre-qualifies the click: somebody who
    // sees Rs 1,000 and taps is a customer, and somebody who taps a priceless
    // title, meets Rs 7,000 and leaves teaches the ranking that this result did
    // not answer the question.
    //
    // Only for the place categories, and only when the listings actually carry
    // a price. The vehicle categories already say it in their French siblings,
    // and a category with nothing priced keeps its plain title rather than
    // inventing a figure to look consistent.
    const placeFilter = PLACE_SLUGS[category]?.filter ?? null;
    const from =
      placeFilter !== null && listings !== null
        ? fromPriceOf(listings.filter(placeFilter))
        : null;
    const title = from
      ? `${m.title} from Rs ${from.toLocaleString("en-US")}`
      : m.title;
    return pageMeta(
      `${title} | Roule Rodrigues`,
      from ? `${m.description} From Rs ${from.toLocaleString("en-US")}.` : m.description,
      category,
      m.fr,
      ogImage,
    );
  }

  // Not in the curated map — it may still be a real category the owner added in
  // admin (e.g. "Kayaks"). Use its live label so it gets a unique title rather
  // than colliding with every other page on a generic one.
  const cat = cats?.find((c) => c.slug === category);
  if (cat) {
    return pageMeta(
      `${cat.label} in Rodrigues Island | Roule Rodrigues`,
      `${cat.label} in Rodrigues, available to book directly with local owners. See photos, prices and availability on Roule Rodrigues.`,
      category,
      undefined,
      ogImage,
    );
  }

  // Genuinely unknown slug → this renders the not-found page, so don't hand
  // Google a canonical for a URL that isn't a real page.
  return {
    title: "Page not found | Roule Rodrigues",
    robots: { index: false, follow: false },
  };
}

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  // Restaurants are handled by the WhatsApp food concierge, not a listing.
  if (category === "restaurants") redirect("/food");
  // Events are handled by /events, which sells the tickets AND now lists the
  // owner's free-text "What's on" notices underneath. This page was the second
  // thing called Events, and it called notFound() whenever the notice list was
  // empty — so an Events link could land on "Lost on the island".
  if (category === "events") redirect("/events");
  const { content, fleet, ratings, recentBookings, businessWhatsApp } =
    await getFleetView();
  const cats = buildBrowseCategories(content, fleet, recentBookings);

  // The rental terms shown beside the booking form AND described in the
  // FAQPage markup below. One call, so the structured data can never claim a
  // question the visible panel does not render — which is the exact thing
  // Google's FAQ guideline forbids, and the exact thing that happens when two
  // lists are maintained separately.
  const conditionItems = pickConditions(content.faq?.items);

  // Breadcrumb trail (Home › This page) + the listing itself, so Google shows
  // a real trail under the result instead of a bare URL.
  const seo = (label: string, items: { name: string }[]) => (
    <JsonLd
      data={[
        breadcrumbLd([
          { name: "Home", url: SITE_URL },
          { name: label, url: `${SITE_URL}/browse/${category}` },
        ]),
        itemListLd(label, items),
        // ── FAQPage, and only now that it is honest ────────────────────────
        //
        // Google requires the questions and answers to be VISIBLE on the page
        // carrying this markup — schema for content a visitor cannot read is
        // exactly what the guideline exists to stop. Until RentalConditions
        // landed there was nothing to point at here, which is why FAQPage was
        // live on twelve guide pages and zero conversion pages.
        //
        // Same source as the panel, so the two can never disagree: if the owner
        // edits an answer in admin, the visible text and the structured data
        // move together.
        ...(conditionItems.length
          ? [
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "@id": `${SITE_URL}/browse/${category}#faq`,
                mainEntity: conditionItems.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: { "@type": "Answer", text: f.answer },
                })),
              },
            ]
          : []),
      ]}
    />
  );

  // App-style top bar (back to Explore + page title + language). Replaces the
  // marketing navbar on this redesigned surface; the global BottomNav does the rest.
  const header = (title: string) => (
    <AppPageHeader title={title} backHref="/#explore" />
  );
  const footer = (
    <>
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
    </>
  );

  // ── Vehicles (scooters / cars / other) ──
  const vcat = content.vehicleCategories.find(
    (c) => c.id === category && c.enabled,
  );
  if (vcat) {
    const items = fleet.filter((f) => (f.category ?? "scooter") === vcat.id);
    if (items.length === 0) notFound();
    return (
      <>
        {seo(
          vcat.label,
          items.map((i) => ({ name: i.name })),
        )}
        {/* The vehicles are rendered on THIS page, so this is where their
            Product markup belongs — with real ratings where reviews exist. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": items.map((s) =>
              productLd({
                name: s.name,
                description: s.description,
                image: s.image
                  ? s.image.startsWith("http")
                    ? s.image
                    : `${SITE_URL}${s.image}`
                  : undefined,
                price: priceNumber(s.price),
                available: !(s.available === false || s.soldOutToday),
                url: `${SITE_URL}/browse/${category}`,
                rating: ratings[s.id],
                category: s.category ?? "scooter",
              }),
            ),
          }}
        />
        {header(vcat.label)}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          {/* The scooter price-value banner was removed from this booking page to
              keep it focused on the fleet. Its content lives, server-rendered in
              French for SEO, on /fr/location-scooter-rodrigues (hreflang-paired). */}
          <Fleet
            fleet={items}
            categories={content.vehicleCategories}
            ratings={ratings}
            recentBookings={recentBookings}
            whatsapp={businessWhatsApp}
            eyebrow="OUR FLEET"
            title={vcat.label}
            subtitle={`Browse our ${vcat.label.toLowerCase()}, then tap Book to choose your dates.`}
          />
          {/* Trust signals immediately before the form that asks for money.
              This page previously carried NONE — no guarantee, no support
              promise, no reason to believe the transaction is safe — while
              TrustBar sat in the codebase with zero importers. Every claim
              here is already true elsewhere on the site (a free helmet is in
              t.booking.included; the 3+/7+ day discounts are in
              lib/booking-pricing), so nothing new is being promised. */}
          <TrustBar />
          <BookingSection
            fleet={items}
            categories={content.vehicleCategories}
            whatsapp={businessWhatsApp}
            /* The rental terms the customer needs BEFORE committing — age,
               licence, insurance, fuel — read from the FAQ the owner already
               maintains. Verified absent from this page: "licence" and
               "deposit" each appeared zero times in the live HTML. */
            conditions={conditionItems}
          />
        </main>
        {footer}
      </>
    );
  }

  // ── Places (restaurants / activities / tours / stays) ──
  const place = PLACE_SLUGS[category];
  if (place) {
    const items = content.recommended.items.filter(place.filter);
    if (items.length === 0) notFound();
    return (
      <>
        {seo(
          place.label,
          items.map((i) => ({ name: i.name })),
        )}
        {/* ── THE PRICE, WHERE A MACHINE CAN READ IT (M137) ─────────────────
            This branch serves stays, activities and tours, and emitted a
            breadcrumb and a list of names — while the page's own description
            promises "See photos and prices". So the prices were on the screen
            and nowhere in the markup: no rich result, and nothing for an
            assistant asked "where can I stay on Rodrigues and what does it
            cost" to quote.

            Typed by what the thing actually is. A guesthouse is a
            LodgingBusiness somebody sleeps in; a boat trip is a Service nobody
            takes home. A listing with no price set carries none rather than a
            zero — free and unpriced are different claims. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": items.map((i) => {
              const image = i.image
                ? i.image.startsWith("http")
                  ? i.image
                  : `${SITE_URL}${i.image}`
                : undefined;
              const price =
                typeof i.depositAmount === "number" && i.depositAmount > 0
                  ? i.depositAmount
                  : null;
              const url = `${SITE_URL}/browse/${category}`;
              return i.category === "hotel"
                ? stayLd({ name: i.name, price, description: i.description, image, url })
                : experienceLd({
                    name: i.name,
                    price,
                    description: i.description,
                    image,
                    url,
                    providerName: i.providerName ?? null,
                    durationMinutes:
                      typeof i.durationMinutes === "number" ? i.durationMinutes : null,
                  });
            }),
          }}
        />
        {header(place.label)}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          <RecommendedPlaces
            content={{
              enabled: true,
              title: place.label,
              subtitle: content.recommended.subtitle,
              items,
            }}
            whatsapp={businessWhatsApp}
          />
        </main>
        {footer}
      </>
    );
  }

  // ── Getting around (taxis + transport, no bus) ──
  if (category === "getting-around") {
    const ga = content.gettingAround;
    if (!ga?.enabled || (ga.options ?? []).length === 0) notFound();
    const opts = (ga.options ?? []).filter((o) => o.icon !== "bus");
    return (
      <>
        {seo(
          "Getting around",
          opts.map((o) => ({ name: o.title })),
        )}
        {header("Getting around")}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          <GettingAround content={{ ...ga, options: opts }} />
        </main>
        {footer}
      </>
    );
  }

  notFound();
}
