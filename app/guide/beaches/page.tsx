import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PlaceGuide from "@/components/PlaceGuide";

export const revalidate = 3600;

const DESCRIPTION =
  "Every beach in Rodrigues worth your time, mapped by locals: Pointe Coton, Baladirou, St François and more. Real photos, directions and honest advice.";

// Only beaches with a written story make the page — a name and a pin isn't a
// guide entry. Same filter feeds the title's count and the H1, so the number is
// always the truth and can never drift when the owner edits content in admin.
const beaches = (locations: { category: string; story?: string }[]) =>
  locations.filter((l) => l.category === "beach" && l.story);

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const n = beaches(content.mapLocations).length;
  const title = `The ${n} Best Beaches in Rodrigues Island | Roule Rodrigues`;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}/guide/beaches` },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `${SITE_URL}/guide/beaches`,
      type: "article",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function BeachesPage() {
  const content = await getContent();
  const places = beaches(content.mapLocations) as typeof content.mapLocations;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Beaches", url: `${SITE_URL}/guide/beaches` },
          ]),
          itemListLd("Beaches in Rodrigues Island", places.map((p) => ({ name: p.name.trim() }))),
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
        title={`The ${places.length} best beaches in Rodrigues`}
        intro="Rodrigues has a lagoon twice the size of the island itself, and the beaches around it range from busy Sunday picnic sands to coves you'll have entirely to yourself. Here's every one we rate, with directions and what to actually expect."
        places={places}
        related={[
          { href: "/guide/viewpoints", label: "Viewpoints & landmarks in Rodrigues" },
          { href: "/guide/rodrigues", label: "The full local's guide to Rodrigues" },
          { href: "/browse/scooter", label: "Rent a scooter to reach them" },
          { href: "/browse/stays", label: "Where to stay in Rodrigues" },
        ]}
      />
      <Footer social={content.social} branding={content.branding} />
    </>
  );
}
