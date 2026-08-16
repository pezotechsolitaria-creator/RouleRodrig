import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import { getPublishedWorld } from "@/lib/world-docs/store";
import { buildWorldView } from "@/lib/world-docs/page-data";
import WorldPage from "@/components/world-page/WorldPage";

// The mirror of /curated, and deliberately the same code: one renderer, two
// documents. See components/world-page/WorldPage.tsx for why.
export const revalidate = 600;

const FALLBACK_TITLE = "Authentic Rodrigues — local life, walks, fishing & the island itself";
const FALLBACK_DESCRIPTION =
  "Rodrigues as the people who live here see it: fishing trips, cliff walks, the Saturday market, village kitchens and the places worth the detour.";

export async function generateMetadata(): Promise<Metadata> {
  const doc = await getPublishedWorld("authentic");
  const title = doc.seo?.title?.trim() || FALLBACK_TITLE;
  const description = doc.seo?.description?.trim() || FALLBACK_DESCRIPTION;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/authentic` },
    openGraph: { title, description, url: `${SITE_URL}/authentic`, type: "website" },
  };
}

export default async function AuthenticPage() {
  const doc = await getPublishedWorld("authentic");
  const view = await buildWorldView(doc);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Home", url: SITE_URL },
        { name: "Authentic", url: `${SITE_URL}/authentic` },
      ]),
      ...(view.featuredTitles.length
        ? [
            itemListLd(
              "Authentic Rodrigues — what the island is doing today",
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
      <WorldPage
        world="authentic"
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
