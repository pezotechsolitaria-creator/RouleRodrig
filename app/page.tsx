import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { organizationLd, touristDestinationLd, websiteLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Hero from "@/components/Hero";
import AppHome from "@/components/AppHome";
import ReviewsContact from "@/components/ReviewsContact";
import Footer from "@/components/Footer";
import TiRouleGuide from "@/components/TiRouleGuide";

// ISR: serve a cached page for instant repeat loads, regenerate every 60s.
// Live booking-calendar availability is fetched client-side, so it stays fresh;
// only the "sold out today" card badge can be up to ~60s behind.
export const revalidate = 60;

// Hub slug → the service name Google should understand. The tile label alone
// ("Scooters", "Stay") reads as a noun, not a service, in a search result.
// Anything not listed falls back to its own label, so a category the owner adds
// in admin still appears rather than vanishing.
const SERVICE_NAME: Record<string, string> = {
  scooter: "Scooter rental",
  car: "Car rental",
  food: "WhatsApp food concierge",
  stays: "Places to stay",
  activities: "Activities & experiences",
  tours: "Guided island tours",
  "getting-around": "Taxis & island transport",
  events: "Local events guide",
};

// The free tools that live on this page but aren't hub tiles, so they'd
// otherwise be invisible to Google — which is exactly why its AI Overview
// described us as nothing but a scooter platform.
const FREE_TOOLS = [
  { name: "Rodrigues Island travel guide", href: "/guide/rodrigues" },
  { name: "Rodrigues trip planner", href: "/trip-planner" },
  { name: "Interactive island map — beaches & viewpoints", href: "/guide/beaches" },
  { name: "Ti Roulé — AI island guide (English, French, Creole)", href: "/guide/rodrigues" },
];

export default async function Home() {
  const { content, fleet, recentBookings } = await getFleetView();

  // "What are you looking for?" categories (shared with the /browse pages).
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  // App-home rails, built from real content only (no invented ratings/prices).
  const experiences = content.recommended.items
    .filter((p) => p.category === "activity" && (p.image || ""))
    .map((p) => ({ id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null, href: p.isTour ? "/browse/tours" : "/browse/activities" }));
  const stays = content.recommended.items
    .filter((p) => p.category === "hotel" && (p.image || ""))
    .map((p) => ({ id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null, href: "/browse/stays" }));
  const discover = content.mapLocations
    .filter((l) => (l.image || l.images?.[0]) && l.story && ["beach", "viewpoint", "landmark"].includes(l.category))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      name: l.name,
      image: l.image ?? l.images?.[0],
      href: l.category === "beach" ? `/guide/beaches#${l.id}` : l.category === "viewpoint" ? `/guide/viewpoints#${l.id}` : "/map",
      tag: l.category,
    }));

  // Cheapest scooter/day (MUR) — lets Ti Roulé relate a budget to real rental days.
  const scooterPrices = fleet
    .filter((f) => (f.category ?? "scooter") === "scooter")
    .map((f) => priceNumber(f.price))
    .filter((n): n is number => n != null && n > 0);
  const scooterDailyMur = scooterPrices.length ? Math.min(...scooterPrices) : undefined;

  // Per-card image galleries so the homepage cards auto-cycle through the real
  // photos of each category's contents (all scooters, all cars, all stays…).
  const galleryOf = (items: { image?: string; images?: string[] }[]) =>
    items.flatMap((it) => (it.images?.length ? it.images : it.image ? [it.image] : [])).filter((s): s is string => !!s).slice(0, 6);
  const cardImages = {
    scooter: galleryOf(fleet.filter((f) => (f.category ?? "scooter") === "scooter")),
    car: galleryOf(fleet.filter((f) => f.category === "car")),
    stays: galleryOf(content.recommended.items.filter((p) => p.category === "hotel")),
    exp: galleryOf(content.recommended.items.filter((p) => p.category === "activity")),
  };

  // ── SEO structured data (JSON-LD) ──
  // Only describes what this page actually SHOWS: the business, the island
  // (the hub + map + planner are all about Rodrigues) and the visible FAQ.
  // Per-vehicle Product markup lives on /browse/[category], where the vehicles
  // are really rendered — marking up off-page content gets it ignored.
  const sameAs = [content.social.instagram, content.social.facebook, content.social.tiktok].filter((u) => u && u.trim());

  // Real daily rates, straight from the fleet. Google's AI Overview was quoting
  // a competitor's "Rs 800/day" for us because we never stated our own price in
  // a machine-readable way — "Rs" as a priceRange says nothing. The hub tiles
  // already show "From Rs 599/day" on this page, so this matches what's visible.
  const dayRates = fleet.map((f) => priceNumber(f.price)).filter((n): n is number => n != null && n > 0);
  const priceRange = dayRates.length
    ? `Rs ${Math.min(...dayRates).toLocaleString("en-US")}–${Math.max(...dayRates).toLocaleString("en-US")} per day`
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd({ logo: `${SITE_URL}/icon-192.png`, sameAs: sameAs as string[] }),
      // Names the site "Roule Rodrigues" in results instead of falling back to
      // the domain (which is why it used to read "Vercel").
      websiteLd(),
      touristDestinationLd(),
      {
        // AutoRental, not bare LocalBusiness: it's the schema.org type that
        // literally means "vehicle rental company", and it inherits everything
        // LocalBusiness gives us. Being specific is how Google resolves what
        // kind of entity this is instead of inferring it from prose.
        "@type": "AutoRental",
        "@id": `${SITE_URL}/#business`,
        name: "Roule Rodrigues",
        // This sentence is what Google's AI Overview paraphrases when someone
        // asks "what is Roule Rodrigues". The old one said scooters, cars and
        // restaurants — so the AI called us "une plateforme de location de
        // scooters" and stopped there. Everything named here is real and
        // reachable from this page's hub.
        description:
          "Roule Rodrigues rents scooters and cars on Rodrigues Island, direct from local owners, from Rs 599 a day with no minimum rental. It is also a free island guide: a trip planner, an interactive map of beaches and viewpoints, recommended places to stay and things to do, a WhatsApp food concierge that books your table, and Ti Roulé — an AI island guide answering in English, French and Creole.",
        knowsLanguage: ["en", "fr", "mfe"],
        url: SITE_URL,
        image: `${SITE_URL}/og-image.jpg`,
        ...(priceRange ? { priceRange } : {}),
        currenciesAccepted: "MUR",
        ...(content.contact.phone ? { telephone: content.contact.phone } : {}),
        address: {
          "@type": "PostalAddress",
          addressLocality: "Port Mathurin",
          addressRegion: "Rodrigues",
          addressCountry: "MU",
        },
        geo: { "@type": "GeoCoordinates", latitude: -19.6833, longitude: 63.4167 },
        areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
        ...(sameAs.length ? { sameAs } : {}),
        // Built from the live hub tiles + the free tools that are actually on
        // this page, so it can never claim a service we don't offer — and a
        // category the owner adds in admin shows up here on its own.
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Roule Rodrigues services",
          itemListElement: [
            ...browseCats.map((c) => ({
              "@type": "Offer",
              itemOffered: {
                "@type": "Service",
                name: SERVICE_NAME[c.slug] ?? c.label,
                url: `${SITE_URL}${c.href ?? `/browse/${c.slug}`}`,
                areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
              },
            })),
            ...FREE_TOOLS.map((s) => ({
              "@type": "Offer",
              price: 0,
              priceCurrency: "MUR",
              itemOffered: { "@type": "Service", name: s.name, url: `${SITE_URL}${s.href}` },
            })),
          ],
        },
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <AppHome
        hero={<Hero hero={content.hero} compact />}
        reviews={<ReviewsContact contact={content.contact} fleet={fleet} />}
        footer={<Footer social={content.social} branding={content.branding} />}
        experiences={experiences}
        stays={stays}
        discover={discover}
        cardImages={cardImages}
        mascot={content.branding.mascotImage}
        logo={content.branding.logo}
      />
      {/* Ti Roulé lives in the app nav, so hide its floating orb. */}
      <TiRouleGuide
        hideFab
        image={content.branding.mascotImage}
        poses={content.branding.mascotPoses}
        whatsapp={content.contact.whatsappNumbers?.[0]?.number || content.social.whatsapp || content.contact.phone}
        scooterDailyMur={scooterDailyMur}
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
}
