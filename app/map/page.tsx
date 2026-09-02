import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import MapSection from "@/components/MapSection";

// The interactive island map now has its own flagship page (a Quick Access tile
// links here), instead of being a homepage section. Static-ish: refresh hourly.
export const revalidate = 3600;

const DESCRIPTION =
  "Explore Rodrigues Island on an interactive map — beaches, viewpoints, hidden gems, fuel stations and landmarks, each with directions from wherever you are.";

export const metadata: Metadata = {
  title: "Rodrigues Island Map — beaches, viewpoints & hidden gems | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/map` },
  openGraph: {
    title: "Rodrigues Island Map | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/map`,
  },
};

export default async function MapPage() {
  const content = await getContent();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Island Map", url: `${SITE_URL}/map` },
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
      <main className="bg-dark min-h-screen">
        <div className="mx-auto max-w-7xl px-6 pt-28 md:pt-32">
          {/* Fallback "/": the map is a top-level travel tool opened from the homepage tools strip, which is what its breadcrumb above declares as its parent. */}
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors"
          >
            {" "}Back
          </BackLink>
        </div>
        <MapSection locations={content.mapLocations} />
      </main>
    </>
  );
}
