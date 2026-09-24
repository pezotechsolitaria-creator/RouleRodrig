import type { Metadata } from "next";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import Navbar from "@/components/Navbar";
import BrowseTabs from "@/components/BrowseTabs";
import BrowseBackBar from "@/components/BrowseBackBar";
import FoodConcierge from "@/components/FoodConcierge";
import ScrollToTop from "@/components/ScrollToTop";
import { ogImages } from "@/lib/share-image";

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
  title: "Food Concierge — Where to Eat on Rodrigues",
  description:
    "Tell our local food concierge what you fancy on WhatsApp and we'll recommend the perfect spot and book your table — fresh seafood, Creole home cooking and hidden gems. Free to use.",
  alternates: { canonical: `${SITE_URL}/food/concierge` },
  // ── IT WAS ADVERTISING SCOOTER RENTAL ──────────────────────────────────
  //
  // With no openGraph of its own the root layout supplied the whole preview,
  // so this page shared as "Roule Rodrigues | Vehicle Rentals & Island
  // Experiences" over the homepage hero photo. This is the page /food
  // redirects to when the catalogue is empty, it is the one food product with
  // signed restaurant partners, and its entire distribution is somebody
  // pasting the link into WhatsApp.
  openGraph: {
    title: "Food Concierge — Where to Eat on Rodrigues",
    description:
      "Tell our local food concierge what you fancy on WhatsApp and we'll recommend the perfect spot and book your table.",
    url: `${SITE_URL}/food/concierge`,
    images: ogImages("Food concierge — where to eat on Rodrigues"),
  },
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
