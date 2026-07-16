import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, productLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import Navbar from "@/components/Navbar";
import BrowseTabs from "@/components/BrowseTabs";
import Footer from "@/components/Footer";
import Fleet from "@/components/Fleet";
import BookingSection from "@/components/BookingSection";
import RecommendedPlaces from "@/components/RecommendedPlaces";
import GettingAround from "@/components/GettingAround";
import Events from "@/components/Events";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";
import BrowseBackBar from "@/components/BrowseBackBar";
import TiRouleGuide from "@/components/TiRouleGuide";

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
const META: Record<string, { title: string; description: string }> = {
  scooter: {
    title: "Scooter Rental in Rodrigues Island",
    description:
      "Rent a scooter in Rodrigues from local owners. Helmets included, island-wide pickup and real WhatsApp support. Compare models and book your dates online.",
  },
  car: {
    title: "Car Rental in Rodrigues Island",
    description:
      "Hire a car in Rodrigues for the family or a longer stay. Local owners, clear daily rates and island-wide pickup. Compare vehicles and book online.",
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
    title: "Getting Around Rodrigues Island",
    description:
      "How to get around Rodrigues: taxis, airport transfers, scooter and car hire. Local options with real prices and direct contacts.",
  },
  events: {
    title: "Events & Festivals in Rodrigues",
    description:
      "What's on in Rodrigues — festivals, markets, music and local events with dates and locations, kept up to date by locals on the island.",
  },
};

function pageMeta(title: string, description: string, category: string): Metadata {
  const url = `${SITE_URL}/browse/${category}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Roule Rodrigues", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;

  const m = META[category];
  if (m) return pageMeta(`${m.title} | Roule Rodrigues`, m.description, category);

  // Not in the curated map — it may still be a real category the owner added in
  // admin (e.g. "Kayaks"). Use its live label so it gets a unique title rather
  // than colliding with every other page on a generic one.
  try {
    const { content, fleet, recentBookings } = await getFleetView();
    const cat = buildBrowseCategories(content, fleet, recentBookings).find((c) => c.slug === category);
    if (cat) {
      return pageMeta(
        `${cat.label} in Rodrigues Island | Roule Rodrigues`,
        `${cat.label} in Rodrigues, available to book directly with local owners. See photos, prices and availability on Roule Rodrigues.`,
        category,
      );
    }
  } catch {
    /* fall through to the noindex default */
  }

  // Genuinely unknown slug → this renders the not-found page, so don't hand
  // Google a canonical for a URL that isn't a real page.
  return { title: "Page not found | Roule Rodrigues", robots: { index: false, follow: false } };
}

export default async function BrowsePage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  // Restaurants are handled by the WhatsApp food concierge, not a listing.
  if (category === "restaurants") redirect("/food");
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

  const nav = (
    <Navbar
      branding={content.branding}
      announcementActive={false}
      showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
      showRoutes={content.rideRoutes.length > 0}
      showEvents={content.events.some((e) => e.title)}
    />
  );
  const footer = (
    <>
      <Footer social={content.social} branding={content.branding} />
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
      <TiRouleGuide
        image={content.branding.mascotImage}
        poses={content.branding.mascotPoses}
        whatsapp={businessWhatsApp}
        data={{
          beaches: content.mapLocations
            .filter((l) => l.category === "beach")
            .slice(0, 3)
            .map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
          viewpoints: content.mapLocations
            .filter((l) => l.category === "viewpoint")
            .slice(0, 3)
            .map((l) => ({ name: l.name, nameFr: l.nameFr, nameCr: l.nameCr })),
        }}
      />
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
              }),
            ),
          }}
        />
        {nav}
        <main>
          <BrowseBackBar title={vcat.label} />
          <BrowseTabs categories={cats} active={category} />
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
          <BookingSection fleet={items} whatsapp={businessWhatsApp} />
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
        {nav}
        <main>
          <BrowseBackBar title={place.label} />
          <BrowseTabs categories={cats} active={category} />
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
        {nav}
        <main>
          <BrowseBackBar title="Getting around" />
          <BrowseTabs categories={cats} active={category} />
          <GettingAround content={{ ...ga, options: opts }} />
        </main>
        {footer}
      </>
    );
  }

  // ── What's on (events) ──
  if (category === "events") {
    const events = content.events.filter((e) => e.title);
    if (events.length === 0) notFound();
    return (
      <>
        {seo("What's on", events.map((e) => ({ name: e.title })))}
        {nav}
        <main>
          <BrowseBackBar title="What's on" />
          <BrowseTabs categories={cats} active={category} />
          <Events events={content.events} />
        </main>
        {footer}
      </>
    );
  }

  notFound();
}
