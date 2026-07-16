import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { organizationLd, touristDestinationLd, websiteLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import WhatLookingFor from "@/components/WhatLookingFor";
import TripPlanner from "@/components/TripPlanner";
import MapSection from "@/components/MapSection";
import RideRoutes from "@/components/RideRoutes";
import UsefulNumbers from "@/components/UsefulNumbers";
import ReviewsMarquee from "@/components/ReviewsMarquee";
import ReviewsSection from "@/components/ReviewsSection";
import Faq from "@/components/Faq";
import Sponsors from "@/components/Sponsors";
import WaitlistSection from "@/components/WaitlistSection";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollProgress from "@/components/ScrollProgress";
import ScrollToTop from "@/components/ScrollToTop";
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
  { name: "Rodrigues trip planner", href: "/#trip-planner" },
  { name: "Interactive island map — beaches & viewpoints", href: "/guide/beaches" },
  { name: "Ti Roulé — AI island guide (English, French, Creole)", href: "/guide/rodrigues" },
];

export default async function Home() {
  const { content, fleet, reviews, recentBookings } = await getFleetView();

  // "What are you looking for?" categories (shared with the /browse pages).
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  // Cheapest scooter/day (MUR) — lets Ti Roulé relate a budget to real rental days.
  const scooterPrices = fleet
    .filter((f) => (f.category ?? "scooter") === "scooter")
    .map((f) => priceNumber(f.price))
    .filter((n): n is number => n != null && n > 0);
  const scooterDailyMur = scooterPrices.length ? Math.min(...scooterPrices) : undefined;

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
        "@type": "LocalBusiness",
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
      ...(content.faq.enabled && content.faq.items.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${SITE_URL}/#faq`,
              mainEntity: content.faq.items.map((f) => ({
                "@type": "Question",
                name: f.question,
                acceptedAnswer: { "@type": "Answer", text: f.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <ScrollProgress />
      <main>
        <Navbar
          branding={content.branding}
          announcementActive={false}
          showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
          showRoutes={content.rideRoutes.length > 0}
          showEvents={content.events.some((e) => e.title)}
        />
        {/* scooterDailyMur = cheapest scooter/day from the live fleet; the hero
            shows it so our price beats the island's Rs 800 story above the fold. */}
        <Hero hero={content.hero} fromPrice={scooterDailyMur} />
        <WhatLookingFor categories={browseCats} />
        <TripPlanner />
        <MapSection locations={content.mapLocations} />
        <Reveal><RideRoutes routes={content.rideRoutes} /></Reveal>
        <Reveal><UsefulNumbers contacts={content.usefulContacts} /></Reveal>
        <ReviewsMarquee reviews={reviews} />
        <Reveal><ReviewsSection fleet={fleet} /></Reveal>
        <Reveal><Sponsors enabled={content.sponsorsEnabled} sponsors={content.sponsors} /></Reveal>
        <Reveal><Faq content={content.faq} /></Reveal>
        <Reveal><WaitlistSection /></Reveal>
        <Reveal><Contact contact={content.contact} fleet={fleet} /></Reveal>
        <Footer social={content.social} branding={content.branding} />
      </main>
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
      <TiRouleGuide
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
