// Schema.org builders. Structured data is how Google understands what a page
// IS rather than just what words it contains — it drives breadcrumb trails,
// rating stars, price ranges and AI answers.
//
// Rule for this file: it may only describe things that are actually true and
// visible on the page. Marking up content a visitor can't see is a spam
// signal and gets structured data ignored (or the site penalised).
import { SITE_URL } from "./site";

const BRAND = "Roule Rodrigues";

// Google picks the site name shown above a search result from WebSite schema.
// Without it, it falls back to the domain — which is why results read "Vercel"
// instead of "Roule Rodrigues". Homepage only; Google ignores it elsewhere.
export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: BRAND,
    alternateName: ["Roule Rodrig", "roulerodrig"],
    url: SITE_URL,
    // Was ["en", "fr"] while app/page.tsx published knowsLanguage
    // ["en", "fr", "mfe"] into the SAME document — two blocks of structured data
    // on one page disagreeing about how many languages the site speaks. mfe is
    // Kreol; see the note on LANGUAGE_TAGS in lib/i18n.ts for why not "cr".
    inLanguage: ["en", "fr", "mfe"],
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

// A blog article. drives the "Article" rich result and helps AI answers cite
// the piece. author/publisher point at the same Organization @id so Google
// links the article to the business entity.
export function blogPostingLd(p: {
  slug: string;
  title: string;
  description: string;
  published: string;
  updated: string;
  image?: string;
}) {
  const url = `${SITE_URL}/blog/${p.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: p.title,
    description: p.description,
    datePublished: p.published,
    dateModified: p.updated,
    inLanguage: "en",
    image: p.image ?? `${SITE_URL}/og-image.jpg`,
    mainEntityOfPage: url,
    author: { "@id": `${SITE_URL}/#organization`, name: BRAND },
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

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
export function itemListLd(
  name: string,
  items: { name: string; url?: string }[],
) {
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
  shop: "Store",
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
      ? {
          geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng },
        }
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
  /** Fleet category slug — picks the schema type (Motorcycle vs Car). */
  category?: string;
};

// Model → manufacturer. Every entry is a real, checkable fact: Burgman and
// Avenis are Suzuki scooters, Swift is a Suzuki car. An unknown model gets NO
// brand rather than a guessed one — Google warns about a missing brand, but a
// wrong brand is a lie about the product.
const BRAND_BY_MODEL: [RegExp, string][] = [
  [/burgman/i, "Suzuki"],
  [/avenis/i, "Suzuki"],
  [/swift/i, "Suzuki"],
  [/vespa/i, "Piaggio"],
  [/honda/i, "Honda"],
  [/yamaha/i, "Yamaha"],
  [/kia/i, "Kia"],
  [/toyota/i, "Toyota"],
];

function brandOf(name: string): string | null {
  for (const [re, brand] of BRAND_BY_MODEL) if (re.test(name)) return brand;
  return null;
}

// A rentable vehicle. Only emit this on a page where the vehicle is actually
// rendered — Google ignores (and can penalise) markup for invisible content.
//
// Typed Motorcycle/Car rather than bare Product. Both are Product subtypes, so
// offers still work, but they describe what these actually are — a scooter is
// not a boxed good. This is also why Google's "missing shippingDetails" and
// "missing hasMerchantReturnPolicy" warnings don't apply: they're requirements
// for retail merchant listings, and you cannot ship or return a rental. Google
// files them as non-critical because it can't tell retail from rental.
//
// aggregateRating is included ONLY when real approved reviews exist. Never
// invent a rating: fake stars are the fastest way to lose rich results.
export function productLd(p: ProductInput) {
  const brand = brandOf(p.name);
  const type =
    p.category === "car"
      ? "Car"
      : p.category === "scooter"
        ? "Motorcycle"
        : "Product";
  return {
    "@type": type,
    name: p.name,
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
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
              p.available === false
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
            url: p.url,
            seller: { "@id": `${SITE_URL}/#business` },
          },
        }
      : {}),
  };
}

// A marketplace shop. Typed `Store` (a LocalBusiness subtype) because that is
// what it is — a real trader on Rodrigues with a name, a phone and opening
// hours, not a product listing.
//
// The shop is the seller, NOT Roulé Rodrigues. The platform charges the
// merchant a subscription and never takes a commission; the customer pays the
// shop directly in cash or by bank transfer. So this deliberately omits the
// `seller: { @id: /#business }` line that the rental productLd carries — saying
// the platform sells the honey would misdescribe the actual transaction.
//
// aggregateRating appears ONLY when real reviews exist, the same rule every
// other block here follows. The values come from `store_reviews` or not at all.
export function storeLd(s: {
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  address?: string | null;
  phone?: string | null;
  rating?: { avg: number; count: number } | null;
  products?: {
    name: string;
    url: string;
    price?: number;
    image?: string | null;
  }[];
}) {
  const url = `${SITE_URL}/shop/${s.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${url}#store`,
    name: s.name,
    url,
    ...(s.description ? { description: s.description } : {}),
    ...(s.image ? { image: s.image } : {}),
    ...(s.phone ? { telephone: s.phone } : {}),
    address: {
      "@type": "PostalAddress",
      // Every shop here is on Rodrigues; the street line is the only part that
      // varies and it is often absent, so it stays conditional.
      ...(s.address ? { streetAddress: s.address } : {}),
      addressLocality: "Rodrigues",
      addressCountry: "MU",
    },
    ...(s.rating && s.rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: s.rating.avg,
            reviewCount: s.rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    // Ties each shop back to the platform as one entity, rather than leaving
    // Google to work out why dozens of unrelated Stores share a domain.
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    ...(s.products?.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: `${s.name} products`,
            itemListElement: s.products.map((p) => ({
              "@type": "Offer",
              itemOffered: {
                "@type": "Product",
                name: p.name,
                url: p.url,
                ...(p.image ? { image: p.image } : {}),
              },
              // Prices are stored in minor units everywhere in this codebase;
              // schema.org wants a decimal string.
              ...(p.price !== undefined
                ? { price: (p.price / 100).toFixed(2), priceCurrency: "MUR" }
                : {}),
              url: p.url,
            })),
          },
        }
      : {}),
  };
}

// ── A marketplace product ───────────────────────────────────────────────────
//
// Deliberately NOT productLd() above, which describes a RENTAL: that one names
// Roulé Rodrigues as the seller, because the platform really does rent out the
// scooters. Here the platform does not sell anything — the shop does, and the
// customer pays the shop's own bank account directly. Naming the platform as
// seller would misdescribe the transaction to every crawler that reads it.
//
// `offers` is an AggregateOffer whenever a product has several priced variants,
// so a "from Rs 250" product is not published as though Rs 250 were the only
// price. availability is InStock/OutOfStock from the real stock figure, and
// aggregateRating appears only when real published reviews exist — the same
// rule every other block in this file follows.
export function marketplaceProductLd(p: {
  name: string;
  slug: string;
  storeSlug: string;
  storeName: string;
  description?: string | null;
  brand?: string | null;
  sku?: string | null;
  images?: string[];
  category?: string | null;
  /** Integer minor units, as everywhere else in this codebase. */
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  offerCount: number;
  rating?: { avg: number; count: number } | null;
  reviews?: {
    rating: number;
    body: string | null;
    author: string | null;
    createdAt: string;
  }[];
}) {
  const url = `${SITE_URL}/shop/${p.storeSlug}/${p.slug}`;
  const money = (cents: number) => (cents / 100).toFixed(2);
  const availability = p.inStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
  const seller = {
    "@type": "Organization",
    name: p.storeName,
    url: `${SITE_URL}/shop/${p.storeSlug}`,
  };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: p.name,
    url,
    ...(p.description ? { description: p.description } : {}),
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(p.images?.length ? { image: p.images } : {}),
    ...(p.category ? { category: p.category } : {}),
    offers:
      p.offerCount > 1 && p.maxPrice > p.minPrice
        ? {
            "@type": "AggregateOffer",
            lowPrice: money(p.minPrice),
            highPrice: money(p.maxPrice),
            priceCurrency: "MUR",
            offerCount: p.offerCount,
            availability,
            url,
            seller,
          }
        : {
            "@type": "Offer",
            price: money(p.minPrice),
            priceCurrency: "MUR",
            availability,
            url,
            seller,
          },
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
    // Only reviews that are actually rendered on the page, and only ones with
    // words: markup describing content a visitor cannot see is devalued.
    ...(p.reviews?.length
      ? {
          review: p.reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            reviewRating: {
              "@type": "Rating",
              ratingValue: r.rating,
              bestRating: 5,
              worstRating: 1,
            },
            ...(r.body ? { reviewBody: r.body } : {}),
            ...(r.author
              ? { author: { "@type": "Person", name: r.author } }
              : {}),
            datePublished: r.createdAt.slice(0, 10),
          })),
        }
      : {}),
  };
}

// The business. Referenced by @id from other blocks so Google links them into
// one entity instead of treating each page as a separate company.
export function organizationLd(
  opts: { logo?: string; sameAs?: string[] } = {},
) {
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
