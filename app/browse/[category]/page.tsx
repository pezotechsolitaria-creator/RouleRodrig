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

// ISR (see app/page.tsx). The per-vehicle booking calendar is client-fetched,
// so availability there stays live; card badges can be up to ~60s behind.
export const revalidate = 60;

// Special (non-vehicle) place categories → which items render on each page.
// Activities and Guided Tours share the "activity" category, split by isTour.
type Place = { category: string; isTour?: boolean };
const PLACE_SLUGS: Record<string, { label: string; filter: (p: Place) => boolean }> = {
  restaurants: { label: "Restaurants", filter: (p) => p.category === "restaurant" },
  activities: { label: "Activities", filter: (p) => p.category === "activity" && !p.isTour },
  tours: { label: "Guided Tours", filter: (p) => p.category === "activity" && !!p.isTour },
  stays: { label: "Stays", filter: (p) => p.category === "hotel" },
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

  // ── Places (restaurants / activities / tours / stays) ──
  const place = PLACE_SLUGS[category];
  if (place) {
    const items = content.recommended.items.filter(place.filter);
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
