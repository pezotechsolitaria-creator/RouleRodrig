import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import MapSection from "@/components/MapSection";
import { rankIslandPlaces } from "@/lib/places/popular-server";

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

  // -- POPULARITY, SCORED ON THE SERVER ------------------------------------
  // Read here rather than in the client so the first paint already knows which
  // pins are which -- a map that draws forty identical dots and then re-draws
  // six of them a second later is a map that flickers on exactly the connection
  // this island has.
  //
  // The page is revalidate = 3600, so these scores are up to an hour old. That
  // is the right trade for "popular this week": an hour of staleness is
  // invisible in a seven-day window, and the alternative is rendering this page
  // dynamically for every visitor to move a star.
  const ranked = await rankIslandPlaces(content.mapLocations, 7);
  const popularity = Object.fromEntries(ranked.map((r) => [r.place.id, r.popularity]));

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
        <MapSection locations={content.mapLocations} popularity={popularity} />
      </main>
    </>
  );
}
