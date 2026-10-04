import { fitTitleWithTails } from "@/lib/fit-title";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import BackLink from "@/components/BackLink";
import { getFleetView, isSellableFleetItem } from "@/lib/site-data";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { SERVICE_TYPES, type ServiceType, type VehicleCategory } from "@/lib/defaults";
import {
  EXPERIENCES,
  experiencesOfType,
  fromPriceOf,
  experienceFaq,
  providerOf,
  type Wheels,
} from "@/lib/experiences";
import { breadcrumbLd, itemListLd, experienceLd, sellerLd } from "@/lib/schema";
import { placeHref } from "@/lib/place-href";
import { findPlaceBySlug, placeSlug, placesWithOwnPage } from "@/lib/place-slug";
import { guidesForListing, placePrice } from "@/lib/place-detail";
import { experienceMetaDescription } from "@/lib/experience-meta";
import { recommendedCount, robotsWhileEmpty } from "@/lib/listing-gates";
import PlaceDetail from "./PlaceDetail";
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

// Both kinds of page this route serves: the three service listings, and one
// entry per experience that now has an address of its own. Async because the
// second half is owner data, not a constant.
export async function generateStaticParams() {
  const listings = SERVICE_TYPES.map((type) => ({ type }));
  try {
    const { content } = await getFleetView();
    return [
      ...listings,
      ...placesWithOwnPage(content.recommended.items).map((p) => ({
        type: placeSlug(p),
      })),
    ];
  } catch {
    // A content read that fails must not empty the sitemap of the three
    // listing pages, which are constants and never needed it.
    return listings;
  }
}

function copyFor(type: string) {
  return (SERVICE_TYPES as readonly string[]).includes(type)
    ? EXPERIENCES[type as ServiceType]
    : null;
}

// ── WHAT A VISITOR CAN RENT TO REACH A MEETING POINT (architecture review
// 2026-09-30, item 3) ─────────────────────────────────────────────────────────
// Read here, on the server, because isSellableFleetItem lives beside the
// privileged reads and lib/experiences.ts is also bundled for the browser. A
// category is offered only while it is switched on AND has a priced unit —
// the same test /browse/<category> applies before it shows a Book button — so
// "Rent a car" never opens a page that says cars are unavailable. Scooters and
// cars only: they are the rentals that get somebody to a jetty.
const WHEEL_NOUNS: Record<string, string> = { scooter: "scooter", car: "car" };

function bookableWheels(
  categories: VehicleCategory[] | undefined,
  fleet: { category?: string; price: string }[] | undefined,
): Wheels[] {
  return Object.keys(WHEEL_NOUNS)
    .filter(
      (id) =>
        (categories ?? []).some((c) => c.id === id && c.enabled) &&
        (fleet ?? []).some((f) => (f.category ?? "scooter") === id && isSellableFleetItem(f)),
    )
    .map((id) => ({ href: `/browse/${id}`, noun: WHEEL_NOUNS[id] }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const { type } = await params;
  const copy = copyFor(type);
  if (!copy) {
    // Not a service listing — try it as an experience's own page.
    try {
      const { content } = await getFleetView();
      const place = findPlaceBySlug(content.recommended.items, type);
      if (place) {
        const url = `${SITE_URL}/experiences/${placeSlug(place)}`;
        const price = placePrice(place);
        // Same reasoning as the listing titles below: the price pre-qualifies
        // the tap and is the number an assistant repeats.
        // ── THE ISLAND, THEN THE NAME, NEVER THE PRICE ────────────────
        // The boilerplate here is already as short as it can be; what pushes
        // these past 60 characters is the operator's own name — "Île aux Cocos
        // Excursion with Les Inséparables" is 45 on its own, and the title
        // came out at 69 and truncated mid-word in a result.
        //
        // The price never yields: it pre-qualifies the tap. " in Rodrigues"
        // now yields BEFORE the name does (SEO audit 2026-09-29 T6) — keeping
        // it clipped "Île aux Cocos Excursion with Les…", the words that
        // said whose trip it was. A name cut at a word boundary is the last
        // resort, still better than a title Google cuts mid-word.
        const priceTail = price ? ` — Rs ${price.toLocaleString("en-US")}` : "";
        const title = fitTitleWithTails(place.name, priceTail, " in Rodrigues", 60);
        // Built from the listing's fields, not sliced from the operator's
        // prose — see lib/experience-meta.ts for what the slice produced.
        const description = experienceMetaDescription(place);
        const image = place.image || place.images?.[0];
        return {
          title,
          description,
          alternates: { canonical: url },
          openGraph: {
            title,
            description,
            url,
            type: "website",
            ...(image ? { images: [image] } : {}),
          },
        };
      }
    } catch {
      /* fall through to the not-found title */
    }
    return { title: "Not found" };
  }

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

  // The brand suffix is the first thing to go past 60 characters: measured
  // live, "Massage & wellness in Rodrigues from Rs 1,999 | Roule Rodrigues" is
  // 63, and Google cuts the end. The price and the place are what the title is for.
  const priced = from ? `${copy.title} from Rs ${from.toLocaleString("en-US")}` : copy.title;
  const branded = `${priced} | ${SITE_NAME}`;
  const title = branded.length <= 60 ? branded : priced;

  // copy.description is written to 120–128 characters so this still fits 155
  // with a five-figure price; lib/experience-meta.test.ts holds it there.
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
    // ── AN EMPTY VERTICAL IS NOT INDEXED (SEO audit 2026-09-29 C16/T4) ─────
    // "No chauffeurs listed yet" is a soft 404 to Google. noindex, follow —
    // the rule the sitemap applies too (lib/listing-gates.ts) — and the page
    // indexes itself again the moment the first listing is published.
    //
    // Through recommendedCount, the gate app/sitemap.ts uses, never the raw
    // length: getContent() answers a failed read with DEFAULT_CONTENT, whose
    // recommended.items is [], so places.length was 0 for massage, fishing and
    // boat too, and a DB hiccup noindexed them for the 300 s ISR window while
    // the sitemap still submitted them. Unread counts as unknown, not empty.
    ...robotsWhileEmpty(recommendedCount(content, places)),
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

  // ── TWO PAGES, ONE SEGMENT ────────────────────────────────────────────────
  // Next does not allow two dynamic siblings under /experiences, so this route
  // answers both: a SERVICE TYPE renders the listing it always did, and
  // anything else is resolved as one experience's own page. A slug can never
  // shadow a listing — hasOwnPage() refuses any place whose slug is a service
  // type — so the listing always wins the name it already owns.
  if (!copy) {
    const { content, fleet, businessWhatsApp } = await getFleetView();
    const place = findPlaceBySlug(content.recommended.items, type);
    if (!place) notFound();
    return (
      <PlaceDetail
        place={place}
        businessWhatsApp={businessWhatsApp}
        wheels={bookableWheels(content.vehicleCategories, fleet)}
      />
    );
  }

  const { content, businessWhatsApp } = await getFleetView();
  const places = experiencesOfType(content.recommended.items, copy.slug);
  // ONE array, read twice — by the schema below and by the visible section at
  // the bottom. It is impossible for the FAQPage markup to describe a question
  // a human cannot read on the page, which is both a Google requirement and
  // the reason this pattern is worth copying from the scooter page.
  const faq = experienceFaq(copy, places);
  // The guide pages that genuinely cover what this page sells: /guide/hiking
  // on the hiking page, and a place's own guide when one of these listings has
  // one (architecture review 2026-09-30, item 3). No guide, no block.
  const guides = guidesForListing(places, copy.slug);

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
              // The hub level the detail pages already carry; this trail
              // skipped it (SEO audit 2026-09-29 T13).
              breadcrumbLd([
                { name: "Home", url: SITE_URL },
                { name: "Experiences", url: `${SITE_URL}/experiences` },
                { name: copy.title, url: `${SITE_URL}/experiences/${copy.slug}` },
              ]),
              itemListLd(
                copy.title,
                // Each item at its OWN address. This used to repeat the page
                // URL for every entry, so an ItemList of two charters pointed
                // twice at one place and neither could be told apart.
                // itemListLd() drops a repeated address (two listings sharing
                // a slug share a page).
                places.map((p) => ({ name: p.name, url: `${SITE_URL}${placeHref(p)}` })),
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
                  // placePrice(), not depositAmount. The deposit is what holds
                  // the booking, not what the trip costs — on Île aux Cocos
                  // Rs 1,000 against a Rs 2,000 note — so this published half
                  // the real price as the Offer, and nothing at all for the
                  // verticals that set a note and no deposit.
                  price: placePrice(p),
                  description: p.description || undefined,
                  image: p.image || undefined,
                  url: `${SITE_URL}${placeHref(p)}`,
                  // providerOf() skips admin placeholder text, the same as
                  // the detail page, so the two publish one operator.
                  providerName: providerOf(p),
                  durationMinutes: typeof p.durationMinutes === "number" ? p.durationMinutes : null,
                }),
              ),
            ]}
          />
        )}

        <div className="mx-auto max-w-5xl">
          {/* Fallback "/experiences": this page is one vertical of that hub, the door for somebody who does not yet know which one they want. */}
          <BackLink
            fallback="/experiences"
            className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow"
          >
            {" "}Back
          </BackLink>

          <h1 className="mt-3 font-syne text-3xl font-extrabold leading-[1.05] sm:text-4xl">
            <span aria-hidden className="mr-2">{copy.emoji}</span>
            {copy.title}
          </h1>
          <p className="mt-2 max-w-2xl font-dm text-sm text-muted">{copy.subtitle}</p>

          <ExperienceMarket copy={copy} places={places} whatsapp={businessWhatsApp} />

          {guides.length > 0 && (
            <div className="mt-10 grid gap-2 sm:grid-cols-2">
              {guides.map((g) => (
                <Link
                  key={g.href}
                  href={g.href}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-dark-border bg-dark-card px-4 py-3.5 transition-colors hover:border-yellow/50"
                >
                  <span className="min-w-0">
                    <span className="block font-syne text-sm font-bold text-offwhite">{g.label}</span>
                    <span className="mt-0.5 block font-dm text-xs text-muted">{g.blurb}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-yellow" />
                </Link>
              ))}
            </div>
          )}

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
