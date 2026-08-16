import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { getFleetView, buildBrowseCategories, priceNumber } from "@/lib/site-data";
import { organizationLd, touristDestinationLd, websiteLd } from "@/lib/schema";
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
  food: "WhatsApp food concierge",
  stays: "Places to stay",
  activities: "Activities & experiences",
  tours: "Guided island tours",
  "getting-around": "Taxis & island transport",
  events: "Local events guide",
};

// The free tools that live on this page but aren't hub tiles, so they'd
// otherwise be invisible to Google — which is exactly why its AI Overview
// described us as nothing but a scooter platform.
const FREE_TOOLS = [
  { name: "Rodrigues Island travel guide", href: "/guide/rodrigues" },
  { name: "Rodrigues trip planner", href: "/trip-planner" },
  { name: "Interactive island map — beaches & viewpoints", href: "/guide/beaches" },
  { name: "Ti Roulé — AI island guide (English, French, Creole)", href: "/guide/rodrigues" },
];

export default async function Home() {
  const { content, fleet, recentBookings } = await getFleetView();

  // "What are you looking for?" categories (shared with the /browse pages).
  const browseCats = buildBrowseCategories(content, fleet, recentBookings);

  // App-home rails, built from real content only (no invented ratings/prices).
  // A massage, a charter and a sea trip each have their own marketplace now,
  // so the rail links there rather than dumping every one of them into the
  // generic activities list where they appeared twice and lost their price.
  const experiences = content.recommended.items
    .filter((p) => p.category === "activity" && p.name.trim() && (p.image || ""))
    .map((p) => ({
      id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null,
      href: p.serviceType ? `/experiences/${p.serviceType}` : p.isTour ? "/browse/tours" : "/browse/activities",
      // The world fields travel with the card. They used to be dropped here,
      // which is why tagging content in admin changed /experiences but left the
      // homepage identical in both worlds — the data never arrived.
      world: p.world, worldPriority: p.worldPriority,
      featuredAuthentic: p.featuredAuthentic, featuredCurated: p.featuredCurated,
      heroAuthentic: p.heroAuthentic, heroCurated: p.heroCurated,
    }));
  const stays = content.recommended.items
    .filter((p) => p.category === "hotel" && (p.image || ""))
    .map((p) => ({
      id: p.id, name: p.name, image: p.image, price: p.priceNote ?? null, href: "/browse/stays",
      world: p.world, worldPriority: p.worldPriority,
      featuredAuthentic: p.featuredAuthentic, featuredCurated: p.featuredCurated,
      heroAuthentic: p.heroAuthentic, heroCurated: p.heroCurated,
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
    .filter((l) => (l.image || l.images?.[0]) && l.story && ["beach", "viewpoint"].includes(l.category))
    .slice(0, 10)
    .map((l) => ({
      id: l.id,
      name: l.name,
      image: l.image ?? l.images?.[0],
      href: l.category === "beach" ? `/guide/beaches#${l.id}` : `/guide/viewpoints#${l.id}`,
      tag: l.category,
    }));

  // Culture, villages, crafts, storytelling — the island's own life. Landmarks
  // and craft shops are the two things the owner records that are about PEOPLE
  // rather than scenery, so this is where they belong.
  const islandLife = content.mapLocations
    .filter((l) => (l.image || l.images?.[0]) && ["landmark", "shop"].includes(l.category))
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
      .filter((p) => (p.serviceType === "fishing" || p.serviceType === "boat") && (p.image || p.images?.[0]))
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.image ?? p.images?.[0],
        price: p.priceNote ?? null,
        href: `/experiences/${p.serviceType}`,
        world: p.world, worldPriority: p.worldPriority,
        featuredAuthentic: p.featuredAuthentic, featuredCurated: p.featuredCurated,
        heroAuthentic: p.heroAuthentic, heroCurated: p.heroCurated,
      })),
  ].slice(0, 10);

  // Per-card image galleries so the homepage cards auto-cycle through the real
  // photos of each category's contents (all scooters, all cars, all stays…).
  const galleryOf = (items: { image?: string; images?: string[] }[]) =>
    items.flatMap((it) => (it.images?.length ? it.images : it.image ? [it.image] : [])).filter((s): s is string => !!s).slice(0, 6);
  const cardImages = {
    scooter: galleryOf(fleet.filter((f) => (f.category ?? "scooter") === "scooter")),
    car: galleryOf(fleet.filter((f) => f.category === "car")),
    stays: galleryOf(content.recommended.items.filter((p) => p.category === "hotel")),
    exp: galleryOf(content.recommended.items.filter((p) => p.category === "activity")),
    stores: galleryOf(content.mapLocations.filter((l) => l.category === "shop")),
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
  const sameAs = [content.social.instagram, content.social.facebook, content.social.tiktok].filter((u) => u && u.trim());

  // Real daily rates, straight from the fleet. Google's AI Overview was quoting
  // a competitor's "Rs 800/day" for us because we never stated our own price in
  // a machine-readable way — "Rs" as a priceRange says nothing. The hub tiles
  // already show "From Rs 599/day" on this page, so this matches what's visible.
  const dayRates = fleet.map((f) => priceNumber(f.price)).filter((n): n is number => n != null && n > 0);
  const priceRange = dayRates.length
    ? `Rs ${Math.min(...dayRates).toLocaleString("en-US")}–${Math.max(...dayRates).toLocaleString("en-US")} per day`
    : undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      organizationLd({ logo: `${SITE_URL}/icon-192.png`, sameAs: sameAs as string[] }),
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
        name: "Roule Rodrigues",
        // This sentence is what Google's AI Overview paraphrases when someone
        // asks "what is Roule Rodrigues". The old one said scooters, cars and
        // restaurants — so the AI called us "une plateforme de location de
        // scooters" and stopped there. Everything named here is real and
        // reachable from this page's hub.
        description:
          "Roule Rodrigues rents scooters and cars on Rodrigues Island, direct from local owners, from Rs 599 a day with no minimum rental. It is also a free island guide: a trip planner, an interactive map of beaches and viewpoints, recommended places to stay and things to do, a WhatsApp food concierge that books your table, and Ti Roulé — an AI island guide answering in English, French and Creole.",
        knowsLanguage: ["en", "fr", "mfe"],
        url: SITE_URL,
        image: `${SITE_URL}/og-image.jpg`,
        ...(priceRange ? { priceRange } : {}),
        currenciesAccepted: "MUR",
        ...(content.contact.phone ? { telephone: content.contact.phone } : {}),
        address: {
          "@type": "PostalAddress",
          addressLocality: "Port Mathurin",
          addressRegion: "Rodrigues",
          addressCountry: "MU",
        },
        geo: { "@type": "GeoCoordinates", latitude: -19.6833, longitude: 63.4167 },
        areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
        ...(sameAs.length ? { sameAs } : {}),
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
                url: `${SITE_URL}${c.href ?? `/browse/${c.slug}`}`,
                areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
              },
            })),
            ...FREE_TOOLS.map((s) => ({
              "@type": "Offer",
              price: 0,
              priceCurrency: "MUR",
              itemOffered: { "@type": "Service", name: s.name, url: `${SITE_URL}${s.href}` },
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
        reviews={<ReviewsContact contact={content.contact} fleet={fleet} />}
        // Sponsors sit immediately above the footer, which is where the admin
        // panel has always SAID they appear ("shown near the footer") — the
        // component was simply never mounted, so a paying sponsor could be
        // added, switched on, and shown to nobody.
        //
        // Renders nothing unless the strip is enabled AND at least one sponsor
        // has a logo, so a site without sponsors is unchanged.
        footer={
          <>
            <Sponsors enabled={content.sponsorsEnabled} sponsors={content.sponsors} />
            <Footer social={content.social} branding={content.branding} />
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
      />
    </>
  );
}
