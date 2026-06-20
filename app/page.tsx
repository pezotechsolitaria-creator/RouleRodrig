import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { getPrivileged } from "@/lib/supabase/admin";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import Fleet from "@/components/Fleet";
import Experience from "@/components/Experience";
import Pricing from "@/components/Pricing";
import WhyUs from "@/components/WhyUs";
import TripPlanner from "@/components/TripPlanner";
import BookingSection from "@/components/BookingSection";
import MapSection from "@/components/MapSection";
import GettingAround from "@/components/GettingAround";
import RideRoutes from "@/components/RideRoutes";
import Events from "@/components/Events";
import UsefulNumbers from "@/components/UsefulNumbers";
import MarketplaceSection from "@/components/MarketplaceSection";
import RecommendedPlaces from "@/components/RecommendedPlaces";
import Gallery from "@/components/Gallery";
import Testimonials from "@/components/Testimonials";
import ReviewsSection from "@/components/ReviewsSection";
import Faq from "@/components/Faq";
import WaitlistSection from "@/components/WaitlistSection";
import BookingCTA from "@/components/BookingCTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import Sponsors from "@/components/Sponsors";
import WhatsAppButton from "@/components/WhatsAppButton";

export const dynamic = "force-dynamic";

function priceNumber(price: string): number | null {
  const m = price.match(/[\d,]+/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default async function Home() {
  const content = await getContent();

  // ── Live fleet availability ──────────────────────────────────────────
  // A model is "sold out today" when every unit it owns is already out on an
  // active (pending or confirmed) booking that covers today. Computed per
  // request so the fleet reflects real stock with no admin editing.
  const todayIsland = new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(0, 10); // Rodrigues = UTC+4
  const heldToday: Record<string, number> = {};
  try {
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("bookings")
      .select("scooter")
      .in("status", ["pending", "confirmed"])
      .lte("start_date", todayIsland)
      .gte("end_date", todayIsland);
    for (const b of data ?? []) heldToday[b.scooter] = (heldToday[b.scooter] ?? 0) + 1;
  } catch {
    /* availability is best-effort — never block the page on it */
  }
  const fleet = content.fleet.map((s) => ({
    ...s,
    soldOutToday: (heldToday[s.id] ?? 0) >= Math.max(1, s.units ?? 1),
  }));

  // ── SEO structured data (JSON-LD): LocalBusiness + Products ──
  const sameAs = [
    content.social.instagram,
    content.social.facebook,
    content.social.tiktok,
  ].filter((u) => u && u.trim());

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": `${SITE_URL}/#business`,
        name: "Roule Rodrigues",
        description:
          "Premium scooter rentals on Rodrigues Island — Suzuki Burgman 125 and Avenis 125. Helmet included, flexible hours, local support.",
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
          brand: { "@type": "Brand", name: "Suzuki" },
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
                  url: `${SITE_URL}/#booking`,
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

  // Business WhatsApp number for the one-tap booking confirmation
  const businessWhatsApp =
    content.social.whatsapp ||
    content.contact.whatsappNumbers?.[0]?.number ||
    content.contact.phone ||
    "";

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        <Navbar
          branding={content.branding}
          announcementActive={false}
          showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        />
        <Hero hero={content.hero} />
        <Stats stats={content.stats} />
        <Fleet fleet={fleet} categories={content.vehicleCategories} />
        <Experience content={content.experience} />
        <Pricing pricing={content.pricing} />
        <WhyUs />
        <TripPlanner />
        <BookingSection fleet={fleet} whatsapp={businessWhatsApp} />
        <MapSection locations={content.mapLocations} />
        <GettingAround content={content.gettingAround} />
        <RideRoutes routes={content.rideRoutes} />
        <Events events={content.events} />
        <MarketplaceSection />
        <RecommendedPlaces content={content.recommended} whatsapp={businessWhatsApp} />
        <UsefulNumbers contacts={content.usefulContacts} />
        <Gallery gallery={content.gallery} />
        <Testimonials testimonials={content.testimonials} />
        <ReviewsSection fleet={fleet} />
        <Faq content={content.faq} />
        <WaitlistSection />
        <BookingCTA />
        <Contact contact={content.contact} fleet={fleet} />
        <Sponsors enabled={content.sponsorsEnabled} sponsors={content.sponsors} />
        <Footer social={content.social} branding={content.branding} />
      </main>
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
    </>
  );
}
