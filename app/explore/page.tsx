import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
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
      href: p.isTour ? "/browse/tours" : "/browse/activities",
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
    href: "/guide/routes",
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
      href: l.category === "beach" ? "/guide/beaches" : l.category === "viewpoint" ? "/guide/viewpoints" : "/map",
      filterKey: l.category as "beach" | "viewpoint" | "landmark",
      tags: [],
    }));

  // Featured first, then a balanced mix (tours → attractions → routes) so the
  // list opens with the most "bookable" intent but still shows the free stuff.
  const all: ExploreItem[] = [...activities, ...attractions, ...routes];
  const featured =
    all.find((e) => e.featured && e.image) ??
    attractions.find((e) => e.image) ??
    activities.find((e) => e.image) ??
    all[0] ??
    null;
  const experiences = all.filter((e) => e.id !== featured?.id);

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
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <ExploreClient featured={featured} experiences={experiences} counts={counts} />
    </>
  );
}
