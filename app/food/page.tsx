import type { Metadata } from "next";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
import Navbar from "@/components/Navbar";
import BrowseTabs from "@/components/BrowseTabs";
import BrowseBackBar from "@/components/BrowseBackBar";
import FoodConcierge from "@/components/FoodConcierge";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Food Concierge — Find & book the best places to eat on Rodrigues",
  description:
    "Tell our local food concierge what you fancy on WhatsApp and we'll recommend the perfect spot and book your table — fresh seafood, Creole home cooking and hidden gems. Free to use.",
  alternates: { canonical: "/food" },
};

export default async function FoodPage() {
  const { content, fleet, recentBookings, businessWhatsApp } = await getFleetView();
  const cats = buildBrowseCategories(content, fleet, recentBookings);

  return (
    <>
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main>
        <BrowseBackBar title="Food & Dining" />
        <BrowseTabs categories={cats} active="food" />
        <FoodConcierge content={content.foodConcierge} fallbackWhatsApp={businessWhatsApp} />
      </main>
      <Footer social={content.social} branding={content.branding} />
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
    </>
  );
}
