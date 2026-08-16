import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { getPublishedCurated } from "@/lib/world-docs/store";
import { buildCuratedView } from "@/lib/world-docs/page-data";
import CuratedWorld from "@/components/curated/CuratedWorld";

// Ten minutes. The catalogue behind this page changes when the owner edits it,
// and publishing a world busts this path explicitly (see the worlds API), so
// the interval is only the backstop for a change made somewhere else — a stay
// renamed in the content studio, an event selling out.
export const revalidate = 600;

const FALLBACK_TITLE = "Curated Rodrigues — handpicked stays, experiences & local gems";
const FALLBACK_DESCRIPTION =
  "Ti Roulé's own selection of Rodrigues: a few handpicked stays, experiences and local places worth making time for, chosen by people who live here.";

// The SEO copy is part of the world document, so the owner can change how this
// page appears in search without a deploy — the same principle as the rest of
// the page. Falling back to the constants above keeps a half-filled document
// from shipping an empty <title>.
export async function generateMetadata(): Promise<Metadata> {
  const doc = await getPublishedCurated();
  const title = doc.seo?.title?.trim() || FALLBACK_TITLE;
  const description = doc.seo?.description?.trim() || FALLBACK_DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/curated` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/curated`,
      type: "website",
    },
  };
}

export default async function CuratedPage() {
  const doc = await getPublishedCurated();
  const view = await buildCuratedView(doc);

  // Only what this page really SHOWS. The featured rail is a genuine list of
  // named things with their own URLs, so it earns ItemList markup; the moods and
  // the editors' notes are prose and are deliberately not marked up as products.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Home", url: SITE_URL },
        { name: "Curated", url: `${SITE_URL}/curated` },
      ]),
      ...(view.featuredTitles.length
        ? [
            itemListLd(
              "Curated Rodrigues — handpicked",
              view.featuredTitles.map((t) => ({
                name: t.name,
                url: t.url ? `${SITE_URL}${t.url}` : undefined,
              })),
            ),
          ]
        : []),
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <CuratedWorld
        doc={doc}
        sections={view.sections}
        moods={view.moods}
        heroImages={view.heroImages}
        logo={view.logo}
        mascot={view.mascot}
      />
    </>
  );
}
