import { SITE_URL } from "@/lib/site";
import { getFleetView } from "@/lib/site-data";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import WhatLookingFor, { type BrowseCategory } from "@/components/WhatLookingFor";
import TripPlanner from "@/components/TripPlanner";
import MapSection from "@/components/MapSection";
import RideRoutes from "@/components/RideRoutes";
import UsefulNumbers from "@/components/UsefulNumbers";
import ReviewsSection from "@/components/ReviewsSection";
import Faq from "@/components/Faq";
import WaitlistSection from "@/components/WaitlistSection";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollProgress from "@/components/ScrollProgress";
import ScrollToTop from "@/components/ScrollToTop";

export const dynamic = "force-dynamic";

function priceNumber(price: string): number | null {
  const m = price.match(/[\d,]+/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

// First usable photo from a list of items (fleet / places / events).
function firstImage(items: { image?: string; images?: string[] }[]): string | undefined {
  for (const it of items) {
    const img = it.images?.[0] || it.image;
    if (img) return img;
  }
  return undefined;
}

export default async function Home() {
  const { content, fleet, ratings, recentBookings, businessWhatsApp } = await getFleetView();

  // ── "What are you looking for?" categories ──────────────────────────────
  // Vehicles (by enabled category) → places (restaurants/activities/stays) →
  // getting around → what's on. Only categories that actually have items show.
  const browseCats: BrowseCategory[] = [];
  for (const vc of content.vehicleCategories.filter((c) => c.enabled)) {
    const items = fleet.filter((f) => (f.category ?? "scooter") === vc.id);
    if (!items.length) continue;
    browseCats.push({ slug: vc.id, label: vc.label, image: firstImage(items), count: items.length });
  }
  if (content.recommended.enabled) {
    const rest = content.recommended.items.filter((p) => p.category === "restaurant");
    if (rest.length) browseCats.push({ slug: "restaurants", label: "Restaurants", image: firstImage(rest), emoji: "🍽️", count: rest.length });
    const act = content.recommended.items.filter((p) => p.category === "activity");
    if (act.length) browseCats.push({ slug: "activities", label: "Activities", image: firstImage(act), emoji: "🤿", count: act.length });
    const stays = content.recommended.items.filter((p) => p.category === "hotel");
    if (stays.length) browseCats.push({ slug: "stays", label: "Stays", image: firstImage(stays), emoji: "🏝️", count: stays.length });
  }
  const gaOptions = (content.gettingAround?.options ?? []).filter((o) => o.icon !== "bus");
  if (content.gettingAround?.enabled && gaOptions.length) {
    browseCats.push({ slug: "getting-around", label: "Getting around", emoji: "🚕", count: gaOptions.length });
  }
  const events = content.events.filter((e) => e.title);
  if (events.length) {
    browseCats.push({ slug: "events", label: "What's on", image: firstImage(events), emoji: "🎉", count: events.length });
  }

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
        <RideRoutes routes={content.rideRoutes} />
        <UsefulNumbers contacts={content.usefulContacts} />
        <ReviewsSection fleet={fleet} />
        <Faq content={content.faq} />
        <WaitlistSection />
        <Contact contact={content.contact} fleet={fleet} />
        <Footer social={content.social} branding={content.branding} />
      </main>
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
    </>
  );
}
