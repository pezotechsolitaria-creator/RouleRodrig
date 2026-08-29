import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import { realProse } from "@/lib/place-prose";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PlaceGuide from "@/components/PlaceGuide";

export const revalidate = 3600;

const DESCRIPTION =
  "Every beach in Rodrigues worth your time, mapped by locals: Pointe Coton, Baladirou, St François and more. Real photos, directions and honest advice.";

// Only beaches with WRITING make the page — a name and a pin isn't a guide
// entry. Same filter feeds the title's count and the H1, so the number is
// always the truth and can never drift when the owner edits content in admin.
//
// ── IT USED TO REQUIRE `story` SPECIFICALLY, AND THAT HID THE BEST BEACH ───
// Trou d'Argent — the island's most photographed beach, and the one visitors
// arrive already wanting to see — was silently absent from /guide/beaches.
// So were Graviers and Anse Mourouk. Not because nobody had written about
// them: all three carry a `description` the owner wrote, and PlaceGuide renders
// `description` and `story` as two independent paragraphs, so any of them
// displays perfectly well with only one.
//
// The rule was never "must have a story field". It was "must have prose", and
// requiring one particular column threw away the column that is always filled.
// A filter that drops content silently is worse than one that is strict: the
// owner had already done the work and had no way to know it was not showing.
// realProse, not trim: seven beach entries carried the admin placeholder
// ("Add a description.", sometimes with coordinates pasted after it) and
// this gate was letting them through — so the page's headline count included
// entries whose entire prose was placeholder text.
const hasWriting = (l: { story?: string; description?: string }) =>
  Boolean(realProse(l.story) || realProse(l.description));

const beaches = (
  locations: { category: string; story?: string; description?: string }[],
) => locations.filter((l) => l.category === "beach" && hasWriting(l));

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const n = beaches(content.mapLocations).length;
  const title = `The ${n} Best Beaches in Rodrigues Island | Roule Rodrigues`;
  return {
    title,
    description: DESCRIPTION,
    alternates: {
      canonical: `${SITE_URL}/guide/beaches`,
      // Must mirror the `languages` block on /fr/plages-rodrigues — a one-way
      // hreflang is silently ignored by Google.
      languages: {
        "en": `${SITE_URL}/guide/beaches`,
        "fr": `${SITE_URL}/fr/plages-rodrigues`,
        "x-default": `${SITE_URL}/guide/beaches`,
      },
    },
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
  // Same gate /guide/viewpoints applies to its own list — a name and a pin is
  // not a guide entry — so the band and that page can never disagree.
  const viewpointCount = content.mapLocations.filter(
    (l) => l.category === "viewpoint" && hasWriting(l),
  ).length;

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Island guide", url: `${SITE_URL}/guide/rodrigues` },
            { name: "Beaches", url: `${SITE_URL}/guide/beaches` },
          ]),
          itemListLd(
            "Beaches in Rodrigues Island",
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
        guideHref="/guide/beaches"
        eyebrow="ISLAND GUIDE"
        title={`The ${places.length} best beaches in Rodrigues`}
        intro="Rodrigues has a lagoon twice the size of the island itself, and the beaches around it range from busy Sunday picnic sands to coves you'll have entirely to yourself. Here's every one we rate, with directions and what to actually expect."
        places={places}
        // The homepage tile now says "Beaches & Views" and lands here, so the
        // other half has to be offered before the scroll rather than in a list
        // under 1,300 words of prose.
        // The count is COUNTED, never guessed — same filter the viewpoints page
        // itself uses, so the band can never promise a number that page does
        // not show. Falls back to no number when none are written up yet.
        sibling={{
          href: "/guide/viewpoints",
          label: viewpointCount
            ? `Looking for viewpoints? See all ${viewpointCount}`
            : "Looking for viewpoints instead?",
        }}
        related={[
          {
            href: "/guide/viewpoints",
            label: "Viewpoints & landmarks in Rodrigues",
          },
          { href: "/guide/routes", label: "Scooter routes around the island" },
          { href: "/guide/hiking", label: "Hiking trails in Rodrigues" },
          {
            href: "/guide/rodrigues",
            label: "The full local's guide to Rodrigues",
          },
          { href: "/browse/scooter", label: "Rent a scooter to reach them" },
          { href: "/browse/stays", label: "Where to stay in Rodrigues" },
          // The French twin of THIS page, and the only crawl path into it.
          // hreflang is an annotation; Google needs a link.
          {
            href: "/fr/plages-rodrigues",
            label: "Les plages de Rodrigues — cette page en français",
          },
        ]}
      />
    </>
  );
}
