import type { Metadata } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import TripPlanner from "@/components/TripPlanner";
import { ogImages } from "@/lib/share-image";

// The AI trip planner moved off the homepage (now a lean action dashboard) to
// its own page, reached from the Quick Access strip and Ti Roulé.
export const revalidate = 3600;

const DESCRIPTION =
  "Plan your Rodrigues trip in seconds: pick your days and interests for a free day-by-day itinerary of beaches and viewpoints — then rent a scooter or car.";

export const metadata: Metadata = {
  title: "Rodrigues Trip Planner — Free Itinerary | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/trip-planner` },
  openGraph: {
    title: "Rodrigues trip planner | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/trip-planner`,
    images: ogImages(),
  },
};

export default async function TripPlannerPage() {
  const content = await getContent();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "Roule Rodrigues", url: SITE_URL },
        { name: "Trip planner", url: `${SITE_URL}/trip-planner` },
      ]),
    ],
  };

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
      <main className="bg-[#0a0a0a] min-h-screen">
        <div className="mx-auto max-w-7xl px-6 pt-28 md:pt-32">
          {/* Fallback "/": the planner is a top-level travel tool reached from the homepage tools strip, which is the parent its breadcrumb above declares. */}
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 text-muted hover:text-yellow text-sm transition-colors"
          >
            {" "}Back
          </BackLink>
        </div>
        {/* The written plans that answer the same question, which this page
            never linked (SEO audit 2026-09-29 C22). Rendered here, on the
            server, and handed to the planner so it sits under the form.

            It stays English — translating it into client copy would take the
            C22 links out of the server HTML — so it says so: lang="en" on the
            sentence, because <html lang> follows the reader's chosen language
            (LanguageContext), and lang="fr" on the French link, as
            FrenchTwinLink does, so a screen reader reads each in its own. */}
        <TripPlanner
          afterForm={
            <p lang="en" className="font-dm text-sm leading-relaxed text-muted">
              Not sure how many days?{" "}
              <Link
                href="/blog/how-many-days-in-rodrigues"
                className="text-yellow underline underline-offset-2"
              >
                How many days you need
              </Link>
              ,{" "}
              <Link
                href="/blog/rodrigues-itinerary"
                className="text-yellow underline underline-offset-2"
              >
                a 3, 5 or 7-day itinerary
              </Link>
              , or{" "}
              <Link
                href="/fr/itineraire-rodrigues"
                hrefLang="fr"
                lang="fr"
                className="text-yellow underline underline-offset-2"
              >
                l&apos;itinéraire en français
              </Link>
              .
            </p>
          }
        />
      </main>
    </>
  );
}
