import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFleetView } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import { SERVICE_TYPES, type ServiceType } from "@/lib/defaults";
import { EXPERIENCES, experiencesOfType, fromPriceOf, experienceFaq } from "@/lib/experiences";
import { breadcrumbLd, itemListLd, experienceLd, sellerLd } from "@/lib/schema";
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

  // ── PRICE IN THE TITLE, BECAUSE THAT IS WHAT WORKS (M135) ────────────────
  //
  // The comparison the owner handed us: scooters bring customers, experiences
  // bring none. The page that works is titled "Location scooter Rodrigues dès
  // Rs 699/jour". This page was titled "Sea trips in Rodrigues".
  //
  // A price in the title pre-qualifies the click. Someone who sees Rs 700 and
  // taps is a customer; someone who taps a priceless title and meets Rs 2,000
  // leaves, and every one of those teaches the ranking that this result did not
  // answer the question. It is also the number an assistant repeats when asked
  // what a boat trip costs.
  //
  // Only when a real price exists. A vertical with nothing priced keeps the
  // plain title rather than inventing a figure to look consistent.
  const { content } = await getFleetView();
  const places = experiencesOfType(content.recommended.items, copy.slug);
  const from = fromPriceOf(places);

  const title = from
    ? `${copy.title} from Rs ${from.toLocaleString("en-US")} | Roulé Rodrigues`
    : `${copy.title} | Roulé Rodrigues`;

  const description = from
    ? `${copy.description} From Rs ${from.toLocaleString("en-US")} per person.`
    : copy.description;

  // The real photograph of a real boat, not the site's generic card. A shared
  // link showing the same picture for a massage and a fishing trip tells
  // whoever sees it that nobody looked.
  const hero = places.find((p) => p.image)?.image;
  const image = hero
    ? hero.startsWith("http")
      ? hero
      : `${SITE_URL}${hero}`
    : `${SITE_URL}/og-image.jpg`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/experiences/${copy.slug}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/experiences/${copy.slug}`,
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ExperiencePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const copy = copyFor(type);
  if (!copy) notFound();

  const { content, businessWhatsApp } = await getFleetView();
  const places = experiencesOfType(content.recommended.items, copy.slug);
  // ONE array, read twice — by the schema below and by the visible section at
  // the bottom. It is impossible for the FAQPage markup to describe a question
  // a human cannot read on the page, which is both a Google requirement and
  // the reason this pattern is worth copying from the scooter page.
  const faq = experienceFaq(copy, places);

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
              // The provider/seller each experience Offer points at. Defined
              // only in the homepage graph until now, so on every experience
              // page the reference resolved to nothing.
              { "@context": "https://schema.org", ...sellerLd() },
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
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

          {faq.length > 0 && (
            <section className="mt-16 border-t border-dark-border pt-10">
              <h2 className="font-syne text-2xl font-bold text-offwhite md:text-3xl">
                Questions fréquentes · Common questions
              </h2>
              <div className="mt-6 space-y-7">
                {faq.map((f) => (
                  <div key={f.q}>
                    <h3 className="font-syne text-lg font-bold text-offwhite">{f.q}</h3>
                    <p className="mt-2 font-dm leading-relaxed text-muted">{f.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <ScrollToTop />
    </>
  );
}
