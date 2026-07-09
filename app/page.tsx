import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { getPrivileged } from "@/lib/supabase/admin";
import { isActiveHold } from "@/lib/holds";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import PromoCarousel from "@/components/PromoCarousel";
import Fleet from "@/components/Fleet";
import TrustBar from "@/components/TrustBar";
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
import ScrollProgress from "@/components/ScrollProgress";

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
      .select("scooter, status, created_at")
      .in("status", ["pending", "confirmed"])
      .lte("start_date", todayIsland)
      .gte("end_date", todayIsland);
    for (const b of data ?? []) {
      if (!isActiveHold(b)) continue; // ignore expired pending holds
      heldToday[b.scooter] = (heldToday[b.scooter] ?? 0) + 1;
    }
  } catch {
    /* availability is best-effort — never block the page on it */
  }
  // ── Honest social proof: real bookings per scooter in the last 7 days ──
  // Only surfaced on cards when genuinely meaningful (≥2). Never fabricated.
  const recentBookings: Record<string, number> = {};
  try {
    const supabase = await getPrivileged();
    const sevenAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data } = await supabase
      .from("bookings")
      .select("scooter, created_at, status")
      .gte("created_at", sevenAgo)
      .neq("status", "cancelled");
    for (const b of data ?? []) {
      if (!b.scooter) continue;
      recentBookings[b.scooter] = (recentBookings[b.scooter] ?? 0) + 1;
    }
  } catch {
    /* social proof is best-effort */
  }

  const fleet = content.fleet.map((s) => {
    const activeUnits = (s.assets ?? []).filter((a) => a.active !== false).length;
    const capacity = activeUnits > 0 ? activeUnits : Math.max(1, s.units ?? 1);
    return { ...s, soldOutToday: (heldToday[s.id] ?? 0) >= capacity };
  });

  // ── Real star ratings per scooter (from APPROVED reviews only) ──
  const ratings: Record<string, { avg: number; count: number }> = {};
  try {
    const supabase = await getPrivileged();
    const { data } = await supabase
      .from("product_reviews")
      .select("scooter_id, rating")
      .eq("status", "approved");
    const acc: Record<string, { sum: number; count: number }> = {};
    for (const r of data ?? []) {
      const id = r.scooter_id as string | null;
      const rating = Number(r.rating);
      if (!id || !Number.isFinite(rating)) continue;
      acc[id] = { sum: (acc[id]?.sum ?? 0) + rating, count: (acc[id]?.count ?? 0) + 1 };
    }
    for (const [id, v] of Object.entries(acc)) {
      ratings[id] = { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count };
    }
  } catch {
    /* ratings are best-effort */
  }

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
        <PromoCarousel slides={content.promoSlides} />
        <Fleet fleet={fleet} categories={content.vehicleCategories} ratings={ratings} recentBookings={recentBookings} whatsapp={businessWhatsApp} />
        <TrustBar />
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
        <Gallery gallery={content.gallery} enabled={content.galleryEnabled !== false} />
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
