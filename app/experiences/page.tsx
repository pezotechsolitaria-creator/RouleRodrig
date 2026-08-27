import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import ExperiencesHub from "@/components/experiences/ExperiencesHub";

export const revalidate = 300;

const TITLE = "Things to Do in Rodrigues — Day & Night | Roule Rodrigues";
const DESCRIPTION =
  "Every experience on Rodrigues Island in one place: lagoon trips, fishing, hiking guides, massage and tours by day — sunset sailings and night fishing after dark.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/experiences`,
    // Mirrors /fr/que-faire-a-rodrigues, which is this page in French. A
    // one-way hreflang is silently ignored.
    languages: {
      "en-US": `${SITE_URL}/experiences`,
      "fr-FR": `${SITE_URL}/fr/que-faire-a-rodrigues`,
      "x-default": `${SITE_URL}/experiences`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/experiences`,
    type: "website",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function ExperiencesHubPage() {
  const content = await getContent();

  // EVERYTHING the owner has listed as something to do — the four service
  // verticals and the plain activities alike. The per-vertical pages stay as
  // they are and keep their own search intent; this is the door for somebody
  // who does not yet know which of them they want.
  //
  // A name and a photo is the bar: a listing with neither is an admin
  // placeholder, not an experience, and the hub is the wrong place to find out.
  const places = content.recommended.items.filter(
    (p) =>
      p.category === "activity" && p.name.trim() && (p.image || p.images?.[0]),
  );

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Experiences", url: `${SITE_URL}/experiences` },
          ]),
          itemListLd(
            "Experiences in Rodrigues Island",
            places.map((p) => ({ name: p.name.trim() })),
          ),
        ]}
      />
      {/* A titled header, which is what gives it the back control — the hub is
          reached from a homepage card, so there has to be a way home that is
          not the browser button. */}
      <AppPageHeader
        title="Experiences"
        backHref="/"
        logo={content.branding.logo}
      />
      <ExperiencesHub places={places} />
    </>
  );
}
