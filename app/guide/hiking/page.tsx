import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import HikingGuide, { isHike } from "@/components/HikingGuide";
import { isGuide } from "@/components/GuideRoster";

export const revalidate = 3600;

// 57 chars / 152 — measured, so neither is truncated in a result.
const TITLE = "Hiking in Rodrigues Island: Every Trail | Roule Rodrigues";
const DESCRIPTION =
  "Every hiking trail in Rodrigues Island, walked and written up by locals — real distance, climb, terrain and shade, plus what to carry on an island with no taps.";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const n = content.rideRoutes.filter((r) => isHike(r) && r.name && r.description).length;
  // The count comes from the same filter that builds the page, so the title can
  // never promise a number the page does not show.
  const title = n > 0 ? `The ${n} Best Hikes in Rodrigues Island | Roule Rodrigues` : TITLE;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/guide/hiking` },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `${SITE_URL}/guide/hiking`,
      type: "article",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function HikingPage() {
  const content = await getContent();
  // Same gate the rest of the guide uses: a name and a pin is not a guide
  // entry. A trail with no description written yet stays out of the list, the
  // count and the structured data alike.
  const trails = content.rideRoutes.filter((r) => isHike(r) && r.name && r.description);
  // The people. Featured first, matching every other listing surface — the
  // owner's ordering decision, not alphabetical accident.
  const guides = content.recommended.items
    .filter(isGuide)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured));

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Hiking", url: `${SITE_URL}/guide/hiking` },
          ]),
          itemListLd(
            "Hiking trails in Rodrigues Island",
            trails.map((r) => ({ name: r.name.trim(), url: `${SITE_URL}/guide/hiking#${r.id}` })),
          ),
          // No geo is emitted: the trail model carries a written trailhead, not
          // coordinates, and a guessed lat/lng in structured data would be a
          // lie told to a mapping engine.
          ...trails.map((r) =>
            placeLd({
              name: r.name.trim(),
              description: r.description.trim(),
              category: "activity",
              image: r.image || r.images?.[0],
            }),
          ),
        ]}
      />
      <AppPageHeader logo={content.branding.logo} />
      <HikingGuide
        trails={trails}
        guides={guides}
        related={[
          { href: "/experiences/hiking", label: "All hiking guides in Rodrigues" },
          { href: "/guide/routes", label: "Scooter routes around the island" },
          { href: "/guide/viewpoints", label: "Viewpoints & landmarks in Rodrigues" },
          { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
          { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
          { href: "/browse/scooter", label: "Rent a scooter to reach the trailheads" },
          { href: "/trip-planner", label: "Build a day-by-day plan" },
        ]}
      />
    </>
  );
}
