import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { fromPriceOf } from "@/lib/experiences";
import { listingFaq, listingPlaces } from "@/lib/experiences-faq";
import {
  breadcrumbLd,
  itemListLd,
  productLd,
  stayLd,
  experienceLd,
  sellerLd,
  faqPageLd,
} from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import ListingFaq from "@/components/browse/ListingFaq";
import WhereToGo, { type GuideLink } from "@/components/browse/WhereToGo";
import { ILE_AUX_COCOS_GUIDE } from "@/lib/ile-aux-cocos-listing";
import {
  getFleetView,
  buildBrowseCategories,
  priceNumber,
  isSellableFleetItem,
} from "@/lib/site-data";
import AppPageHeader from "@/components/AppPageHeader";
import Link from "next/link";
import FrenchTwinLink from "@/components/FrenchTwinLink";
import BrowseTabs from "@/components/BrowseTabs";
import Fleet from "@/components/Fleet";
import TrustBar from "@/components/TrustBar";
import BookingSection from "@/components/BookingSection";
import { pickConditions, rentalKindOf } from "@/lib/rental-conditions";
import { vehicleHref, vehicleName } from "@/lib/vehicle-slug";
import RecommendedPlaces from "@/components/RecommendedPlaces";
import { placeHref } from "@/lib/place-href";
import { GUIDE_FOR_PLACE, placePrice } from "@/lib/place-detail";
import GettingAround from "@/components/GettingAround";
import CategoryNotes, { type CategoryNote } from "@/components/browse/CategoryNotes";
import WhatsAppButton from "@/components/WhatsAppButton";
import ScrollToTop from "@/components/ScrollToTop";
import { readTransferFares } from "@/lib/rides/fares";
import { modelCostTable } from "@/lib/vehicle-cost";
import {
  AIRPORT_TRANSFER_PHRASE,
  carAirportPassage,
  categoryFrom,
  categoryMetaDescription,
  categoryTitle,
  deliveryIsFree,
  gettingAroundNotes,
  rentalWhoWherePay,
  STAY_PAY,
  stayCostNote,
  tripCostNote,
  withFreeDelivery,
} from "@/lib/browse-copy";

// ISR (see app/page.tsx). The per-vehicle booking calendar is client-fetched,
// so availability there stays live; card badges can be up to ~60s behind.
export const revalidate = 60;

// Special (non-vehicle) place categories → which items render on each page.
// Activities and Guided Tours share the "activity" category, split by isTour.
type Place = { category: string; isTour?: boolean };
// ── /browse/getting-around ─────────────────────────────────────────────────
// Not in PLACE_SLUGS: that branch reads content.gettingAround, whose three
// options ship with EMPTY descriptions, so there was nothing on the page to
// section. The notes are built by gettingAroundNotes() in lib/browse-copy.ts
// from the fleet and the transfer price list at render time. They used to be
// typed here, and said "A car is from Rs 1,999" beside a /browse/car that said
// Rs 1,899, and "no fixed price list" beside a /transfers that publishes one
// (SEO audit 2026-09-29 C1, C2).

/** A nameless row renders nowhere (RecommendedPlaces drops it), so it must not
 *  be priced, listed or described in markup either — the same predicate
 *  placesWithOwnPage uses (SEO audit 2026-09-29 T2). */
const isNamed = (p: { name?: string | null }) => Boolean(p.name?.trim());

/**
 * `text` with its first `phrase` as a link. The copy stays a plain string —
 * what the paused page prints and what the tests read — and the page decides
 * which words carry the link (SEO audit 2026-09-29 C5: /transfers had three
 * inbound links).
 */
function linkPhrase(text: string, link?: { phrase: string; href: string }): ReactNode {
  const at = link ? text.indexOf(link.phrase) : -1;
  if (!link || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <Link href={link.href} className="underline underline-offset-2 hover:text-yellow">
        {link.phrase}
      </Link>
      {text.slice(at + link.phrase.length)}
    </>
  );
}

const PLACE_SLUGS: Record<
  string,
  {
    label: string;
    filter: (p: Place) => boolean;
    /**
     * Heading shown above the cards. Separate from `label` because `label`
     * also fills the top bar, whose h1 is `max-w-[62%] truncate` at a
     * measured 375x812 — a descriptive heading put there would render as
     * "Where to Stay in Rod...". So the short one stays in the bar and the
     * one that answers the search sits in the page.
     */
    heading?: string;
    /** Intro paragraph above the cards, in place of the shared subtitle. */
    intro?: string;
    /**
     * Sections BELOW the cards, each a real h2.
     *
     * After the h1 fix these pages had no h2 at all — the promoted heading was
     * their only one — leaving 550-740 words with no sectioning. Every claim
     * here is taken from the live listings or from what the site already
     * publishes; see components/browse/CategoryNotes.tsx.
     */
    notes?: CategoryNote[];
    /**
     * The first section, "what it costs", built from the prices on the cards
     * it sits under (lib/browse-copy.ts). A typed range went stale on
     * /browse/tours the day Île aux Cocos was listed at Rs 1,999.
     */
    costNote?: (prices: (number | null)[]) => CategoryNote;
    /** French versions of both. The FR pages outrank everything else here. */
    headingFr?: string;
    introFr?: string;
    /**
     * The French twin, rendered as a VISIBLE link.
     *
     * Must be the page that names this one in its own hreflang, or the pair
     * stops being reciprocal and Google ignores both halves. Only `stays` has
     * one: /fr/que-faire-a-rodrigues is paired with /experiences, not with
     * /browse/activities, and claiming it here would create a second English
     * page pointing at the same French URL.
     */
    frHref?: string;
    frLabel?: string;
    /**
     * The Experiences hub, for the categories that are part of it.
     *
     * /experiences was two weeks old and still "URL is unknown to Google" —
     * correct sitemap entry, correct robots, 200, self-canonical, real anchor
     * text on the homepage, and almost no inbound links. These two pages are
     * its closest relatives and linked it nowhere.
     */
    hubHref?: string;
    hubLabel?: string;
    /**
     * A visible FAQ built from THIS page's listings (architecture review
     * 2026-09-30, item 2): lib/experiences-faq.ts listingFaq(), the hub's own
     * answers kept where they are true here, the price range read off these
     * cards. Never the rental conditions, which were taken off these pages
     * for answering driving-licence questions (see `seo` below).
     */
    faq?: { heading: string; headingFr: string };
    /** The "Where to go" links under everything else (item 1; see WhereToGo). */
    whereToGo?: GuideLink[];
  }
> = {
  restaurants: {
    label: "Restaurants",
    filter: (p) => p.category === "restaurant",
  },
  activities: {
    label: "Activities",
    filter: (p) => p.category === "activity" && !p.isTour,
    hubHref: "/experiences",
    hubLabel: "See every experience on Rodrigues — boat, fishing, hiking and more",
    // The <h1>, so it matches the <title> META.activities was retitled to:
    // "Things to Do in Rodrigues" is /experiences' head term, and a title and
    // h1 that disagree invite Google to rebuild the title from the h1 (SEO
    // audit 2026-09-29 C19/T14). "Que faire à Rodrigues" is the head term of
    // /fr/que-faire-a-rodrigues, /experiences' French twin.
    heading: "Activities in Rodrigues",
    // Deliberately says nothing about how many or what kind: this list is one
    // item some weeks and several others, and an intro that promises variety
    // reads as a lie on the day it holds a single spa treatment.
    intro:
      "Activities on Rodrigues you can book directly with the person who runs them. The price per person and, where the provider has set one, how long the session lasts are shown on each card.",
    headingFr: "Activités à Rodrigues",
    introFr:
      "Des activités à Rodrigues que vous réservez directement auprès de la personne qui les propose. Le prix par personne et, lorsqu’elle est indiquée, la durée de la séance figurent sur chaque fiche.",
    faq: {
      heading: "Activities in Rodrigues — common questions",
      headingFr: "Activités à Rodrigues — questions fréquentes",
    },
  },
  tours: {
    label: "Guided Tours",
    filter: (p) => p.category === "activity" && !!p.isTour,
    hubHref: "/experiences",
    hubLabel: "See every experience on Rodrigues — boat, fishing, hiking and more",
    heading: "Guided Tours & Boat Trips in Rodrigues",
    // Every clause below is a listing that exists: Ile aux Cocos (highlights
    // "Bird sanctuary", "Nature reserve"), Plongee en apnee at Riviere Banane
    // ("coral", "colourful fish"), Peche Traditionelle, and Balade en mer.
    // Three of the four carry durationMinutes 60, hence "several", not "all".
    intro:
      "Boat trips and guided excursions run by local skippers and guides — Île aux Cocos with its bird sanctuary, snorkelling over the coral at Rivière Banane, traditional fishing, and a run out into the lagoon. Prices are per person and shown on each card, several of them about an hour on the water.",
    headingFr: "Excursions et sorties en mer à Rodrigues",
    introFr:
      "Sorties en mer et excursions guidées menées par des skippers et des guides de l’île — l’Île aux Cocos et sa réserve d’oiseaux, la plongée en apnée sur le corail à Rivière Banane, la pêche traditionnelle, et une balade dans le lagon. Les prix sont par personne et figurent sur chaque fiche, plusieurs sorties durant environ une heure.",
    // Grounded the same way the intro below is: three of the four are set at
    // 60 minutes, and the Ile aux Cocos sentence is the operator's own
    // description of the reserve. The price spread is read from the cards.
    costNote: tripCostNote,
    notes: [
      {
        h2: "Île aux Cocos",
        h2Fr: "L’Île aux Cocos",
        body:
          "Île aux Cocos is an uninhabited seabird reserve in the lagoon, about four kilometres west of Rodrigues. You reach it only by boat, and the visit is guided.",
        bodyFr:
          "L’Île aux Cocos est une réserve d’oiseaux marins inhabitée, dans le lagon à environ quatre kilomètres à l’ouest de Rodrigues. On y accède uniquement en bateau, et la visite est guidée.",
      },
      {
        h2: "Who takes you out",
        h2Fr: "Qui vous emmène",
        body:
          "These are island skippers, named on their own listings — the snorkelling at Rivière Banane, the lagoon trip and the traditional fishing are all run by Arnaud. You are booking a person, not a desk.",
        bodyFr:
          "Ce sont des skippers de l’île, nommés sur leur propre fiche : la plongée en apnée à Rivière Banane, la balade en mer et la pêche traditionnelle sont toutes menées par Arnaud. Vous réservez auprès d’une personne, pas d’un guichet.",
      },
    ],
    faq: {
      heading: "Tours and boat trips — common questions",
      headingFr: "Excursions et sorties en mer — questions fréquentes",
    },
  },
  // ── WHY THIS ONE CARRIES COPY AND THE OTHERS DO NOT (M146) ───────────
  // /browse/stays was indexed and drew zero impressions for any
  // accommodation query in 90 days — not a ranking problem, an absence:
  // 635 characters of unique text, headed "Accommodations", with no price
  // and not one of the words a guest actually types. Every claim below is
  // taken from the live listings, not invented to fill space.
  stays: {
    label: "Accommodations",
    filter: (p) => p.category === "hotel",
    heading: "Where to Stay in Rodrigues",
    intro:
      "Guesthouses, self-catering villas and small hotels across Rodrigues — among them sea views, breakfast, air conditioning and a pool. Each is run by an independent local owner: see the nightly price on the card, then book or enquire with them directly.",
    frHref: "/fr/hebergement-rodrigues",
    frLabel: "Hébergement à Rodrigues — cette page en français",
    headingFr: "Où loger à Rodrigues",
    introFr:
      "Chambres d’hôtes, villas avec cuisine et petits hôtels à Rodrigues — vue sur mer, petit-déjeuner, climatisation et piscine selon les adresses. Chaque hébergement est tenu par un propriétaire local indépendant : le prix par nuit est indiqué sur la fiche, puis vous réservez ou vous vous renseignez directement auprès de lui.",
    // The nightly range is read from the cards (stayCostNote); two places
    // quote self-catering per person rather than per room.
    costNote: stayCostNote,
    notes: [
      {
        h2: "Self-catering, or breakfast included",
        h2Fr: "Avec cuisine, ou petit-déjeuner compris",
        body:
          "Several of these are self-contained — a kitchen, a lounge and your own front door rather than a single room. Others include breakfast, and one or two price both separately, so it is worth reading the card before you enquire.",
        bodyFr:
          "Plusieurs de ces adresses sont indépendantes : une cuisine, un salon et votre propre entrée plutôt qu’une simple chambre. D’autres incluent le petit-déjeuner, et certaines proposent les deux formules à des tarifs différents — lisez la fiche avant de vous renseigner.",
      },
      {
        h2: "Booking direct with the owner",
        h2Fr: "Réserver directement auprès du propriétaire",
        // How it is paid, cash included, from lib/browse-copy.ts STAY_PAY:
        // this page said nothing about paying (SEO audit 2026-09-29 C4). Kept
        // in this note rather than a fourth section, so the page keeps its
        // three h2s.
        body: `Every place here is run by an independent local owner. You book or enquire with them directly and agree the details with the person who actually runs it, rather than through a desk that has never seen the room. ${STAY_PAY.en}`,
        bodyFr: `Chaque hébergement est tenu par un propriétaire local indépendant. Vous réservez ou vous vous renseignez directement auprès de lui et vous convenez des détails avec la personne qui tient les lieux, pas avec une agence qui n’a jamais vu la chambre. ${STAY_PAY.fr}`,
      },
    ],
    whereToGo: [
      {
        href: "/guide/rodrigues",
        label: {
          en: "The Rodrigues island guide",
          fr: "Le guide de l’île Rodrigues",
          cr: "Gid zil Rodrig",
        },
      },
      {
        href: "/guide/beaches",
        label: { en: "The beaches of Rodrigues", fr: "Les plages de Rodrigues", cr: "Bann laplaz Rodrig" },
      },
    ],
  },
};

// ── WHERE TO GO (architecture review 2026-09-30, item 1) ────────────────────
// The guides link to these pages and these pages linked back to none of them:
// only the per-vehicle pages carried "Where people take it". So a renter who is
// not ready to book had nowhere to go but away, and the guides — the only
// pages with search authority — got nothing back from the pages that sell.
//
// Fixed routes, each one a page that exists whatever the data holds (none of
// them 404s on an empty list), labelled by what the page is and with no count:
// the guides count their own entries live, and a number typed here would drift
// the way the hub titles did. Rendered at the very bottom — below the fleet,
// the booking form and the notes, never above the booking flow.
//
// Each label in English, French and Kreol, rendered by the client leaf
// components/browse/WhereToGo.tsx: the notes above it follow the visitor's
// language, and a block that stayed English under them read as broken. It
// still server-renders, so a crawler reads the links without a script.
const VIEWPOINTS: GuideLink = {
  href: "/guide/viewpoints",
  label: { en: "Viewpoints and landmarks", fr: "Points de vue et sites", cr: "Bel vi ek sit pou vizite" },
};
const MAP_LINK: GuideLink = {
  href: "/map",
  label: { en: "The island map", fr: "La carte de l’île", cr: "Kart zil la" },
};
const RIDE_GUIDES: Record<"scooter" | "car", GuideLink[]> = {
  scooter: [
    {
      href: "/guide/routes",
      label: {
        en: "Scooter routes around the island",
        fr: "Itinéraires en scooter autour de l’île",
        cr: "Bann trazet skooter dan lil",
      },
    },
    {
      href: "/guide/beaches",
      label: { en: "Beaches worth the ride", fr: "Les plages qui valent le trajet", cr: "Laplaz ki vo lapenn" },
    },
    VIEWPOINTS,
    MAP_LINK,
  ],
  car: [
    {
      href: "/guide/routes",
      label: { en: "Routes around the island", fr: "Itinéraires autour de l’île", cr: "Bann trazet dan lil" },
    },
    {
      href: "/guide/beaches",
      label: { en: "Beaches worth the drive", fr: "Les plages qui valent le trajet", cr: "Laplaz ki vo lapenn" },
    },
    VIEWPOINTS,
    MAP_LINK,
  ],
};

// ── The vehicle pages said almost nothing (the stays fault, on the pages
// that sell) ─────────────────────────────────────────────────────────────
// /browse/scooter rendered ~400 characters of text and /browse/car ~480,
// while their French twins carry full landing copy and OUTRANK them for the
// same intent (Search Console: /fr pages at position ~5, these at ~40–53).
// Same absence M146 fixed on stays: the words a renter actually types were
// nowhere in the page. Heading + intro follow the stays pattern above. The
// from-price is DERIVED from the fleet this page renders — hardcoding one
// here is the Rs 599/699 drift this codebase has already been burned by —
// and every claim is made elsewhere on the site already: free helmet in
// t.booking.included, the 3+/7+ day discounts in lib/booking-pricing,
// guest-house delivery in the approved reviews rendered on the homepage.
const VEHICLE_COPY: Record<
  string,
  {
    heading: string;
    /** `from` is the cheapest daily rate; `deliveryFee` is this category's
     *  delivery charge and `freeDelivery` is deliveryIsFree() — both from the
     *  CMS, so the sentence cannot drift from what checkout charges or from
     *  the owner's own price notes. `pay` is rentalWhoWherePay(), placed
     *  before the call to action (SEO audit 2026-09-29 C4 fix 2: "the same
     *  who/where/pay sentence in both VEHICLE_COPY intros"), so the
     *  paragraph still ends on what to do next. */
    intro: (o: {
      from: number | null;
      deliveryFee?: number;
      freeDelivery?: boolean;
      pay?: string | null;
    }) => string;
    /** Words in the intro rendered as a link (see linkPhrase). */
    link?: { phrase: string; href: string };
    frLabel?: string;
  }
> = {
  scooter: {
    heading: "Scooter Rental in Rodrigues",
    // "delivered free" was unconditional here. It is now said only when
    // deliveryIsFree() allows it: the fee checkout charges is 0 and no
    // scooter's own note puts a condition on delivery (SEO audit 2026-09-29,
    // rule: nothing is "free" unless its charge is zero; C20).
    intro: ({ from, freeDelivery, pay }) =>
      `Rent a scooter in Rodrigues direct from local owners${
        from ? ` — from Rs ${from.toLocaleString("en-US")} a day` : ""
      }, helmet included and delivered${
        freeDelivery ? " free" : ""
      } to your guest house. We hand over in person, with real advice on the roads and the places worth riding to.${
        pay ? ` ${pay}` : ""
      } Pick a scooter below and book your dates online.`,
    frLabel: "Location de scooter à Rodrigues — cette page en français",
  },
  car: {
    heading: "Car Rental in Rodrigues",
    // WHAT CHANGED AND WHY.
    //
    // "with discounts from 3 days" was false: the automatic 10%/15% tiers came
    // out of lib/booking-pricing.ts in M159, so the rate table renders exactly
    // 1x, 3x and 7x the daily rate. A commercial page cannot promise a discount
    // the checkout will not give.
    //
    // The delivery fee is now stated rather than implied. When the car
    // category carries a fee (content.vehicleCategories) the fleet card prints
    // "+ Rs N delivery" -- so an intro that said only "we deliver to your
    // guest house" was quietly setting up the contradiction. At a fee of 0 it
    // says nothing about the charge: the Swift's own note puts a condition on
    // free delivery (C20), and deliveryIsFree() is what decides "free".
    //
    // Airport, Plaine Corail, automatic, air-conditioned and which side of the
    // road are here because the EN car pages contained ZERO occurrences of any
    // of them, while the French page answers all of those questions and is the
    // best car page on the site. These are the things a car renter searches for.
    //
    // The transfer sentence is the way out for somebody who would rather not
    // drive off the plane, and the car page's link to /transfers (SEO audit
    // 2026-09-29 C5). The /fr car page has offered the same all along.
    intro: ({ from, deliveryFee, pay }) =>
      `Hire a car in Rodrigues from local owners${
        from ? ` — clear daily rates from Rs ${from.toLocaleString("en-US")} a day` : ""
      }${
        deliveryFee ? `, plus Rs ${deliveryFee.toLocaleString("en-US")} delivery` : ""
      }. Automatic, air-conditioned and insured — the easy choice for families, longer stays and the rainy season. We bring the car to your guest house or meet you at Plaine Corail airport, hand over in person and explain the island's roads before you set off; on Rodrigues you drive on the left, as in Mauritius. Rather not drive on arrival? Book an ${AIRPORT_TRANSFER_PHRASE} instead.${
        pay ? ` ${pay}` : ""
      } Choose a car below and book your dates online.`,
    link: { phrase: AIRPORT_TRANSFER_PHRASE, href: "/transfers" },
    frLabel: "Location de voiture à Rodrigues — cette page en français",
  },
};

// ── SEO ──────────────────────────────────────────────────────────────
// Each browse page targets a distinct search intent. Without this they all
// inherit the root layout's title and read to Google as duplicates of the
// homepage. Titles stay under ~60 chars and descriptions under ~155 so they
// aren't truncated in results. No prices here — they'd go stale silently.
// `fr` = the URL of this page's French equivalent. hreflang only works if BOTH
// pages point at each other — a one-way annotation is silently ignored, so this
// must stay in sync with the `languages` block on the French page.
const META: Record<
  string,
  { title: string; description: string; fr?: string }
> = {
  // ── THE PRICE BELONGS IN THE TITLE ──────────────────────────────────────
  // These two are the transactional money pages and neither title carried a
  // number, a delivery promise or anything a competitor's title does not also
  // say. On a result Google already shows around position 20, the title is the
  // only lever that moves clicks without moving rank.
  //
  // " | Roule Rodrigues" is appended by pageMeta(), so it is deliberately not
  // repeated here; these read ~42 characters, which survives truncation with
  // the brand suffix attached.
  // ── NO PRICE IN THESE LITERALS. IT IS READ FROM THE FLEET BELOW ─────────
  //
  // I hardcoded "from Rs 1,999/day" into the car title on 2026-09-09, checked
  // against the fleet that day, and it was WRONG BY THE NEXT MORNING: the
  // owner repriced the Swift to Rs 1,899 and the title kept quoting 1,999
  // while the body paragraph — which derives from the fleet — correctly said
  // 1,899. The page contradicted itself, and the half Google shows was the
  // wrong half.
  //
  // A price a human types in one place and a machine derives in another WILL
  // drift; the only question is how long it takes. Here it took a day. So the
  // title and the description now take theirs from the same fleet the grid
  // renders, and there is a test that fails if they ever disagree again.
  // ── "free" IS NOT WRITTEN HERE ─────────────────────────────────────────
  // Both said "delivered free to your guest house" while cars carried a
  // Rs 600 fee. withFreeDelivery() adds the word only when deliveryIsFree()
  // does: the fee is 0 AND no unit's own note puts a condition on delivery
  // (SEO audit 2026-09-29, C20).
  //
  // Every description on a priced page (vehicles, stays, activities, tours)
  // leaves room for " From Rs 9,999." inside 155 characters, because
  // categoryMetaDescription() puts the price there and the price is the part
  // Google used to cut (T7). lib/browse-copy.test.ts measures them.
  scooter: {
    title: "Scooter Rental Rodrigues",
    description:
      "Rent a scooter in Rodrigues, delivered to your guest house. Helmets included, no minimum hire, and real local advice on where to ride.",
    fr: "/fr/location-scooter-rodrigues",
  },
  car: {
    title: "Car Rental Rodrigues",
    description:
      "Rent a car in Rodrigues, delivered to your guest house. Automatic, air-conditioned and insured, booked direct with local owners.",
    fr: "/fr/location-voiture-rodrigues",
  },
  stays: {
    title: "Where to Stay in Rodrigues",
    description:
      "Guesthouses, self-catering houses and villas across Rodrigues, picked by locals. See photos and prices, then book direct with the owner.",
    // A one-way hreflang is silently ignored, so this half matters as much as
    // the one the French page declares.
    fr: "/fr/hebergement-rodrigues",
  },
  // ── NOT "Things to Do in Rodrigues" ──────────────────────────────────────
  // That is /experiences' title, and this page lists a subset of it: two
  // pages, one query (SEO audit 2026-09-29 C19/T14). Whether this page should
  // redirect there is the owner's decision; until then it names what it is.
  // The description promised "Kitesurfing, snorkelling, hiking" on a page
  // listing a massage and a hike, so it now promises no kind at all — the
  // same rule its intro below is written under.
  activities: {
    title: "Activities in Rodrigues",
    description:
      "Activities in Rodrigues you book directly with the person who runs them. See the photos and the price per person on each listing.",
  },
  tours: {
    title: "Guided Tours in Rodrigues",
    description:
      "Guided tours and boat trips in Rodrigues with local guides and skippers: Île aux Cocos, the lagoon, snorkelling and fishing. Book direct.",
  },
  "getting-around": {
    // ── NOT "How to Get Around Rodrigues Island" ──────────────────────────
    // That was the title here AND on /blog/how-to-get-around-rodrigues, word
    // for word, so the two pages competed for one query and Google had to pick
    // one. The blog post is the article that answers "how do I get around" —
    // informational intent, and it should keep the phrase.
    //
    // This page is a list of taxis, car hire and scooter hire with prices and
    // links, so it takes the transactional half instead. Different intent,
    // different title, and they stop cannibalising each other. The <h1> stays
    // "Getting Around Rodrigues", which is what the page is.
    title: "Taxi, Car & Scooter Hire in Rodrigues",
    // Was 156 characters (SEO audit 2026-09-29 T15).
    description:
      "Getting around Rodrigues: taxis, airport transfers, scooter and car hire. Compare real local prices and contact drivers direct, no booking fees.",
  },
  events: {
    title: "Events & Festivals in Rodrigues Island",
    description:
      "What's on in Rodrigues right now: festivals, markets, live sega and local events, with dates and places. Updated by locals — plan your trip around them.",
  },
};

function pageMeta(
  title: string,
  description: string,
  category: string,
  fr?: string,
  image?: string,
): Metadata {
  const url = `${SITE_URL}/browse/${category}`;
  const images = [image ?? `${SITE_URL}/og-image.jpg`];
  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(fr
        ? {
            languages: {
              "en": url,
              "fr": `${SITE_URL}${fr}`,
              "x-default": url,
            },
          }
        : {}),
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "Roule Rodrigues",
      type: "website",
      images,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;

  // Category-specific preview image, from the live fleet: a shared /browse/scooter
  // shows a scooter and /browse/car shows the Suzuki Swift — not one generic
  // photo for both. Non-vehicle categories fall back to the site OG image.
  let ogImage: string | undefined;
  let cats: ReturnType<typeof buildBrowseCategories> | null = null;
  // Hoisted out of the try: the title below needs the listings to price itself,
  // and a content read that half-failed must leave it null so the page falls
  // back to its plain title rather than to a price nobody honours.
  let listings: Parameters<typeof buildBrowseCategories>[0]["recommended"]["items"] | null = null;
  // The cheapest REAL daily rate in this vehicle category, for the title. Same
  // fleet, same filter and same price parser the grid uses, so the title cannot
  // advertise a rate the page below it does not show.
  let vehicleFrom: number | null = null;
  // May this category's delivery be called free (deliveryIsFree, C20)? False
  // for a place category or a failed read, and then nothing is called free.
  let freeDelivery = false;
  try {
    const { content, fleet, recentBookings } = await getFleetView();
    cats = buildBrowseCategories(content, fleet, recentBookings);
    // Named rows only: a nameless one renders nowhere, so its price must not
    // become the title's "from" (SEO audit 2026-09-29 T2).
    listings = content.recommended.items.filter(isNamed);
    freeDelivery = deliveryIsFree(fleet, category, content.vehicleCategories);
    const rates = fleet
      .filter((f) => (f.category ?? "scooter") === category)
      .filter(isSellableFleetItem)
      .map((f) => priceNumber(f.price))
      .filter((n): n is number => n != null);
    vehicleFrom = rates.length ? Math.min(...rates) : null;
    const first = fleet.find(
      (f) => (f.category ?? "scooter") === category && f.image,
    );
    if (first?.image)
      ogImage = first.image.startsWith("http")
        ? first.image
        : `${SITE_URL}${first.image}`;
  } catch {
    /* fall back to default image / no live cats */
  }

  const m = META[category];
  if (m) {
    // ── PRICE IN THE TITLE, THE WAY THE PAGES THAT SELL DO IT (M138) ───────
    //
    // "Location scooter Rodrigues dès Rs 699/jour" converts; "Where to Stay in
    // Rodrigues Island" does not. A price pre-qualifies the click: somebody who
    // sees Rs 1,000 and taps is a customer, and somebody who taps a priceless
    // title, meets Rs 7,000 and leaves teaches the ranking that this result did
    // not answer the question.
    //
    // Only for the place categories, and only when the listings actually carry
    // a price. The vehicle categories already say it in their French siblings,
    // and a category with nothing priced keeps its plain title rather than
    // inventing a figure to look consistent.
    const placeFilter = PLACE_SLUGS[category]?.filter ?? null;
    const from =
      placeFilter !== null && listings !== null
        ? fromPriceOf(listings.filter(placeFilter))
        : // Vehicle categories price themselves from the fleet. A category with
          // nothing sellable keeps its plain title rather than inventing a
          // figure to look consistent.
          vehicleFrom;
    // Built in lib/browse-copy.ts so the 60/155 limits are enforced and
    // tested rather than eyeballed: the price used to trail the description
    // past character 155, where Google cut it (SEO audit 2026-09-29 T7).
    return pageMeta(
      categoryTitle(m.title, from),
      categoryMetaDescription(withFreeDelivery(m.description, freeDelivery), from),
      category,
      m.fr,
      ogImage,
    );
  }

  // Not in the curated map — it may still be a real category the owner added in
  // admin (e.g. "Kayaks"). Use its live label so it gets a unique title rather
  // than colliding with every other page on a generic one.
  const cat = cats?.find((c) => c.slug === category);
  if (cat) {
    return pageMeta(
      `${cat.label} in Rodrigues Island | Roule Rodrigues`,
      `${cat.label} in Rodrigues, available to book directly with local owners. See photos, prices and availability on Roule Rodrigues.`,
      category,
      undefined,
      ogImage,
    );
  }

  // Genuinely unknown slug → this renders the not-found page, so don't hand
  // Google a canonical for a URL that isn't a real page.
  return {
    title: "Page not found | Roule Rodrigues",
    robots: { index: false, follow: false },
  };
}

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  // Restaurants are handled by the WhatsApp food concierge, not a listing.
  if (category === "restaurants") redirect("/food");
  // Events are handled by /events, which sells the tickets AND now lists the
  // owner's free-text "What's on" notices underneath. This page was the second
  // thing called Events, and it called notFound() whenever the notice list was
  // empty — so an Events link could land on "Lost on the island".
  if (category === "events") redirect("/events");
  const { content, fleet, ratings, recentBookings, businessWhatsApp } =
    await getFleetView();
  const cats = buildBrowseCategories(content, fleet, recentBookings);

  // The rental terms shown beside the booking form AND described in the
  // FAQPage markup below. One call, so the structured data can never claim a
  // question the visible panel does not render — which is the exact thing
  // Google's FAQ guideline forbids, and the exact thing that happens when two
  // lists are maintained separately.
  //
  // With the category's rentalKind (architecture review 2026-09-30, rentalKind
  // fix-up): only the per-vehicle page passed it, so /browse/kayak -- the page
  // with the booking form -- would still have listed a licence, fuel, mileage
  // and the Rs 5,000 car deposit as the terms of hiring a kayak, in the panel
  // and in the FAQPage. "motor" (every live category) returns the same list.
  const kind = rentalKindOf(content.vehicleCategories, category);
  const conditionItems = pickConditions(content.faq?.items, category, kind);

  // Breadcrumb trail (Home › This page) + the listing itself, so Google shows
  // a real trail under the result instead of a bare URL.
  // withFaq, because the FAQPage below describes SCOOTER RENTAL and only the
  // vehicle branch renders it visibly. Verified live before this parameter
  // existed: /browse/stays, /browse/tours and /browse/activities each published
  // all eight questions -- "What is the minimum age to rent?", "Do I need a
  // driving licence?", "Is insurance included?" -- and zero of them appeared
  // anywhere in those pages' text.
  //
  // Google requires FAQ markup to match content the visitor can read; markup
  // for invisible content is the exact thing that guideline exists to stop. It
  // was also telling Google that a page about guest houses is about driving
  // licences, which is a topical-relevance leak on three commercial pages.
  // Each item carries its own page's url: a list of names gave a crawler no
  // route to the priced detail pages (SEO audit 2026-09-29 T13). itemListLd()
  // keeps one ListItem per url, so the twin AVENIS rows are listed once.
  const seo = (label: string, items: { name: string; url?: string }[], withFaq = false) => (
    <JsonLd
      data={[
        breadcrumbLd([
          { name: "Home", url: SITE_URL },
          { name: label, url: `${SITE_URL}/browse/${category}` },
        ]),
        itemListLd(label, items),
        // ── FAQPage, and only now that it is honest ────────────────────────
        //
        // Google requires the questions and answers to be VISIBLE on the page
        // carrying this markup — schema for content a visitor cannot read is
        // exactly what the guideline exists to stop. Until RentalConditions
        // landed there was nothing to point at here, which is why FAQPage was
        // live on twelve guide pages and zero conversion pages.
        //
        // Same source as the panel, so the two can never disagree: if the owner
        // edits an answer in admin, the visible text and the structured data
        // move together.
        ...(withFaq && conditionItems.length
          ? [
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "@id": `${SITE_URL}/browse/${category}#faq`,
                mainEntity: conditionItems.map((f) => ({
                  "@type": "Question",
                  name: f.question,
                  acceptedAnswer: { "@type": "Answer", text: f.answer },
                })),
              },
            ]
          : []),
      ]}
    />
  );

  // App-style top bar (back to Explore + page title + language). Replaces the
  // marketing navbar on this redesigned surface; the global BottomNav does the rest.
  // titleAs is a parameter because the VEHICLE pages have a better h1 available
  // than this bar has. The bar shows the one-word nav label -- on /browse/car
  // that label is "Cars", which was the page's <h1> while the actual keyword
  // heading, "Car Rental in Rodrigues", sat below it as an <h2>. The strongest
  // heading on a commercial page was a nav crumb. The other two callers keep
  // the bar as their h1 because they have no competing heading.
  const header = (title: string, titleAs: "h1" | "span" = "h1") => (
    <AppPageHeader title={title} titleAs={titleAs} backHref="/#explore" />
  );
  const footer = (
    <>
      <WhatsAppButton
        phone={content.contact.phone}
        whatsapp={content.social.whatsapp}
        numbers={content.contact.whatsappNumbers}
      />
      <ScrollToTop />
    </>
  );

  // ── Vehicles (scooters / cars / other) ──
  // ── A SWITCHED-OFF CATEGORY MUST NOT 404 AN INDEXED PAGE (M190) ──────────
  //
  // On 2026-09-09 the owner turned the Cars category off in /admin while he was
  // adding vehicles. /browse/car began returning the "Lost on the island"
  // screen with <meta name="robots" content="noindex">, because a disabled
  // category matched no branch on this page and fell through to notFound() at
  // the bottom. Nothing warned him.
  //
  // That page is in the sitemap, carries reciprocal hreflang from
  // /fr/location-voiture-rodrigues, and is one of the two pages the business
  // sells from. A 404 is how you tell Google to DELETE a URL; it is the wrong
  // answer to "this is paused for an afternoon", and it throws away whatever
  // ranking the page had.
  //
  // So the lookup is split. A category that does not exist at all still 404s
  // -- /browse/hovercraft should. A category that exists and is switched off
  // keeps its URL, its heading and its copy at HTTP 200, and says plainly that
  // it is unavailable. That is the same shape Google asks for on a temporarily
  // out-of-stock product: keep the page, state the availability.
  const vcatAny = content.vehicleCategories.find((c) => c.id === category);
  const vcat = vcatAny?.enabled ? vcatAny : undefined;

  if (vcatAny && !vcat) {
    const pausedCopy = VEHICLE_COPY[vcatAny.id];
    const other = content.vehicleCategories.find((c) => c.enabled && c.id !== vcatAny.id);
    return (
      <>
        {header(vcatAny.label, "span")}
        <main className="bg-dark min-h-screen px-4 pb-24 pt-6">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-[11px] tracking-[0.3em]">
              ROULE RODRIGUES
            </p>
            {/* The h1 and the intro stay. They are what this URL ranks on, and
                a pause is not a reason to throw that away. */}
            <h1 className="mt-1 font-syne text-2xl font-extrabold text-offwhite md:text-3xl">
              {pausedCopy?.heading ?? vcatAny.label}
            </h1>
            <p className="mt-4 rounded-2xl border border-yellow/40 bg-yellow/10 px-4 py-3 font-dm text-sm text-offwhite">
              {vcatAny.label} are not available to book right now. Message us on
              WhatsApp and we will tell you the moment they are back.
            </p>
            {pausedCopy ? (
              <p className="mt-4 font-dm text-sm leading-relaxed text-muted">
                {linkPhrase(pausedCopy.intro({ from: null }), pausedCopy.link)}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {other ? (
                <Link
                  href={`/browse/${other.id}`}
                  className="inline-flex min-h-[48px] items-center rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark"
                >
                  See {other.label.toLowerCase()} instead
                </Link>
              ) : null}
              <Link
                href="/browse/getting-around"
                className="inline-flex min-h-[48px] items-center rounded-full border border-dark-control px-5 font-dm text-sm text-offwhite"
              >
                Other ways to get around
              </Link>
            </div>
          </div>
        </main>
        {footer}
      </>
    );
  }

  if (vcat) {
    // Unpriced rows are unfinished drafts, not stock — see
    // isSellableFleetItem. They fall out here, so a category holding only
    // drafts correctly reads as "nothing to rent today" rather than
    // listing a car somebody could book for Rs 0.
    const items = fleet.filter(
      (f) => (f.category ?? "scooter") === vcat.id && isSellableFleetItem(f),
    );
    // Same reasoning as the disabled case, for the same URL: an empty fleet is
    // "nothing to rent today", not "this page never existed".
    if (items.length === 0) {
      return (
        <>
          {header(vcat.label, "span")}
          <main className="bg-dark min-h-screen px-4 pb-24 pt-6">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-syne text-2xl font-extrabold text-offwhite md:text-3xl">
                {VEHICLE_COPY[vcat.id]?.heading ?? vcat.label}
              </h1>
              <p className="mt-4 rounded-2xl border border-yellow/40 bg-yellow/10 px-4 py-3 font-dm text-sm text-offwhite">
                Everything in this category is out on hire right now. Message us
                on WhatsApp and we will find you something.
              </p>
            </div>
          </main>
          {footer}
        </>
      );
    }
    const vcopy = VEHICLE_COPY[vcat.id];
    // Cheapest real daily rate on THIS page, for the intro sentence — derived
    // from the same fleet the cards render, so the copy can never advertise a
    // price the grid below does not show.
    const vRates = items
      .map((i) => priceNumber(i.price))
      .filter((n): n is number => n != null && n > 0);
    const vFrom = vRates.length ? Math.min(...vRates) : null;
    // The French twin, as a VISIBLE link and not only an hreflang annotation:
    // /fr/location-voiture-rodrigues had zero internal inbound links, so
    // Google left it "Discovered - currently not indexed" while ranking THIS
    // thinner page around position 50-70 for French car queries.
    const vFrHref = META[vcat.id]?.fr;
    // Who rents, from where, and how to pay — from the contact line (SEO
    // audit 2026-09-29 C4). It goes inside the intro, before the call to
    // action; the intro has already said the delivery.
    const whoWherePay = rentalWhoWherePay({
      category: vcat.id,
      location: content.contact.location,
    });
    // One answer to "is delivery free?" for the intro, the airport passage
    // and the metadata: the fee checkout charges, read against the owner's
    // own price notes (C20).
    const freeDelivery = deliveryIsFree(items, vcat.id, content.vehicleCategories);
    // ── WHAT CAR HIRE COSTS, AND THE AIRPORT (SEO audit 2026-09-29 C18) ────
    // "car rental rodrigues (price / airport)" land here, and the page showed
    // only per-day cards while each model's own page had the 1-day / 3-day /
    // 1-week table. Same helper as that table, so the two cannot disagree.
    // The security deposit is the owner's FAQ answer, verbatim — a different
    // sum from the part-payment that confirms a booking (lib/rental-conditions),
    // so the two are printed apart below. Four columns at 375px: prices never
    // wrap, names do, and the wrapper scrolls rather than the page.
    const carCosts = vcat.id === "car" ? modelCostTable(items, content.vehicleCategories) : [];
    const securityDeposit = conditionItems.find((c) => c.id === "deposit")?.answer;
    const airport =
      vcat.id === "car"
        ? carAirportPassage({
            location: content.contact.location,
            deliveryFee: vcat.deliveryFee,
            freeDelivery,
          })
        : null;
    return (
      <>
        {seo(
          vcat.label,
          items.map((i) => ({ name: vehicleName(i), url: `${SITE_URL}${vehicleHref(i)}` })),
          // The only branch that renders <RentalConditions> visibly.
          true,
        )}
        {/* The vehicles are rendered on THIS page, so this is where their
            Product markup belongs — with real ratings where reviews exist. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              // The seller every Offer below points at. Verified live before
              // this: /browse/scooter referenced the #business @id once and
              // defined it zero times, because the node lived only in the
              // homepage graph. On the page that actually sells a scooter, the
              // one thing an Offer exists to state — who is selling — was a
              // dangling pointer.
              sellerLd(),
              // ONE Product per URL, not one per fleet row. The fleet models
              // physical units — the owner runs two AVENIS 125cc and two
              // Swifts — but slugs come from the NAME, so twin units share a
              // detail URL. Emitting a Product per unit published the same
              // URL twice with, for the Swifts, two different prices
              // (Rs 1,499 and Rs 1,500) — a price contradiction Google reads
              // as exactly the kind it distrusts. Grouped by URL: the price
              // is the cheapest unit's (what "from" means), and the model is
              // in stock if ANY unit is. (Deleting the twin rows to fix this
              // was tried by somebody and is the wrong knife: it deleted the
              // owner's real inventory.)
              ...Object.values(
                items.reduce<Record<string, typeof items>>((acc, s) => {
                  (acc[vehicleHref(s)] ??= []).push(s);
                  return acc;
                }, {}),
              ).map((units) => {
                const prices = units
                  .map((u) => priceNumber(u.price))
                  .filter((n): n is number => n != null && n > 0);
                const first = units[0];
                return productLd({
                  name: first.name,
                  description: first.description,
                  image: first.image
                    ? first.image.startsWith("http")
                      ? first.image
                      : `${SITE_URL}${first.image}`
                    : undefined,
                  price: prices.length ? Math.min(...prices) : null,
                  // WITHDRAWN, not BUSY. This read
                  // `!(u.available === false || u.soldOutToday)`, so on any
                  // day the fleet was out it published every scooter to
                  // Google and to AI assistants as schema.org/OutOfStock —
                  // while the Rs 699 price sat right beside it. That is the
                  // site's strongest citation asset carrying "no" as its
                  // answer, and it fired hardest on the busiest days.
                  // A rental that is out today is still for hire next week.
                  available: units.some((u) => u.available !== false),
                  // The vehicle's OWN page, now that it has one. Every Offer
                  // used to advertise this category grid, so a shopping
                  // result for the Avenis landed on a list of everything and
                  // the customer had to find it again.
                  url: `${SITE_URL}${vehicleHref(first)}`,
                  rating: ratings[first.id],
                  category: first.category ?? "scooter",
                  // The same kind the vehicle's own page passes, so the two
                  // pages never type one model differently.
                  rentalKind: kind,
                });
              }),
            ],
          }}
        />
        {header(vcat.label, "span")}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          {/* The scooter price-value banner was removed from this booking page to
              keep it focused on the fleet. Its content lives, server-rendered in
              French for SEO, on /fr/location-scooter-rodrigues (hreflang-paired). */}
          <Fleet
            fleet={items}
            categories={content.vehicleCategories}
            ratings={ratings}
            recentBookings={recentBookings}
            whatsapp={businessWhatsApp}
            eyebrow="OUR FLEET"
            title={vcopy?.heading ?? vcat.label}
            titleAs="h1"
            subtitle={
              vcopy ? (
                <>
                  {linkPhrase(
                    vcopy.intro({
                      from: vFrom,
                      deliveryFee: vcat.deliveryFee,
                      freeDelivery,
                      pay: whoWherePay,
                    }),
                    vcopy.link,
                  )}
                  {/* ── THE FRENCH TWIN, ON ITS OWN LINE ──────────────────
                      This was a bare <a> welded onto the end of the intro
                      with a {" "}, so the English paragraph ran straight on
                      into "Location de voiture à Rodrigues — cette page en
                      français". On a phone that reads as one sentence that
                      changes language halfway through. It also lacked
                      hrefLang, which the place branch has carried all along:
                      the pages that actually sell had the worse treatment.

                      Still IN THE CONTENT, still a real crawlable link,
                      still directly under the intro rather than below four
                      car cards. That placement is the whole point — hreflang
                      is an annotation, not a crawl path, and until these
                      links existed URL Inspection reported the French pages
                      "unknown to Google" despite correct reciprocal hreflang
                      on all eight. A header language switcher would not
                      replace this; it would remove the thing that got the
                      French side indexed. */}
                  {vFrHref && vcopy.frLabel ? (
                    <FrenchTwinLink
                      href={vFrHref}
                      label={vcopy.frLabel}
                      as="span"
                      className="mt-3"
                    />
                  ) : null}
                </>
              ) : (
                `Browse our ${vcat.label.toLowerCase()}, then tap Book to choose your dates.`
              )
            }
          />
          {/* Trust signals immediately before the form that asks for money.
              This page previously carried NONE — no guarantee, no support
              promise, no reason to believe the transaction is safe — while
              TrustBar sat in the codebase with zero importers. Every claim
              here is already true elsewhere on the site (a free helmet is in
              t.booking.included; the 3+/7+ day discounts are in
              lib/booking-pricing), so nothing new is being promised.
              `kind`: an equipment category gets only the promises true of any
              rental, never "Helmet included" or "Free scooter delivery"
              (architecture review 2026-09-30, rentalKind fix-up). */}
          <TrustBar category={vcat.id} kind={kind} />
          <BookingSection
            fleet={items}
            category={category}
            categories={content.vehicleCategories}
            whatsapp={businessWhatsApp}
            /* The rental terms the customer needs BEFORE committing — age,
               licence, insurance, fuel — read from the FAQ the owner already
               maintains. Verified absent from this page: "licence" and
               "deposit" each appeared zero times in the live HTML. */
            conditions={conditionItems}
          />
          {/* Below the form, not above it: the cards and the booking form keep
              their place, and the table is still server-rendered text. */}
          {carCosts.length || airport ? (
            <div className="mx-auto max-w-5xl px-4 pb-10 md:px-6">
              <div className="space-y-7 border-t border-white/10 pt-8">
                {carCosts.length ? (
                  <section>
                    <h2 className="font-syne text-lg font-extrabold leading-tight text-offwhite md:text-xl">
                      What car hire costs on Rodrigues
                    </h2>
                    <div className="mt-3 max-w-2xl overflow-x-auto">
                      <table className="w-full border-collapse font-dm text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-xs text-muted">
                            <th scope="col" className="py-2 pr-3 font-medium">Car</th>
                            {carCosts[0].tiers.map((t) => (
                              <th key={t.days} scope="col" className="py-2 pl-3 text-right font-medium">
                                {t.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {carCosts.map((m) => (
                            <tr key={m.href} className="border-b border-white/5">
                              <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                                <Link
                                  href={m.href}
                                  className="text-offwhite underline-offset-2 hover:text-yellow hover:underline"
                                >
                                  {m.name}
                                </Link>
                              </th>
                              {m.tiers.map((t) => (
                                <td key={t.days} className="whitespace-nowrap py-2.5 pl-3 text-right text-offwhite/85">
                                  Rs {t.rental.toLocaleString("en-US")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Two different sums are called "deposit" here: the
                        part-payment that confirms a booking online, and the
                        Rs 5,000 security deposit the owner's answer states.
                        Run into one paragraph they read as one sum, so the
                        first is named for what it is and the owner's answer
                        stands on its own line, word for word. */}
                    <p className="mt-3 max-w-2xl font-dm text-[15px] leading-relaxed text-muted">
                      Rental only — delivery and the part-payment that confirms your booking
                      online are shown before you confirm.
                    </p>
                    {securityDeposit ? (
                      <p className="mt-2 max-w-2xl font-dm text-[15px] leading-relaxed text-muted">
                        {securityDeposit}
                      </p>
                    ) : null}
                  </section>
                ) : null}
                {airport ? (
                  <section>
                    <h2 className="font-syne text-lg font-extrabold leading-tight text-offwhite md:text-xl">
                      Collecting your car at Plaine Corail airport
                    </h2>
                    <p className="mt-2 max-w-2xl font-dm text-[15px] leading-relaxed text-muted">
                      {airport.body}{" "}
                      {linkPhrase(airport.transfer, {
                        phrase: AIRPORT_TRANSFER_PHRASE,
                        href: "/transfers",
                      })}
                    </p>
                    <p className="mt-2 max-w-2xl font-dm text-[15px] leading-relaxed text-muted">
                      {airport.mainland}
                    </p>
                  </section>
                ) : null}
              </div>
            </div>
          ) : null}
          {/* Last on the page, after the booking form and the cost table
              (architecture review 2026-09-30, item 1). Scooters and cars only:
              a category the owner adds is not assumed to go touring. */}
          {vcat.id === "scooter" || vcat.id === "car" ? (
            <WhereToGo links={RIDE_GUIDES[vcat.id]} />
          ) : null}
        </main>
        {footer}
      </>
    );
  }

  // ── Places (restaurants / activities / tours / stays) ──
  const place = PLACE_SLUGS[category];
  if (place) {
    // isNamed: /browse/activities published six Services and a six-item
    // ItemList while rendering two cards — four rows with name "" that
    // RecommendedPlaces drops (SEO audit 2026-09-29 T2). Filtered once here,
    // so the cards, the ItemList, the @graph and the empty state agree.
    const items = content.recommended.items.filter(place.filter).filter(isNamed);
    // Same guard as the vehicle branch above, for the same reason. /browse/stays
    // and /browse/tours are in the sitemap and carry hreflang from their French
    // twins, and an empty listing is "nothing published yet", not "this URL was
    // never real". Emptying the list in /admin used to delete the page from
    // Google; now it keeps its heading and says so.
    if (items.length === 0) {
      return (
        <>
          {/* Also "span": this branch has its own <h1> below, so the default
              was putting TWO h1 elements on the empty-state page. */}
          {header(place.label, "span")}
          <main className="bg-dark min-h-screen px-4 pb-24 pt-6">
            <div className="mx-auto max-w-3xl">
              <h1 className="font-syne text-2xl font-extrabold text-offwhite md:text-3xl">
                {place.heading ?? place.label}
              </h1>
              <p className="mt-4 rounded-2xl border border-yellow/40 bg-yellow/10 px-4 py-3 font-dm text-sm text-offwhite">
                Nothing is listed here just yet. Message us on WhatsApp and we
                will point you to the right place on the island.
              </p>
              <Link
                href="/explore"
                className="mt-6 inline-flex min-h-[48px] items-center rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark"
              >
                Explore the island
              </Link>
            </div>
          </main>
          {footer}
        </>
      );
    }
    // The cost section first, read from the prices on these same cards.
    const placeNotes = [
      ...(place.costNote ? [place.costNote(items.map(placePrice))] : []),
      ...(place.notes ?? []),
    ];
    // The FAQ, from these same cards (item 2): the price each one prints,
    // whether its form can take a payment, and whether the Île aux Cocos
    // excursion is among them — found the way its guide finds it. Both
    // languages are built here; the English is also the FAQPage below, so the
    // markup and the server HTML are one list.
    const faqInput = place.faq
      ? {
          places: listingPlaces(items),
          cocosListed: items.some((i) => GUIDE_FOR_PLACE(i)?.href === ILE_AUX_COCOS_GUIDE),
        }
      : null;
    const faqEn = faqInput ? listingFaq("en", faqInput) : [];
    const faqFr = faqInput ? listingFaq("fr", faqInput) : [];
    // The listings' markup (see THE PRICE, WHERE A MACHINE CAN READ IT below).
    const placeNodes = items.map((i) => {
      const image = i.image
        ? i.image.startsWith("http")
          ? i.image
          : `${SITE_URL}${i.image}`
        : undefined;
      // placePrice, not the deposit: the deposit holds a booking and
      // is not what the listing costs. The Île aux Cocos Service went
      // out with no Offer at all (no deposit set) beside an on-screen
      // "Rs 1999/Person" (SEO audit 2026-09-29 T2). The experience
      // routes switched in M191; this was the copy they left behind.
      const price = placePrice(i);
      // The listing's own address, not the page's. Every entry here
      // shared one URL, which is the same defect lib/place-href.ts was
      // written to end.
      const url = `${SITE_URL}${placeHref(i)}`;
      return i.category === "hotel"
        ? stayLd({ name: i.name, price, description: i.description, image, url })
        : experienceLd({
            name: i.name,
            price,
            description: i.description,
            image,
            url,
            providerName: i.providerName ?? null,
            durationMinutes:
              typeof i.durationMinutes === "number" ? i.durationMinutes : null,
          });
    });
    // ── THE SELLER THE SERVICES POINT AT, ON THE PAGE THAT POINTS (T9) ──────
    // experienceLd() names #business as the provider when the owner named
    // nobody, and as every priced Offer's seller, and nothing on /browse/tours
    // or /browse/activities defined it: a bare pointer with no type and no
    // name (SEO audit 2026-09-29 T9, "the two browse place branches"). Added
    // only when a node here actually points at it, read off the nodes rather
    // than off which helper made them: stayLd() references nothing, so
    // /browse/stays gets no AutoRental node that nothing on it refers to.
    const pointsAtSeller = JSON.stringify(placeNodes).includes(`"${SITE_URL}/#business"`);
    const placeGraph = pointsAtSeller ? [sellerLd(), ...placeNodes] : placeNodes;
    return (
      <>
        {seo(
          place.label,
          items.map((i) => ({ name: i.name.trim(), url: `${SITE_URL}${placeHref(i)}` })),
        )}
        {/* ── THE PRICE, WHERE A MACHINE CAN READ IT (M137) ─────────────────
            This branch serves stays, activities and tours, and emitted a
            breadcrumb and a list of names — while the page's own description
            promises "See photos and prices". So the prices were on the screen
            and nowhere in the markup: no rich result, and nothing for an
            assistant asked "where can I stay on Rodrigues and what does it
            cost" to quote.

            Typed by what the thing actually is. A guesthouse is a
            LodgingBusiness somebody sleeps in; a boat trip is a Service nobody
            takes home. A listing with no price set carries none rather than a
            zero — free and unpriced are different claims. */}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": placeGraph,
          }}
        />
        {/* FAQPage from the SAME list <ListingFaq> prints in English (item 2),
            and only where that list has questions. */}
        {faqEn.length ? (
          <JsonLd data={faqPageLd(`${SITE_URL}/browse/${category}`, faqEn)} />
        ) : null}
        {/* "span", not the default h1. This branch rendered place.label —
            "Accommodations" — as the <h1> while the actual keyword heading,
            "Where to Stay in Rodrigues", sat below it as an <h2> inside
            RecommendedPlaces. That is the identical fault fixed for the vehicle
            categories above, and the META entry for stays records what it cost:
            indexed, and zero impressions for any accommodation query in 90
            days. The heading is promoted to <h1> on the section below. */}
        {header(place.label, "span")}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          <RecommendedPlaces
            titleAs="h1"
            content={{
              enabled: true,
              title: place.heading ?? place.label,
              subtitle: place.intro ?? content.recommended.subtitle,
              titleFr: place.headingFr,
              subtitleFr: place.introFr,
              items,
            }}
            whatsapp={businessWhatsApp}
          />
          {placeNotes.length ? <CategoryNotes notes={placeNotes} /> : null}
          {place.faq && faqEn.length ? (
            <ListingFaq
              en={{ heading: place.faq.heading, items: faqEn }}
              fr={{ heading: place.faq.headingFr, items: faqFr }}
            />
          ) : null}
          {/* The French twin as a real link, not only an hreflang annotation.
              META.stays has declared /fr/hebergement-rodrigues for weeks and
              this branch never rendered it, so the only routes into the French
              page were other French pages — and URL Inspection reported it
              "unknown to Google". The vehicle branch below already does this;
              the place branch was simply never given the same treatment. */}
          {place.frHref && place.frLabel ? (
            <div className="mx-auto max-w-7xl px-4 md:px-6">
              <FrenchTwinLink href={place.frHref} label={place.frLabel} />
            </div>
          ) : null}
          {place.hubHref && place.hubLabel ? (
            <div className="mx-auto max-w-7xl px-4 pb-2 md:px-6">
              <p className="mt-6 font-dm text-sm text-muted">
                <Link
                  href={place.hubHref}
                  className="underline underline-offset-2 hover:text-yellow"
                >
                  {place.hubLabel}
                </Link>
              </p>
            </div>
          ) : null}
          {place.whereToGo?.length ? <WhereToGo links={place.whereToGo} /> : null}
        </main>
        {footer}
      </>
    );
  }

  // ── Getting around (taxis + transport, no bus) ──
  if (category === "getting-around") {
    const ga = content.gettingAround;
    if (!ga?.enabled || (ga.options ?? []).length === 0) notFound();
    const opts = (ga.options ?? []).filter((o) => o.icon !== "bus");
    // The airport price list /transfers prints and the booking charges. Null
    // without a service-role key (local dev) or with transfers switched off,
    // and then the note names no fare rather than inventing one.
    const { airport } = await readTransferFares();
    const notes = gettingAroundNotes({
      carFrom: categoryFrom(fleet, "car", content.vehicleCategories),
      scooterFrom: categoryFrom(fleet, "scooter", content.vehicleCategories),
      airport,
    });
    return (
      <>
        {seo(
          "Getting around",
          opts.map((o) => ({ name: o.title })),
        )}
        {/* "span": GettingAround below carries the heading that names the
            island ("Getting Around Rodrigues"). This was the third page with
            the nav label sitting above the keyword as its h1. */}
        {header("Getting around", "span")}
        <main>
          <BrowseTabs
            categories={cats}
            active={category}
            stickyTop="top-[56px]"
          />
          <GettingAround titleAs="h1" content={{ ...ga, options: opts }} />
          <CategoryNotes notes={notes} />
          {/* ── WHERE THE NOTES POINT ──────────────────────────────────────
              /transfers is the page with the fares the taxi note quotes, and
              had three inbound links (SEO audit 2026-09-29 C5).

              /fr/se-deplacer-a-rodrigues was "Discovered - currently not
              indexed", so it keeps a crawl path from here. But it was labelled
              "cette page en français" while its hreflang twin is the blog
              post, not this page (C13). It is now offered as what it is: the
              French version of the guide linked beside it, and not through
              FrenchTwinLink, whose contract is "the page that names THIS one
              in its hreflang". */}
          <div className="mx-auto max-w-5xl space-y-2 px-4 pb-6 pt-6 font-dm text-sm text-muted md:px-6">
            <p>
              <Link href="/transfers" className="underline underline-offset-2 hover:text-yellow">
                Airport transfers: the fares zone by zone
              </Link>
            </p>
            <p>
              <Link
                href="/blog/how-to-get-around-rodrigues"
                className="underline underline-offset-2 hover:text-yellow"
              >
                How to get around Rodrigues: the full guide
              </Link>
              {" · "}
              <Link
                href="/fr/se-deplacer-a-rodrigues"
                hrefLang="fr"
                lang="fr"
                className="underline underline-offset-2 hover:text-yellow"
              >
                Se déplacer à Rodrigues, le guide en français
              </Link>
            </p>
          </div>
        </main>
        {footer}
      </>
    );
  }

  notFound();
}
