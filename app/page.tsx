import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import AnnouncementBar, { announcementMessages } from "@/components/AnnouncementBar";
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
import RideRoutes from "@/components/RideRoutes";
import Events from "@/components/Events";
import UsefulNumbers from "@/components/UsefulNumbers";
import MarketplaceSection from "@/components/MarketplaceSection";
import Gallery from "@/components/Gallery";
import Testimonials from "@/components/Testimonials";
import ReviewsSection from "@/components/ReviewsSection";
import WaitlistSection from "@/components/WaitlistSection";
import BookingCTA from "@/components/BookingCTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
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
      ...content.fleet.map((s) => {
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
                    s.available === false
                      ? "https://schema.org/OutOfStock"
                      : "https://schema.org/InStock",
                  url: `${SITE_URL}/#booking`,
                },
              }
            : {}),
        };
      }),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AnnouncementBar announcement={content.announcement} />
      <main>
        <Navbar
          branding={content.branding}
          announcementActive={content.announcement.active && announcementMessages(content.announcement).length > 0}
        />
        <Hero hero={content.hero} />
        <Stats stats={content.stats} />
        <Fleet fleet={content.fleet} categories={content.vehicleCategories} />
        <Experience />
        <Pricing pricing={content.pricing} />
        <WhyUs />
        <TripPlanner />
        <BookingSection fleet={content.fleet} />
        <MapSection locations={content.mapLocations} />
        <RideRoutes routes={content.rideRoutes} />
        <Events events={content.events} />
        <MarketplaceSection />
        <UsefulNumbers contacts={content.usefulContacts} />
        <Gallery gallery={content.gallery} />
        <Testimonials testimonials={content.testimonials} />
        <ReviewsSection fleet={content.fleet} />
        <WaitlistSection />
        <BookingCTA />
        <Contact contact={content.contact} fleet={content.fleet} />
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
