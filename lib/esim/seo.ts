import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, sellerLd, BRAND_ALTERNATE } from "@/lib/schema";
import type { Faq } from "./content";
import { planLabel } from "./format";
import { eurCentsToPayPalValue } from "./pricing";

// ── Structured data for the eSIM pages ───────────────────────────────────────
//
// Built from the LIVE catalogue, never typed: the price range, every offer and
// the FAQ's "from" price all come from the same plan rows the page renders
// (lib/schema.ts's rule — describe only what is true and visible).
//
// Modelled as ONE Product ("Mauritius & Rodrigues eSIM") with an Offer per
// plan, rather than a Product per plan: the plans are variants of one thing,
// and a single entity with a price range is what both Google's merchant
// listings and an AI answer ("how much is an eSIM for Rodrigues?") want.

type PlanLike = {
  id: string;
  data_mb: number;
  per_day: boolean;
  validity_days: number;
  retail_eur_cents: number;
};

export function esimJsonLd(opts: {
  lang: "en" | "fr";
  url: string;
  plans: PlanLike[];
  faq: Faq[];
  selling: boolean;
  /** A destination other than the home shelf (M224); absent = Mauritius & Rodrigues. */
  place?: { name: string; inPlace: string };
}): Record<string, unknown>[] {
  const { lang, url, plans, faq, selling, place } = opts;
  const productName = place
    ? lang === "fr"
      ? `eSIM ${place.name}`
      : `${place.name} eSIM`
    : lang === "fr"
      ? "eSIM Maurice & Rodrigues"
      : "Mauritius & Rodrigues eSIM";
  const out: Record<string, unknown>[] = [];
  // Not "PreOrder": nothing can be ordered before sales open (M229).
  const availability = selling ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

  if (plans.length) {
    const prices = plans.map((p) => p.retail_eur_cents);
    out.push({
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      name: productName,
      description: place
        ? lang === "fr"
          ? `eSIM de données instantanée ${place.inPlace}. QR code livré en quelques secondes, partage de connexion inclus.`
          : `Instant data eSIM for use ${place.inPlace}. QR code delivered in seconds, hotspot included.`
        : lang === "fr"
          ? "eSIM de données instantanée pour Maurice et Rodrigues, sur le réseau my.t 4G qui couvre Rodrigues. QR code livré en quelques secondes, partage de connexion inclus."
          : "Instant data eSIM for Mauritius and Rodrigues on the my.t 4G network, which covers Rodrigues. QR code delivered in seconds, hotspot included.",
      category: "Mobile data eSIM",
      brand: { "@type": "Brand", name: "Roule Rodrigues", alternateName: BRAND_ALTERNATE },
      image: `${SITE_URL}/og-image.jpg`,
      inLanguage: lang,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "EUR",
        lowPrice: eurCentsToPayPalValue(Math.min(...prices)),
        highPrice: eurCentsToPayPalValue(Math.max(...prices)),
        offerCount: plans.length,
        availability,
        seller: { "@id": `${SITE_URL}/#business` },
        offers: plans.map((p) => ({
          "@type": "Offer",
          name: planLabel(p, lang),
          price: eurCentsToPayPalValue(p.retail_eur_cents),
          priceCurrency: "EUR",
          availability,
          url: `${url}#plan-${p.id}`,
          itemCondition: "https://schema.org/NewCondition",
        })),
      },
    });
  }

  out.push({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang,
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  out.push({ "@context": "https://schema.org", ...sellerLd() });
  out.push(
    breadcrumbLd([
      { name: lang === "fr" ? "Accueil" : "Home", url: SITE_URL },
      ...(place
        ? [
            {
              name: lang === "fr" ? "eSIM Maurice & Rodrigues" : "Mauritius & Rodrigues eSIM",
              url: lang === "fr" ? `${SITE_URL}/fr/esim-maurice-rodrigues` : `${SITE_URL}/esim`,
            },
          ]
        : []),
      { name: productName, url },
    ]),
  );
  return out;
}
