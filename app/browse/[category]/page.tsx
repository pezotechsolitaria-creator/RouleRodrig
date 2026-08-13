import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, productLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import AppPageHeader from "@/components/AppPageHeader";
import BrowseTabs from "@/components/BrowseTabs";
import Fleet from "@/components/Fleet";
import TrustBar from "@/components/TrustBar";
import BookingSection from "@/components/BookingSection";
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
const PLACE_SLUGS: Record<string, { label: string; filter: (p: Place) => boolean }> = {
  restaurants: { label: "Restaurants", filter: (p) => p.category === "restaurant" },
  activities: { label: "Activities", filter: (p) => p.category === "activity" && !p.isTour },
  tours: { label: "Guided Tours", filter: (p) => p.category === "activity" && !!p.isTour },
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
const META: Record<string, { title: string; description: string; fr?: string }> = {
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
  },
  stays: {
    title: "Where to Stay in Rodrigues Island",
    description:
      "Guesthouses, lodges and hotels across Rodrigues, recommended by locals. See photos and prices, then book directly with the owner — no booking fees.",
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
    openGraph: { title, description, url, siteName: "Roule Rodrigues", type: "website", images },
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
  try {
    const { content, fleet, recentBookings } = await getFleetView();
    cats = buildBrowseCategories(content, fleet, recentBookings);
    const first = fleet.find((f) => (f.category ?? "scooter") === category && f.image);
    if (first?.image) ogImage = first.image.startsWith("http") ? first.image : `${SITE_URL}${first.image}`;
  } catch {
    /* fall back to default image / no live cats */
  }

  const m = META[category];
  if (m) return pageMeta(`${m.title} | Roule Rodrigues`, m.description, category, m.fr, ogImage);

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
  return { title: "Page not found | Roule Rodrigues", robots: { index: false, follow: false } };
}

export default async function BrowsePage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  // Restaurants are handled by the WhatsApp food concierge, not a listing.
  if (category === "restaurants") redirect("/food");
  // Events are handled by /events, which sells the tickets AND now lists the
  // owner's free-text "What's on" notices underneath. This page was the second
  // thing called Events, and it called notFound() whenever the notice list was
  // empty — so an Events link could land on "Lost on the island".
  if (category === "events") redirect("/events");
  const { content, fleet, ratings, recentBookings, businessWhatsApp } = await getFleetView();
  const cats = buildBrowseCategories(content, fleet, recentBookings);

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
      ]}
    />
  );

  // App-style top bar (back to Explore + page title + language). Replaces the
  // marketing navbar on this redesigned surface; the global BottomNav does the rest.
  const header = (title: string) => <AppPageHeader title={title} backHref="/#explore" />;
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
  const vcat = content.vehicleCategories.find((c) => c.id === category && c.enabled);
  if (vcat) {
    const items = fleet.filter((f) => (f.category ?? "scooter") === vcat.id);
    if (items.length === 0) notFound();
    return (
      <>
        {seo(vcat.label, items.map((i) => ({ name: i.name })))}
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
          <BrowseTabs categories={cats} active={category} stickyTop="top-[56px]" />
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
        {seo(place.label, items.map((i) => ({ name: i.name })))}
        {header(place.label)}
        <main>
          <BrowseTabs categories={cats} active={category} stickyTop="top-[56px]" />
          <RecommendedPlaces
            content={{ enabled: true, title: place.label, subtitle: content.recommended.subtitle, items }}
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
        {seo("Getting around", opts.map((o) => ({ name: o.title })))}
        {header("Getting around")}
        <main>
          <BrowseTabs categories={cats} active={category} stickyTop="top-[56px]" />
          <GettingAround content={{ ...ga, options: opts }} />
        </main>
        {footer}
      </>
    );
  }

  notFound();
}
