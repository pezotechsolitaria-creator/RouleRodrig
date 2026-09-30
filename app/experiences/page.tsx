import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import { placeHref } from "@/lib/place-href";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import ExperiencesHub from "@/components/experiences/ExperiencesHub";
import FrenchTwinLink from "@/components/FrenchTwinLink";

export const revalidate = 300;

const TITLE = "Things to Do in Rodrigues — Day & Night | Roule Rodrigues";
// 161 characters, and it sold "sunset sailings and night fishing" that no
// listing offers — every activity is by day or unmarked. Now 148, naming only
// what is listed (SEO audit 2026-09-29 T15).
const DESCRIPTION =
  "Every experience on Rodrigues Island in one place: lagoon and boat trips, snorkelling, fishing, hiking guides and massage, booked direct with locals.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/experiences`,
    // Mirrors /fr/que-faire-a-rodrigues, which is this page in French. A
    // one-way hreflang is silently ignored.
    languages: {
      "en": `${SITE_URL}/experiences`,
      "fr": `${SITE_URL}/fr/que-faire-a-rodrigues`,
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
          // Each name at its own address: a list of names with no route to
          // the priced detail pages gave crawlers nothing to follow (SEO audit
          // 2026-09-29 T13). itemListLd() drops a repeated url.
          itemListLd(
            "Experiences in Rodrigues Island",
            places.map((p) => ({ name: p.name.trim(), url: `${SITE_URL}${placeHref(p)}` })),
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
      <div className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
        <FrenchTwinLink
          href="/fr/que-faire-a-rodrigues"
          label="Que faire à Rodrigues ? — cette page en français"
        />
      </div>
    </>
  );
}
