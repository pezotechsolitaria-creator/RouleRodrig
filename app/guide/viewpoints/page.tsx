import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PlaceGuide from "@/components/PlaceGuide";

export const revalidate = 3600;

// Title 58 chars, description 152.
const TITLE = "Viewpoints & Landmarks in Rodrigues | Roule Rodrigues";
const DESCRIPTION =
  "The best viewpoints in Rodrigues Island, mapped by locals: Mont Limon, Tombeau Maragon, Marie Reine and more. Real photos, directions and when to go.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guide/viewpoints` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/guide/viewpoints`,
    type: "article",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function ViewpointsPage() {
  const content = await getContent();
  // Viewpoints and landmarks share this page: both are "go and look at it"
  // stops, and splitting eight places across two pages makes both of them thin.
  const places = content.mapLocations.filter(
    (l) => (l.category === "viewpoint" || l.category === "landmark") && l.story,
  );

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Viewpoints", url: `${SITE_URL}/guide/viewpoints` },
          ]),
          itemListLd(
            "Viewpoints & landmarks in Rodrigues Island",
            places.map((p) => ({ name: p.name.trim() })),
          ),
          ...places.map((p) =>
            placeLd({
              name: p.name.trim(),
              description: p.description,
              category: p.category,
              lat: p.lat,
              lng: p.lng,
              image: p.image,
            }),
          ),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <PlaceGuide
        eyebrow="ISLAND GUIDE"
        title="Viewpoints & landmarks in Rodrigues"
        intro="Rodrigues is only 18 km long, but it's volcanic and steep — which means the whole island opens up from a handful of high points. These are the ones worth the ride, and what you'll see from each."
        places={places}
        related={[
          { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
          { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
          { href: "/browse/scooter", label: "Rent a scooter to reach them" },
          { href: "/browse/getting-around", label: "How to get around Rodrigues" },
        ]}
      />
    </>
  );
}
