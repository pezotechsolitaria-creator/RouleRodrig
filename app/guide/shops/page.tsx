import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PlaceGuide from "@/components/PlaceGuide";

export const revalidate = 3600;

// Shopping directory for the island guide. Same pattern as beaches/viewpoints:
// built from the map locations the owner maintains in admin (category "shop").
// It 404s until at least one shop exists — the owner knows the real markets and
// craft shops with real locations, and inventing them would put fake addresses
// on the site. So this ships empty and fills as they pin shops.
const DESCRIPTION =
  "Where to shop in Rodrigues Island: markets, local crafts, honey, chilli and more — mapped by locals, with directions to each.";

const shops = (locations: { category: string }[]) => locations.filter((l) => l.category === "shop");

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
  const places = shops(content.mapLocations) as typeof content.mapLocations;
  if (places.length === 0) notFound();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Shopping", url: `${SITE_URL}/guide/shops` },
          ]),
          itemListLd("Shops & markets in Rodrigues", places.map((p) => ({ name: p.name.trim() }))),
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
      <AppPageHeader logo={content.branding.logo} />
      <PlaceGuide
        guideHref="/guide/shops"
        eyebrow="ISLAND GUIDE"
        title="Where to shop in Rodrigues"
        intro="Rodrigues is known for what it makes: honey, lemon and chilli, hand-woven baskets, embroidery, and the buzz of the Saturday market in Port Mathurin. Here's where to find it, mapped by locals."
        places={places}
        related={[
          { href: "/guide/beaches", label: "The best beaches in Rodrigues" },
          { href: "/food", label: "Where to eat — free WhatsApp concierge" },
          { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
          { href: "/browse/scooter", label: "Rent a scooter to get around" },
        ]}
      />
    </>
  );
}
