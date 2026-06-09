import { getContent } from "@/lib/content";
import AnnouncementBar from "@/components/AnnouncementBar";
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
import MarketplaceSection from "@/components/MarketplaceSection";
import Gallery from "@/components/Gallery";
import Testimonials from "@/components/Testimonials";
import ReviewsSection from "@/components/ReviewsSection";
import BookingCTA from "@/components/BookingCTA";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  const content = await getContent();

  return (
    <>
      <AnnouncementBar announcement={content.announcement} />
      <main>
        <Navbar branding={content.branding} />
        <Hero hero={content.hero} />
        <Stats stats={content.stats} />
        <Fleet fleet={content.fleet} />
        <Experience />
        <Pricing pricing={content.pricing} />
        <WhyUs />
        <TripPlanner />
        <BookingSection fleet={content.fleet} />
        <MapSection locations={content.mapLocations} />
        <RideRoutes routes={content.rideRoutes} />
        <MarketplaceSection />
        <Gallery gallery={content.gallery} />
        <Testimonials testimonials={content.testimonials} />
        <ReviewsSection fleet={content.fleet} />
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
