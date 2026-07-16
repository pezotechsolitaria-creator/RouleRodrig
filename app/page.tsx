import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { organizationLd, touristDestinationLd } from "@/lib/schema";
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
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd({ logo: `${SITE_URL}/icon-192.png`, sameAs: sameAs as string[] }),
      touristDestinationLd(),
      {
        "@type": "LocalBusiness",
        "@id": `${SITE_URL}/#business`,
        name: "Roule Rodrigues",
        description:
          "Vehicle rentals and island experiences on Rodrigues — scooters, cars, restaurants, activities and local transport. Helmet included, flexible hours, local support.",
        url: SITE_URL,
        image: `${SITE_URL}/og-image.jpg`,
        priceRange: "Rs",
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
        <Hero hero={content.hero} />
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
