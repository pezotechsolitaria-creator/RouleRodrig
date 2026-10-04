import type { Metadata } from "next";
import { SITE_URL, OPENING_HOURS, CONTACT_EMAIL } from "@/lib/site";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import {
  organizationLd,
  touristDestinationLd,
  websiteLd,
  BRAND_ALTERNATE,
  PAYMENT_ACCEPTED,
} from "@/lib/schema";
import { homeDescription, rentalFromPrices } from "@/lib/home-description";
import { isSeedContent } from "@/lib/llms-txt";
import { placeHref } from "@/lib/place-href";
import { shownRating } from "@/lib/business-rating";
import JsonLd from "@/components/JsonLd";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { foodCardImages } from "@/lib/food/queries";
import { listPublicEvents } from "@/lib/events/queries";
import Hero from "@/components/Hero";
import AppHome from "@/components/AppHome";
import ReviewsContact from "@/components/ReviewsContact";
import Footer from "@/components/Footer";
import Sponsors from "@/components/Sponsors";

// The homepage's own canonical. This used to live on the root layout, where
// Next's metadata merging silently applied it to every page that didn't set one
// — pointing the whole marketplace at "/". It belongs here.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// ISR: serve a cached page for instant repeat loads, regenerate every 60s.
// Live booking-calendar availability is fetched client-side, so it stays fresh;
// only the "sold out today" card badge can be up to ~60s behind.
export const revalidate = 60;

// Hub slug → the service name Google should understand. The tile label alone
// ("Scooters", "Stay") reads as a noun, not a service, in a search result.
// Anything not listed falls back to its own label, so a category the owner adds
// in admin still appears rather than vanishing.
const SERVICE_NAME: Record<string, string> = {
  scooter: "Scooter rental",
  car: "Car rental",
  // The food tile links /food, which is ordering now (M50); the concierge
  // lives at /food/concierge. The name has to describe the URL beside it.
  food: "Local food to order",
  stays: "Places to stay",
  activities: "Activities & experiences",
  tours: "Guided island tours",
  "getting-around": "Taxis & island transport",
  events: "Local events guide",
};

// Where a catalogue entry points when that is not its tile's own /browse page.
// "Activities & experiences" pointed at /browse/activities — two listings, and
// a duplicate "Things to Do" title — while /experiences lists all of them and
// is the page with the French twin (SEO audit 2026-09-29 C19).
const SERVICE_URL: Record<string, string> = {
  activities: "/experiences",
};

// The free tools that live on this page but aren't hub tiles, so they'd
// otherwise be invisible to Google — which is exactly why its AI Overview
// described us as nothing but a scooter platform.
const FREE_TOOLS = [
  { name: "Rodrigues Island travel guide", href: "/guide/rodrigues" },
  { name: "Rodrigues trip planner", href: "/trip-planner" },
  // The map is /map. This entry named the interactive map and pointed at
  // /guide/beaches, the written beach guide rather than the map it names
  // (architecture review 2026-09-30, item 5).
  {
    name: "Interactive island map — beaches & viewpoints",
    href: "/map",
  },
  {
    name: "Ti Roulé — AI island guide (English, French, Creole)",
    href: "/guide/rodrigues",
  },
];

export default async function Home() {
  const { content, fleet, recentBookings, reviews } = await getFleetView();
  // The rating the reviews section prints, from the list it is handed below
  // (see the aggregateRating and lib/business-rating.ts).
  const rating = shownRating(reviews);

  // "What are you looking for?" categories (shared with the /browse pages).
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  // App-home rails, built from real content only (no invented ratings/prices).
  // A massage, a charter and a sea trip each have their own marketplace now,
  // so the rail links there rather than dumping every one of them into the
  // generic activities list where they appeared twice and lost their price.
  const experiences = content.recommended.items
    .filter(
      (p) => p.category === "activity" && p.name.trim() && (p.image || ""),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      price: p.priceNote ?? null,
      href: placeHref(p),
      // The world fields travel with the card. They used to be dropped here,
      // which is why tagging content in admin changed /experiences but left the
      // homepage identical in both worlds — the data never arrived.
      world: p.world,
      worldPriority: p.worldPriority,
      featuredAuthentic: p.featuredAuthentic,
      featuredCurated: p.featuredCurated,
      heroAuthentic: p.heroAuthentic,
      heroCurated: p.heroCurated,
    }));
  const stays = content.recommended.items
    .filter((p) => p.category === "hotel" && (p.image || ""))
    .map((p) => ({
      id: p.id,
      name: p.name,
      image: p.image,
      price: p.priceNote ?? null,
      href: "/browse/stays",
      world: p.world,
      worldPriority: p.worldPriority,
      featuredAuthentic: p.featuredAuthentic,
      featuredCurated: p.featuredCurated,
      heroAuthentic: p.heroAuthentic,
      heroCurated: p.heroCurated,
    }));
  // ── THE AUTHENTIC TAXONOMY, AS RAILS ────────────────────────────────────
  //
  // Authentic Rodrigues is "live the island as it truly is", and the owner
  // wrote down what that means: culture and traditions, village discovery and
  // community, nature and the outdoors, everyday local food, crafts and real
  // island life, beaches and landscapes shown plainly.
  //
  // The homepage covered the last of those and none of the rest — it had
  // Discover (which mixed landscapes and landmarks into one bag), Experiences
  // and Stays. Two rails close the gap, in the SAME rail component, with no new
  // design: nothing here is a new look, only content that was already in the
  // owner's admin and had nowhere to appear.
  //
  // Discover narrows to LANDSCAPES so the landmarks can lead their own rail
  // rather than being the tail of somebody else's.
  const discover = content.mapLocations
    .filter(
      (l) =>
        (l.image || l.images?.[0]) &&
        l.story &&
        ["beach", "viewpoint"].includes(l.category),
    )
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      name: l.name,
      image: l.image ?? l.images?.[0],
      href:
        l.category === "beach"
          ? `/guide/beaches#${l.id}`
          : `/guide/viewpoints#${l.id}`,
      tag: l.category,
    }));

  // Culture, villages, crafts, storytelling — the island's own life. Landmarks
  // and craft shops are the two things the owner records that are about PEOPLE
  // rather than scenery, so this is where they belong.
  const islandLife = content.mapLocations
    .filter(
      (l) =>
        (l.image || l.images?.[0]) && ["landmark", "shop"].includes(l.category),
    )
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      name: l.name,
      image: l.image ?? l.images?.[0],
      href: l.category === "shop" ? "/shop" : "/map",
      tag: l.category,
    }));

  // Nature and the outdoors: the trails somebody walks and the boats they go
  // out on. Two different tables in admin, one intent for a visitor — which is
  // exactly why neither had a home on this page before.
  const outdoors = [
    ...content.rideRoutes
      .filter((r) => r.kind === "hike" && (r.image || r.images?.[0]))
      .map((r) => ({
        id: `route-${r.id}`,
        name: r.name,
        image: r.image ?? r.images?.[0],
        price: [r.distance, r.duration].filter(Boolean).join(" · ") || null,
        href: "/guide/routes",
      })),
    ...content.recommended.items
      .filter(
        (p) =>
          (p.serviceType === "fishing" || p.serviceType === "boat") &&
          (p.image || p.images?.[0]),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image ?? p.images?.[0],
        price: p.priceNote ?? null,
        href: placeHref(p),
        world: p.world,
        worldPriority: p.worldPriority,
        featuredAuthentic: p.featuredAuthentic,
        featuredCurated: p.featuredCurated,
        heroAuthentic: p.heroAuthentic,
        heroCurated: p.heroCurated,
      })),
  ].slice(0, 10);

  // Per-card image galleries so the homepage cards auto-cycle through the real
  // photos of each category's contents (all scooters, all cars, all stays…).
  const galleryOf = (items: { image?: string; images?: string[] }[]) =>
    items
      .flatMap((it) =>
        it.images?.length ? it.images : it.image ? [it.image] : [],
      )
      .filter((s): s is string => !!s)
      .slice(0, 6);
  const cardImages = {
    scooter: galleryOf(
      fleet.filter((f) => (f.category ?? "scooter") === "scooter"),
    ),
    car: galleryOf(fleet.filter((f) => f.category === "car")),
    stays: galleryOf(
      content.recommended.items.filter((p) => p.category === "hotel"),
    ),
    exp: galleryOf(
      content.recommended.items.filter((p) => p.category === "activity"),
    ),
    stores: galleryOf(
      content.mapLocations.filter((l) => l.category === "shop"),
    ),
    // Real dish photos, so the Restaurant card cycles food rather than sitting
    // on a gradient. Read through the public catalog RPC, so it can only ever
    // show a dish a customer could actually open. A failure costs the card its
    // photos, never the homepage.
    food: await foodCardImages(await createSupabaseClient()),
  };

  // Upcoming ticketed events for the homepage promo strip. Only what is still
  // ahead and not cancelled, soonest first — a homepage advertising a concert
  // that happened last week is worse than one advertising nothing.
  const promoEvents = (await listPublicEvents(await createSupabaseClient()))
    .filter((e) => e.phase === "upcoming" || e.phase === "in_progress")
    .slice(0, 6)
    .map((e) => ({
      slug: e.slug,
      name: e.name,
      coverUrl: e.coverUrl,
      startsAt: e.startsAt,
      venueName: e.venueName,
      fromPrice: e.fromPrice,
      soldOut: e.remaining <= 0,
    }));

  // ── SEO structured data (JSON-LD) ──
  // Only describes what this page actually SHOWS: the business, the island
  // (the hub + map + planner are all about Rodrigues) and the visible FAQ.
  // Per-vehicle Product markup lives on /browse/[category], where the vehicles
  // are really rendered — marking up off-page content gets it ignored.
  // ── THE GOOGLE BUSINESS PROFILE BELONGS HERE FIRST ───────────────────────
  // sameAs is how a machine learns that this site and that Maps listing are the
  // same business rather than two with a similar name. It is the single most
  // direct signal available for local search, and it is what the profile being
  // claimed is actually FOR — a listing nothing links to is an island of its
  // own, exactly like the French pages were.
  //
  // First in the array deliberately: order carries no formal weight, but this
  // is the authoritative identity and the one a human reading the markup should
  // see first.
  const sameAs = [
    content.social.google,
    content.social.instagram,
    content.social.facebook,
    content.social.tiktok,
  ].filter((u): u is string => Boolean(u && u.trim()));

  // Real daily rates, straight from the fleet. Google's AI Overview was quoting
  // a competitor's "Rs 800/day" for us because we never stated our own price in
  // a machine-readable way — "Rs" as a priceRange says nothing. The hub tiles
  // already show the "From Rs …" price on this page, so this matches what is
  // visible. (That sentence used to name Rs 599 and was wrong: the tiles have
  // rendered the derived minimum for a long time. A comment quoting a hardcoded
  // number is the same drift as the code doing it.)
  const dayRates = fleet
    .map((f) => priceNumber(f.price))
    .filter((n): n is number => n != null && n > 0);

  // The locality the PAGE shows, so the structured data cannot contradict it.
  // content.contact.location is a free-text line like "Baie Aux Huîtres,Rodrigues";
  // the first part is the village.
  const addressLocality =
    (content.contact.location ?? "").split(",")[0].trim() || "Rodrigues";

  // The cheapest priced vehicle per category, over the categories the hub
  // tiles show — the same numbers those tiles print. Null, not a fallback,
  // when a category has nothing priced: the description then prints no figure.
  // Null too on a seed read (getContent() answers DEFAULT_CONTENT when the
  // read fails): the seed's Rs 600 is nobody's price. One helper with the
  // layout's default description, so the two cannot disagree (C4).
  const { scooterFrom, carFrom } = rentalFromPrices(content);
  // The seed's hours ("7:00 AM – 8:00 PM") are not the owner's either — the
  // business is open 24 hours (lib/site.ts) — so a seed read prints none.
  const seedRead = isSeedContent(content);

  // This sentence is what Google's AI Overview paraphrases when someone asks
  // "what is Roule Rodrigues" — and now also what a visitor reads at the end
  // of the page. ONE constant feeding both the JSON-LD description and the
  // visible `about` block, so the claim a machine reads and the text a human
  // sees cannot drift apart.
  //
  // It said who and nothing else: no village, no car price, no way to book or
  // pay (SEO audit 2026-09-29 C4). Built by lib/home-description.ts from live
  // values only — the village and hours from the contact block, the prices
  // from the fleet, the food clauses from whether each food product exists.
  const businessDescription = homeDescription({
    locality: addressLocality,
    scooterFrom,
    carFrom,
    hours: seedRead ? null : content.contact.hours,
    foodOnSale: cardImages.food.length > 0,
    conciergeEnabled: content.foodConcierge?.enabled === true,
  });

  const priceRange = dayRates.length
    ? `Rs ${Math.min(...dayRates).toLocaleString("en-US")}–${Math.max(...dayRates).toLocaleString("en-US")} per day`
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd({
        logo: `${SITE_URL}/icon-192.png`,
        sameAs: sameAs as string[],
      }),
      // Names the site "Roule Rodrigues" in results instead of falling back to
      // the domain (which is why it used to read "Vercel").
      websiteLd(),
      touristDestinationLd(),
      {
        // AutoRental, not bare LocalBusiness: it's the schema.org type that
        // literally means "vehicle rental company", and it inherits everything
        // LocalBusiness gives us. Being specific is how Google resolves what
        // kind of entity this is instead of inferring it from prose.
        "@type": "AutoRental",
        "@id": `${SITE_URL}/#business`,
        // Same edge sellerLd() draws: #business belongs to #organization,
        // stated rather than left for a crawler to infer from a shared name.
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
        name: "Roule Rodrigues",
        // How the island writes it; the visible text is unaccented (C17).
        alternateName: BRAND_ALTERNATE,
        // Defined once above, rendered twice: here for machines, and visibly
        // in AppHome's `about` block for people — see businessDescription.
        description: businessDescription,
        knowsLanguage: ["en", "fr", "mfe"],
        url: SITE_URL,
        image: `${SITE_URL}/og-image.jpg`,
        ...(priceRange ? { priceRange } : {}),
        currenciesAccepted: "MUR",
        // SEO audit 2026-09-29 T8: "can I pay cash?" is asked before anyone
        // books, and no node said. The list is derived from the methods a
        // booking can actually be paid with (lib/schema.ts). The address is
        // the verified routed one (lib/site.ts), which is also what the
        // contact block's mailto prints from content today.
        paymentAccepted: PAYMENT_ACCEPTED,
        email: CONTACT_EMAIL,
        ...(content.contact.phone ? { telephone: content.contact.phone } : {}),
        // ── THE VISIBLE ADDRESS AND THE STRUCTURED ONE DISAGREED ───────────
        // This said "Port Mathurin" while the page rendered
        // "Baie Aux Huîtres, Rodrigues" from content.contact.location — two
        // different villages. Google cross-checks structured data against the
        // visible text and against the business profile, and a locality
        // mismatch is one of the things that keeps a business out of the map
        // pack. It now reads the SAME field the page shows, so the two cannot
        // drift again.
        address: {
          "@type": "PostalAddress",
          addressLocality: addressLocality,
          addressRegion: "Rodrigues",
          addressCountry: "MU",
        },
        // `geo` REMOVED, deliberately. It carried -19.6833, 63.4167 — Port
        // Mathurin's coordinates, for a business the same block now says is in
        // Baie aux Huîtres. A precise point that contradicts the stated
        // locality is worse than no point: it drops the map pin in the wrong
        // village. The right coordinates are the ones on the Google Business
        // Profile, and inventing them here to fill the field would be making
        // up a fact about where somebody's business is.
        // ── WHEN WE ARE OPEN (M143) ────────────────────────────────────────
        // Owner-supplied, and the same constant the contact block renders, so
        // the structured hours and the visible ones cannot drift apart. Google
        // cross-checks them, and a mismatch is the same class of fault as the
        // locality disagreement fixed above.
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [...OPENING_HOURS.days],
            opens: OPENING_HOURS.opens,
            closes: OPENING_HOURS.closes,
          },
        ],
        areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
        ...(sameAs.length ? { sameAs } : {}),
        // ── hasMap, WHICH CLOSES THE geo GAP ABOVE WITHOUT INVENTING ONE ───
        // The block above removed `geo` because a guessed point drops the pin
        // in the wrong village, and noted that the right coordinates are the
        // ones on the Google Business Profile. This is how they get used: not
        // copied here to go stale, but pointed AT, so the listing stays the one
        // source of where this business is. Emitted only once the owner has
        // pasted the profile URL in /admin — blank until then, like the geo.
        ...(content.social.google?.trim()
          ? { hasMap: content.social.google.trim() }
          : {}),
        // ── THE RATING BELONGS TO THE BUSINESS, NOT TO A BIKE ──────────────
        //
        // Ten approved five-star reviews exist and no page has ever emitted a
        // rating, so no search result and no AI answer has ever carried a star
        // for this business.
        //
        // The obvious fix was to backfill product_reviews.scooter_id and let
        // productLd's aggregateRating fire per vehicle. Reading the reviews says
        // otherwise: not one names a model. Five describe a rental ("scooters en
        // très bon état", "la moto était présent dès notre arrivée") and five are
        // about the website, the trip planning, or the service in general.
        // Choosing a bike for each would invent the very fact the schema exists
        // to assert, and putting "great job on the website" inside a
        // Motorcycle's rating is worse than shipping no rating at all.
        //
        // Every one of them IS about this business, so the average lives here on
        // the AutoRental node, where it is true. Per-vehicle stars stay dark
        // until reviews arrive carrying a vehicle — which the review form now
        // asks for, so the count starts with the next one.
        //
        // The SAME rating the page prints (architecture review 2026-09-30,
        // item 5 fix-up). A first draft of item 5 counted every approved review
        // here while the reviews section still printed the average and count of
        // the twelve newest — so from the thirteenth review on, the markup would have
        // stated a rating no visitor could find, which the rich-result rules
        // forbid. Counting them all has to start in components/ReviewsContact
        // (see lib/business-rating.ts); this follows whatever it prints.
        ...(rating
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: rating.ratingValue,
                reviewCount: rating.reviewCount,
                bestRating: 5,
                worstRating: 1,
              },
            }
          : {}),
        // Built from the live hub tiles + the free tools that are actually on
        // this page, so it can never claim a service we don't offer — and a
        // category the owner adds in admin shows up here on its own.
        hasOfferCatalog: {
          "@type": "OfferCatalog",
          name: "Roule Rodrigues services",
          itemListElement: [
            ...browseCats.map((c) => ({
              "@type": "Offer",
              itemOffered: {
                "@type": "Service",
                name: SERVICE_NAME[c.slug] ?? c.label,
                url: `${SITE_URL}${SERVICE_URL[c.slug] ?? c.href ?? `/browse/${c.slug}`}`,
                areaServed: {
                  "@type": "Place",
                  name: "Rodrigues Island, Mauritius",
                },
              },
            })),
            ...FREE_TOOLS.map((s) => ({
              "@type": "Offer",
              price: 0,
              priceCurrency: "MUR",
              itemOffered: {
                "@type": "Service",
                name: s.name,
                url: `${SITE_URL}${s.href}`,
              },
            })),
          ],
        },
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <AppHome
        hero={<Hero hero={content.hero} compact />}
        reviews={<ReviewsContact contact={content.contact} fleet={fleet} initialReviews={reviews} />}
        // Sponsors sit immediately above the footer, which is where the admin
        // panel has always SAID they appear ("shown near the footer") — the
        // component was simply never mounted, so a paying sponsor could be
        // added, switched on, and shown to nobody.
        //
        // Renders nothing unless the strip is enabled AND at least one sponsor
        // has a logo, so a site without sponsors is unchanged.
        footer={
          <>
            <Sponsors
              enabled={content.sponsorsEnabled}
              sponsors={content.sponsors}
            />
            <Footer
              social={content.social}
              branding={content.branding}
              legal={content.legal}
            />
          </>
        }
        lookingFor={content.quickAccess}
        homeCards={content.homeCards}
        experiences={experiences}
        stays={stays}
        discover={discover}
        islandLife={islandLife}
        outdoors={outdoors}
        cardImages={cardImages}
        promoEvents={promoEvents}
        mascot={content.branding.mascotImage}
        logo={content.branding.logo}
        about={businessDescription}
      />
    </>
  );
}
