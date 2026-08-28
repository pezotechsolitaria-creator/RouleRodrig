import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFleetView } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import { SERVICE_TYPES, type ServiceType } from "@/lib/defaults";
import { EXPERIENCES, experiencesOfType } from "@/lib/experiences";
import { breadcrumbLd, itemListLd, experienceLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import ExperienceMarket from "@/components/experiences/ExperienceMarket";
import Navbar from "@/components/Navbar";
import ScrollToTop from "@/components/ScrollToTop";

// /experiences/massage · /experiences/fishing · /experiences/boat
//
// One route, three marketplaces — see lib/experiences.ts for why that is the
// right shape rather than three bespoke ones. ISR, because a provider's
// AVAILABILITY is fetched live inside the booking modal; the catalogue itself
// changes when the owner edits it, not by the minute.
export const revalidate = 300;

export function generateStaticParams() {
  return SERVICE_TYPES.map((type) => ({ type }));
}

function copyFor(type: string) {
  return (SERVICE_TYPES as readonly string[]).includes(type)
    ? EXPERIENCES[type as ServiceType]
    : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const copy = copyFor(type);
  if (!copy) return { title: "Not found" };
  return {
    title: `${copy.title} | Roulé Rodrigues`,
    description: copy.description,
    alternates: { canonical: `${SITE_URL}/experiences/${copy.slug}` },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: `${SITE_URL}/experiences/${copy.slug}`,
      type: "website",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function ExperiencePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const copy = copyFor(type);
  if (!copy) notFound();

  const { content, businessWhatsApp } = await getFleetView();
  const places = experiencesOfType(content.recommended.items, copy.slug);

  return (
    <>
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      <main className="min-h-screen bg-dark px-4 pb-28 pt-24 text-offwhite md:pt-28">
        {places.length > 0 && (
          <JsonLd
            data={[
              breadcrumbLd([
                { name: "Home", url: SITE_URL },
                { name: copy.title, url: `${SITE_URL}/experiences/${copy.slug}` },
              ]),
              itemListLd(
                copy.title,
                places.map((p) => ({ name: p.name, url: `${SITE_URL}/experiences/${copy.slug}` })),
              ),
              // ── EACH EXPERIENCE, WITH ITS PRICE AND ITS CAPTAIN (M134) ──
              //
              // This page used to emit an ItemList and stop: a list of names,
              // no price, no provider, nothing saying any of it could be
              // booked. A search engine saw a page ABOUT fishing trips; it did
              // not see a fishing trip anyone could buy — which is the
              // difference between being listed and being chosen.
              //
              // It matters more for an assistant than for Google. Asked "how
              // much is a boat trip in Rodrigues", a model with prose has to
              // guess and usually declines; one with a priced Offer answers
              // with the number and names the site it came from.
              //
              // Every value is read off the listing the owner wrote. A listing
              // with no price emits no Offer rather than a zero, because free
              // and unpriced are not the same claim.
              ...places.map((p) =>
                experienceLd({
                  name: p.name,
                  price: typeof p.depositAmount === "number" ? p.depositAmount : null,
                  description: p.description || undefined,
                  image: p.image || undefined,
                  url: `${SITE_URL}/experiences/${copy.slug}`,
                  providerName: p.providerName || null,
                  durationMinutes: typeof p.durationMinutes === "number" ? p.durationMinutes : null,
                }),
              ),
            ]}
          />
        )}

        <div className="mx-auto max-w-5xl">
          <Link href="/" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
            <ArrowLeft size={14} /> Home
          </Link>

          <h1 className="mt-3 font-syne text-3xl font-extrabold leading-[1.05] sm:text-4xl">
            <span aria-hidden className="mr-2">{copy.emoji}</span>
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl font-dm text-sm text-muted">{copy.subtitle}</p>

          <ExperienceMarket copy={copy} places={places} whatsapp={businessWhatsApp} />
        </div>
      </main>
      <ScrollToTop />
    </>
  );
}
