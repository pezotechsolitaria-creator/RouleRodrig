import { notFound } from "next/navigation";
import { getFleetView, buildBrowseCategories } from "@/lib/site-data";
import Navbar from "@/components/Navbar";
import BrowseTabs from "@/components/BrowseTabs";
import Footer from "@/components/Footer";
import Fleet from "@/components/Fleet";
import BookingSection from "@/components/BookingSection";
import RecommendedPlaces from "@/components/RecommendedPlaces";
import GettingAround from "@/components/GettingAround";
import Events from "@/components/Events";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";
import BrowseBackBar from "@/components/BrowseBackBar";

export const dynamic = "force-dynamic";

// Special (non-vehicle) categories → which section renders them.
const PLACE_SLUGS: Record<string, { label: string; cat: "restaurant" | "activity" | "hotel" }> = {
  restaurants: { label: "Restaurants", cat: "restaurant" },
  activities: { label: "Activities", cat: "activity" },
  stays: { label: "Stays", cat: "hotel" },
};

export default async function BrowsePage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const { content, fleet, ratings, recentBookings, businessWhatsApp } = await getFleetView();
  const cats = buildBrowseCategories(content, fleet, recentBookings);

  const nav = (
    <Navbar
      branding={content.branding}
      announcementActive={false}
      showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
      showRoutes={content.rideRoutes.length > 0}
      showEvents={content.events.some((e) => e.title)}
    />
  );
  const footer = (
    <>
      <Footer social={content.social} branding={content.branding} />
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
    </>
  );

  // ── Vehicles (scooters / cars / other) ──
  const vcat = content.vehicleCategories.find((c) => c.id === category && c.enabled);
  if (vcat) {
    const items = fleet.filter((f) => (f.category ?? "scooter") === vcat.id);
    if (items.length === 0) notFound();
    return (
      <>
        {nav}
        <main>
          <BrowseBackBar title={vcat.label} />
          <BrowseTabs categories={cats} active={category} />
          <Fleet
            fleet={items}
            categories={content.vehicleCategories}
            ratings={ratings}
            recentBookings={recentBookings}
            whatsapp={businessWhatsApp}
            eyebrow="OUR FLEET"
            title={vcat.label}
            subtitle={`Browse our ${vcat.label.toLowerCase()}, then tap Book to choose your dates.`}
          />
          <BookingSection fleet={items} whatsapp={businessWhatsApp} />
        </main>
        {footer}
      </>
    );
  }

  // ── Places (restaurants / activities / stays) ──
  const place = PLACE_SLUGS[category];
  if (place) {
    const items = content.recommended.items.filter((p) => p.category === place.cat);
    if (items.length === 0) notFound();
    return (
      <>
        {nav}
        <main>
          <BrowseBackBar title={place.label} />
          <BrowseTabs categories={cats} active={category} />
          <RecommendedPlaces
            content={{ enabled: true, title: place.label, subtitle: content.recommended.subtitle, items }}
            whatsapp={businessWhatsApp}
          />
        </main>
        {footer}
      </>
    );
  }

  // ── Getting around (taxis + transport, no bus) ──
  if (category === "getting-around") {
    const ga = content.gettingAround;
    if (!ga?.enabled || (ga.options ?? []).length === 0) notFound();
    return (
      <>
        {nav}
        <main>
          <BrowseBackBar title="Getting around" />
          <BrowseTabs categories={cats} active={category} />
          <GettingAround content={{ ...ga, options: (ga.options ?? []).filter((o) => o.icon !== "bus") }} />
        </main>
        {footer}
      </>
    );
  }

  // ── What's on (events) ──
  if (category === "events") {
    const events = content.events.filter((e) => e.title);
    if (events.length === 0) notFound();
    return (
      <>
        {nav}
        <main>
          <BrowseBackBar title="What's on" />
          <BrowseTabs categories={cats} active={category} />
          <Events events={content.events} />
        </main>
        {footer}
      </>
    );
  }

  notFound();
}
