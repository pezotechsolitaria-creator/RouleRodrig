// Schema.org builders. Structured data is how Google understands what a page
// IS rather than just what words it contains — it drives breadcrumb trails,
// rating stars, price ranges and AI answers.
//
// Rule for this file: it may only describe things that are actually true and
// visible on the page. Marking up content a visitor can't see is a spam
// signal and gets structured data ignored (or the site penalised).
import { SITE_URL } from "./site";

const BRAND = "Roule Rodrigues";

export function breadcrumbLd(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

// A collection page listing N items (fleet, stays, activities). Helps Google
// treat the page as a real listing rather than thin content.
export function itemListLd(name: string, items: { name: string; url?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { url: it.url } : {}),
    })),
  };
}

// Rodrigues itself, as a destination. This is what AI assistants and Google's
// knowledge panel read when someone asks "what is Rodrigues island".
export function touristDestinationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: "Rodrigues Island",
    description:
      "Rodrigues is an autonomous outer island of the Republic of Mauritius, about 560 km east of the main island, known for its lagoon, hiking trails, and Creole culture.",
    url: `${SITE_URL}/guide/rodrigues`,
    geo: { "@type": "GeoCoordinates", latitude: -19.7245, longitude: 63.4272 },
    containedInPlace: { "@type": "Country", name: "Mauritius" },
    touristType: [
      "Beach holiday",
      "Hiking",
      "Snorkelling and diving",
      "Kitesurfing",
      "Cultural travel",
    ],
  };
}

type PlaceInput = {
  name: string;
  description?: string;
  category?: string;
  lat?: number;
  lng?: number;
  image?: string;
};

// Map our island-guide categories onto real schema.org types. Anything we
// don't have a precise type for stays a generic TouristAttraction.
const PLACE_TYPE: Record<string, string> = {
  beach: "Beach",
  viewpoint: "TouristAttraction",
  restaurant: "Restaurant",
  hotel: "LodgingBusiness",
  activity: "TouristAttraction",
  gas: "GasStation",
  landmark: "LandmarksOrHistoricalBuildings",
};

export function placeLd(p: PlaceInput) {
  return {
    "@context": "https://schema.org",
    "@type": PLACE_TYPE[p.category ?? ""] ?? "TouristAttraction",
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.image ? { image: p.image } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Rodrigues",
      addressCountry: "MU",
    },
    ...(typeof p.lat === "number" && typeof p.lng === "number"
      ? { geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } }
      : {}),
  };
}

type ProductInput = {
  name: string;
  description?: string;
  image?: string;
  price?: number | null;
  available?: boolean;
  url: string;
  rating?: { avg: number; count: number };
};

// A rentable vehicle. Only emit this on a page where the vehicle is actually
// rendered — Google ignores (and can penalise) markup for invisible content.
//
// aggregateRating is included ONLY when real approved reviews exist. Never
// invent a rating: fake stars are the fastest way to lose rich results.
export function productLd(p: ProductInput) {
  return {
    "@type": "Product",
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.image ? { image: p.image } : {}),
    ...(p.rating && p.rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: p.rating.avg,
            reviewCount: p.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(p.price
      ? {
          offers: {
            "@type": "Offer",
            price: p.price,
            priceCurrency: "MUR",
            availability:
              p.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            url: p.url,
            seller: { "@id": `${SITE_URL}/#business` },
          },
        }
      : {}),
  };
}

// The business. Referenced by @id from other blocks so Google links them into
// one entity instead of treating each page as a separate company.
export function organizationLd(opts: { logo?: string; sameAs?: string[] } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: BRAND,
    url: SITE_URL,
    ...(opts.logo ? { logo: opts.logo } : {}),
    ...(opts.sameAs?.length ? { sameAs: opts.sameAs } : {}),
    areaServed: { "@type": "Place", name: "Rodrigues Island, Mauritius" },
  };
}
