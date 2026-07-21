import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import TripPlanner from "@/components/TripPlanner";
import Footer from "@/components/Footer";

// The AI trip planner moved off the homepage (now a lean action dashboard) to
// its own page, reached from the Quick Access strip and Ti Roulé.
export const revalidate = 3600;

const DESCRIPTION =
  "Plan your Rodrigues Island trip in seconds: pick your days and interests and get a free day-by-day itinerary with beaches, viewpoints and activities — then rent a scooter or car to do it.";

export const metadata: Metadata = {
  title: "Rodrigues trip planner — free day-by-day itinerary | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/trip-planner` },
  openGraph: {
    title: "Rodrigues trip planner | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/trip-planner`,
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
          <Link href="/" className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors">
            <ArrowLeft size={15} /> Roule Rodrigues
          </Link>
        </div>
        <TripPlanner />
      </main>
      <Footer social={content.social} branding={content.branding} />
    </>
  );
}
