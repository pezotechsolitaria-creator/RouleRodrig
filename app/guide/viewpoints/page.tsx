import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { realProse } from "@/lib/place-prose";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
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
  //
  // Requires PROSE, not the `story` column specifically. Demanding one
  // particular field silently hid Trou d'Argent from /guide/beaches even though
  // the owner had written a description for it — see the note there. The same
  // filter shape was here, so the same fix is.
  // realProse, not trim: five of the entries passing the old gate carried the
  // admin placeholder ("Add a description.", with or without pasted
  // coordinates) as their entire prose — rendered to every visitor and every
  // crawler on the site's best-ranking page.
  const places = content.mapLocations.filter(
    (l) =>
      (l.category === "viewpoint" || l.category === "landmark") &&
      Boolean(realProse(l.story) || realProse(l.description)),
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
              description: realProse(p.description) || undefined,
              category: p.category,
              lat: p.lat,
              lng: p.lng,
              image: p.image,
            }),
          ),
        ]}
      />
      <AppPageHeader logo={content.branding.logo} />
      <PlaceGuide
        guideHref="/guide/viewpoints"
        eyebrow="ISLAND GUIDE"
        title="Viewpoints & landmarks in Rodrigues"
        intro="Rodrigues is only 18 km long, but it's volcanic and steep — which means the whole island opens up from a handful of high points. These are the ones worth the ride, and what you'll see from each."
        places={places}
        related={[
          { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
          {
            href: "/guide/rodrigues",
            label: "The full local's guide to Rodrigues",
          },
          { href: "/browse/scooter", label: "Rent a scooter to reach them" },
          { href: "/browse/car", label: "Car rental in Rodrigues, for the family" },
          // The Experiences hub is two weeks old and Google has never crawled
          // it: every signal is correct — sitemap, robots, 200, self-canonical,
          // real anchor text on the homepage — it simply has almost no inbound
          // links on a site with very little crawl budget. This page has the
          // most impressions of any on the site, so a link from here is the
          // strongest one available.
          {
            href: "/experiences",
            label: "Boat trips, fishing and guides in Rodrigues",
          },
          {
            href: "/browse/getting-around",
            label: "How to get around Rodrigues",
          },
        ]}
      />
    </>
  );
}
