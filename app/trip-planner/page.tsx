import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import TripPlanner from "@/components/TripPlanner";
import { ogImages } from "@/lib/share-image";

// The AI trip planner moved off the homepage (now a lean action dashboard) to
// its own page, reached from the Quick Access strip and Ti Roulé.
export const revalidate = 3600;

const DESCRIPTION =
  "Plan your Rodrigues trip in seconds: pick your days and interests for a free day-by-day itinerary of beaches and viewpoints — then rent a scooter or car.";

export const metadata: Metadata = {
  title: "Rodrigues Trip Planner — Free Itinerary | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/trip-planner` },
  openGraph: {
    title: "Rodrigues trip planner | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/trip-planner`,
    images: ogImages(),
  },
};

export default async function TripPlannerPage() {
  const content = await getContent();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Trip planner", url: `${SITE_URL}/trip-planner` },
      ]),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="bg-[#0a0a0a] min-h-screen">
        <div className="mx-auto max-w-7xl px-6 pt-28 md:pt-32">
          {/* Fallback "/": the planner is a top-level travel tool reached from the homepage tools strip, which is the parent its breadcrumb above declares. */}
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors"
          >
            {" "}Back
          </BackLink>
        </div>
        <TripPlanner />
      </main>
    </>
  );
}
