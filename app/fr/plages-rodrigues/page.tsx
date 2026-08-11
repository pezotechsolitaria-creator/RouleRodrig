import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PlaceGuide from "@/components/PlaceGuide";

export const revalidate = 3600;

// The French half of /guide/beaches. Not a translation afterthought: every one
// of these beaches already has descriptionFr + storyFr in the database — real
// French writing the owner paid for, that Google has never been able to read
// because the site applies translations client-side only.
//
// hreflang pairs it with the English page. Both must point at each other or
// Google ignores the annotation entirely.
const DESCRIPTION =
  "Toutes les plages de Rodrigues qui valent le détour, repérées par des locaux : Pointe Coton, Baladirou, St François. Photos réelles, accès et conseils honnêtes.";

const beaches = (locations: { category: string; story?: string }[]) =>
  locations.filter((l) => l.category === "beach" && l.story);

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const n = beaches(content.mapLocations).length;
  // Count comes from live content, so it can never drift when the owner adds a
  // beach in admin.
  const title = `Les ${n} plus belles plages de Rodrigues | Roule Rodrigues`;
  return {
    title,
    description: DESCRIPTION,
    alternates: {
      canonical: `${SITE_URL}/fr/plages-rodrigues`,
      languages: {
        "en-US": `${SITE_URL}/guide/beaches`,
        "fr-FR": `${SITE_URL}/fr/plages-rodrigues`,
        "x-default": `${SITE_URL}/guide/beaches`,
      },
    },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `${SITE_URL}/fr/plages-rodrigues`,
      type: "article",
      locale: "fr_FR",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function PlagesPage() {
  const content = await getContent();
  const places = beaches(content.mapLocations) as typeof content.mapLocations;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            { name: "Plages de Rodrigues", url: `${SITE_URL}/fr/plages-rodrigues` },
          ]),
          itemListLd("Plages de l'île Rodrigues", places.map((p) => ({ name: p.name.trim() }))),
          ...places.map((p) =>
            placeLd({
              name: p.name.trim(),
              description: p.descriptionFr || p.description,
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
        guideHref="/fr/plages-rodrigues"
        lang="fr"
        eyebrow="GUIDE DE L'ÎLE"
        title={`Les ${places.length} plus belles plages de Rodrigues`}
        intro="Rodrigues possède un lagon deux fois plus grand que l'île elle-même, et ses plages vont des sables animés du dimanche aux criques où vous serez seul au monde. Voici toutes celles que nous recommandons, avec l'accès et ce qui vous attend vraiment."
        places={places}
        labels={{
          rent: "Louer un scooter pour y aller",
          guide: "Guide complet de l'île",
          directions: "Itinéraire",
          keepExploring: "À découvrir aussi",
        }}
        related={[
          { href: "/fr/location-scooter-rodrigues", label: "Location de scooter à Rodrigues" },
          { href: "/guide/viewpoints", label: "Points de vue & sites remarquables" },
          { href: "/guide/routes", label: "Itinéraires en scooter & randonnées" },
          { href: "/browse/stays", label: "Où dormir à Rodrigues" },
        ]}
      />
    </>
  );
}
