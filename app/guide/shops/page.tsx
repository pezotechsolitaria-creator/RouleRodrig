import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { MapLocation } from "@/lib/defaults";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import { THEME_GUIDES, guideTrail, placesOnGuide } from "@/lib/guide/places";
import { placeAnchors } from "@/lib/guide/location-page-gate";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PlaceGuide from "@/components/PlaceGuide";
import HubBacklink from "@/components/nav/HubBacklink";

export const revalidate = 3600;

// Shopping directory for the island guide. Same pattern as beaches/viewpoints:
// built from the map locations the owner maintains in admin (category "shop").
// It 404s until at least one shop exists — the owner knows the real markets and
// craft shops with real locations, and inventing them would put fake addresses
// on the site. So this ships empty and fills as they pin shops.
const DESCRIPTION =
  "Where to shop in Rodrigues Island: markets, local crafts, honey, chilli and more — mapped by locals, with directions to each.";

// Every shop pin, prose or not — the rule the /guide hub and /map also read
// (lib/guide/places.ts), so neither links a shop this page does not show.
const shops = (locations: MapLocation[]) => placesOnGuide(locations, THEME_GUIDES.shops);

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  if (shops(content.mapLocations).length === 0) {
    // Nothing to show yet → keep it out of the index rather than ship a thin page.
    return { title: "Shopping in Rodrigues | Roule Rodrigues", robots: { index: false, follow: false } };
  }
  const title = "Where to Shop in Rodrigues Island | Roule Rodrigues";
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/guide/shops` },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `${SITE_URL}/guide/shops`,
      type: "article",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function ShopsPage() {
  const content = await getContent();
  const places = shops(content.mapLocations);
  if (places.length === 0) notFound();
  const anchors = placeAnchors(content.mapLocations);
  const entryUrl = (id: string) => `${SITE_URL}/guide/shops#${anchors[id]}`;

  return (
    <>
      <JsonLd
        data={[
          // Home › Island guide (/guide) › Shopping (item 6).
          breadcrumbLd(guideTrail(SITE_URL, { name: "Shopping", path: "/guide/shops" })),
          itemListLd(
            "Shops & markets in Rodrigues",
            places.map((p) => ({ name: p.name.trim(), url: entryUrl(p.id) })),
          ),
          ...places.map((p) =>
            placeLd({
              name: p.name.trim(),
              description: p.description,
              category: p.category,
              lat: p.lat,
              lng: p.lng,
              image: p.image,
              url: entryUrl(p.id),
            }),
          ),
        ]}
      />
      <AppPageHeader logo={content.branding.logo} />
      <PlaceGuide
        guideHref="/guide/shops"
        anchors={anchors}
        eyebrow="ISLAND GUIDE"
        title="Where to shop in Rodrigues"
        intro="Rodrigues is known for what it makes: honey, lemon and chilli, hand-woven baskets, embroidery, and the buzz of the Saturday market in Port Mathurin. Here's where to find it, mapped by locals."
        places={places}
        related={[
          { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
          { href: "/food", label: "Where to eat — free WhatsApp concierge" },
          // The marketplace is where island shops list what they make. This
          // guide is the map of where they are in person; each should lead to
          // the other (architecture review 2026-09-30, item 7). Worded as
          // /about words it: "shop online" promised a basket, and /shop has a
          // launch state with no products in it (fixer round).
          { href: "/shop", label: "The island marketplace" },
          { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
          { href: "/browse/scooter", label: "Rent a scooter to get around" },
        ]}
      />
      <HubBacklink href="/guide" label="All island guides" />
    </>
  );
}
