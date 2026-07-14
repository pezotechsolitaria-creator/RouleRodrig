import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
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
import BackToExplore from "@/components/BackToExplore";
import TiRouleGuide from "@/components/TiRouleGuide";

// ISR: serve a cached page for instant repeat loads, regenerate every 60s.
// Live booking-calendar availability is fetched client-side, so it stays fresh;
// only the "sold out today" card badge can be up to ~60s behind.
export const revalidate = 60;

function priceNumber(price: string): number | null {
  const m = price.match(/[\d,]+/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function Home() {
  const { content, fleet, reviews, recentBookings } = await getFleetView();

  // "What are you looking for?" categories (shared with the /browse pages).
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  // ── SEO structured data (JSON-LD): LocalBusiness + Products ──
  const sameAs = [content.social.instagram, content.social.facebook, content.social.tiktok].filter((u) => u && u.trim());
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
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
      ...fleet.map((s) => {
        const price = priceNumber(s.price);
        return {
          "@type": "Product",
          name: s.name,
          description: s.description,
          ...(s.image ? { image: s.image.startsWith("http") ? s.image : `${SITE_URL}${s.image}` } : {}),
          ...(price
            ? {
                offers: {
                  "@type": "Offer",
                  price,
                  priceCurrency: "MUR",
                  availability:
                    s.available === false || s.soldOutToday
                      ? "https://schema.org/OutOfStock"
                      : "https://schema.org/InStock",
                  url: `${SITE_URL}/browse/${s.category ?? "scooter"}`,
                },
              }
            : {}),
        };
      }),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
      <BackToExplore />
      <TiRouleGuide image={content.branding.mascotImage} />
    </>
  );
}
