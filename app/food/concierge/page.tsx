import type { Metadata } from "next";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import Navbar from "@/components/Navbar";
import BrowseTabs from "@/components/BrowseTabs";
import BrowseBackBar from "@/components/BrowseBackBar";
import FoodConcierge from "@/components/FoodConcierge";
import ScrollToTop from "@/components/ScrollToTop";

// The WhatsApp food concierge — moved here from /food, not retired.
//
// ── WHY IT SURVIVES THE REDESIGN ───────────────────────────────────────────
// /food is now an ORDERING engine: pick a dish, pay, collect. This page answers
// a completely different question — "where should we eat tonight, and can you
// get us a table?" — which no catalog can answer, because the value is a local
// making a phone call on the visitor's behalf. It also has signed restaurant
// partners behind it (the partner kit), so deleting it would throw away a live
// commercial relationship in exchange for a tidier route table.
//
// Two products, two surfaces, one link between them at the bottom of /food.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Food Concierge — Find & book the best places to eat on Rodrigues",
  description:
    "Tell our local food concierge what you fancy on WhatsApp and we'll recommend the perfect spot and book your table — fresh seafood, Creole home cooking and hidden gems. Free to use.",
  alternates: { canonical: `${SITE_URL}/food/concierge` },
};

export default async function FoodConciergePage() {
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
        <BrowseBackBar title="Food Concierge" />
        <BrowseTabs categories={cats} active="food" />
        <FoodConcierge content={content.foodConcierge} fallbackWhatsApp={businessWhatsApp} />
      </main>
      <ScrollToTop />
    </>
  );
}
