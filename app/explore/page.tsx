import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import ExploreClient, { type ExploreItem } from "@/components/ExploreClient";

export const revalidate = 3600;

const DESCRIPTION =
  "Explore Rodrigues Island: the best beaches, viewpoints, hikes, scenic rides, guided tours and things to do — curated by locals, all in one place.";

export const metadata: Metadata = {
  title: "Explore Rodrigues — beaches, hikes, tours & things to do | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/explore` },
  openGraph: {
    title: "Explore Rodrigues Island",
    description: DESCRIPTION,
    url: `${SITE_URL}/explore`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function ExplorePage() {
  const content = await getContent();

  // ── Build the experience list from REAL content only ──────────────────
  // No invented ratings or prices: routes carry their real distance/difficulty,
  // attractions their locally-written blurb, and bookable activities their
  // owner-set price hint (priceNote) — nothing is fabricated.

  // Guided tours & activities (bookable places).
  const activities: ExploreItem[] = content.recommended.items
    .filter((p) => p.category === "activity")
    .map((p) => ({
      id: `place-${p.id}`,
      name: p.name,
      description: p.description,
      descriptionFr: p.descriptionFr,
      descriptionCr: p.descriptionCr,
      image: p.image,
      href: p.serviceType ? `/experiences/${p.serviceType}` : p.isTour ? "/browse/tours" : "/browse/activities",
      filterKey: p.isTour ? "tour" : "activity",
      tags: [],
      price: p.priceNote,
      featured: p.featured,
    }));

  // Scenic rides & hiking trails.
  const routes: ExploreItem[] = content.rideRoutes.map((r) => ({
    id: `route-${r.id}`,
    name: r.name,
    nameFr: r.nameFr,
    nameCr: r.nameCr,
    description: r.description,
    descriptionFr: r.descriptionFr,
    descriptionCr: r.descriptionCr,
    image: r.image,
    // A trail's write-up moved to the hiking guide, so its anchor must move
    // with it — /guide/routes only carries the rides in full now, and a hash
    // pointing at an id that is no longer on that page scrolls nowhere.
    href: r.kind === "hike" ? `/guide/hiking#${r.id}` : `/guide/routes#${r.id}`,
    filterKey: r.kind === "hike" ? "hike" : "ride",
    tags: [r.distance, r.difficulty].filter(Boolean) as string[],
    featured: r.featured,
  }));

  // Beaches, viewpoints & landmarks that have a local story + photo.
  const attractions: ExploreItem[] = content.mapLocations
    .filter((l) => l.story && (l.image || l.images?.[0]) && ["beach", "viewpoint", "landmark"].includes(l.category))
    .map((l) => ({
      id: `loc-${l.id}`,
      name: l.name,
      nameFr: l.nameFr,
      nameCr: l.nameCr,
      description: l.description,
      descriptionFr: l.descriptionFr,
      descriptionCr: l.descriptionCr,
      image: l.image ?? l.images?.[0],
      href: l.category === "beach" ? `/guide/beaches#${l.id}` : l.category === "viewpoint" ? `/guide/viewpoints#${l.id}` : "/map",
      filterKey: l.category as "beach" | "viewpoint" | "landmark",
      tags: [],
    }));

  // Local events — "What's on" moved here from the homepage.
  const events: ExploreItem[] = content.events
    .filter((e) => e.title)
    .map((e) => ({
      id: `event-${e.id}`,
      name: e.title,
      nameFr: e.titleFr,
      nameCr: e.titleCr,
      description: e.description,
      descriptionFr: e.descriptionFr,
      descriptionCr: e.descriptionCr,
      image: e.image,
      href: "/events",
      filterKey: "event",
      tags: [e.date].filter(Boolean) as string[],
      featured: e.featured,
    }));

  const all: ExploreItem[] = [...activities, ...attractions, ...routes, ...events];

  // "Top Attractions" hero card → opens the interactive island map. Photo falls
  // back through the hero shot → a scenic viewpoint/beach → any attraction.
  const topPhoto =
    content.hero.backgroundImage ||
    content.mapLocations.find((l) => (l.image || l.images?.[0]) && (l.category === "viewpoint" || l.category === "beach"))?.image ||
    attractions.find((a) => a.image)?.image ||
    undefined;
  const featured: ExploreItem = {
    id: "top-attractions",
    name: "Top Attractions",
    nameFr: "Attractions phares",
    nameCr: "Bann atraksion",
    description: "Discover the must-see places in Rodrigues.",
    descriptionFr: "Découvrez les lieux incontournables de Rodrigues.",
    descriptionCr: "Dekouver bann pli zoli landrwa Rodrig.",
    image: topPhoto,
    href: "/map",
    filterKey: "landmark",
    tags: [],
  };
  const experiences = all;

  const counts: Record<string, number> = {
    beach: content.mapLocations.filter((l) => l.category === "beach" && l.story).length,
    viewpoint: content.mapLocations.filter((l) => l.category === "viewpoint" && l.story).length,
    route: content.rideRoutes.length,
    restaurant: content.recommended.items.filter((p) => p.category === "restaurant").length,
    hotel: content.recommended.items.filter((p) => p.category === "hotel").length,
    tour: content.recommended.items.filter((p) => p.category === "activity" && p.isTour).length,
  };

  const jsonLd = [
    breadcrumbLd([
      { name: "Roule Rodrigues", url: SITE_URL },
      { name: "Explore", url: `${SITE_URL}/explore` },
    ]),
    itemListLd(
      "Things to do in Rodrigues Island",
      all.slice(0, 15).map((e) => ({ name: e.name.trim() })),
    ),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />
      <AppPageHeader logo={content.branding.logo} />
      <ExploreClient
        featured={featured}
        experiences={experiences}
        counts={counts}
        foodEnabled={content.foodConcierge?.enabled}
        foodImage={content.foodConcierge?.coverImage}
      />
    </>
  );
}
