import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { getListing, getLiveDestinations, storeState } from "@/lib/esim/service";
import { worldFaq } from "@/lib/esim/content";
import { esimJsonLd } from "@/lib/esim/seo";
import { formatEur } from "@/lib/esim/pricing";
import { destinationBySlug, destinationPath, HOME_CODE } from "@/lib/esim/destinations";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import FrenchTwinLink from "@/components/FrenchTwinLink";
import { ogImages } from "@/lib/share-image";
import EsimStore from "./EsimStore";

// ── /esim/[destination] and /fr/esim/[destination] ───────────────────────────
//
// One server component for both languages, so the English and French pages of
// a destination can never drift apart. Each is a real page with real facts —
// its own shelf, the networks those plans use there, its own FAQ — and each
// names the other in hreflang and links it.
//
// A destination with nothing on its shelf is a 404, not an empty page: Google
// calls a page that says "no plans" a soft 404, and a shopper who lands on one
// has been lied to by whatever linked it. (No loading.tsx in this segment: it
// would commit a 200 before notFound() could run — the trap in the repo memory.)

type Lang = "en" | "fr";

function urls(slug: string) {
  return { en: `${SITE_URL}/esim/${slug}`, fr: `${SITE_URL}/fr/esim/${slug}` };
}

export async function destinationMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const d = destinationBySlug(slug);
  if (!d || d.code === HOME_CODE) return {};
  const plans = await getListing(d.code);
  const from = plans?.length ? formatEur(Math.min(...plans.map((p) => p.retail_eur_cents)), lang) : null;
  const u = urls(slug);
  const title =
    lang === "en"
      ? `${d.en} eSIM — Mobile Data${from ? ` from ${from}` : ""} | Roule Rodrigues`
      : `eSIM ${d.fr} — Internet mobile${from ? ` dès ${from}` : ""} | Roule Rodrigues`;
  const description =
    lang === "en"
      ? `A data eSIM for ${d.en} in a minute${from ? `, from ${from}` : ""}. QR code in seconds, hotspot included. Install before you fly; it starts when you land.`
      : `Une eSIM data pour ${d.fr} en une minute${from ? `, dès ${from}` : ""}. QR code en quelques secondes, partage inclus. Installez avant de partir.`;
  return {
    title,
    description,
    alternates: {
      canonical: lang === "en" ? u.en : u.fr,
      languages: { en: u.en, fr: u.fr, "x-default": u.en },
    },
    openGraph: {
      title,
      description,
      url: lang === "en" ? u.en : u.fr,
      type: "website",
      ...(lang === "fr" ? { locale: "fr_FR" } : {}),
      images: ogImages(lang === "en" ? `Mobile data eSIM for ${d.en}` : `eSIM data pour ${d.fr}`),
    },
  };
}

export default async function DestinationPage({ slug, lang }: { slug: string; lang: Lang }) {
  const d = destinationBySlug(slug);
  if (!d) notFound();
  // The home shelf has its own, richer page.
  if (d.code === HOME_CODE) permanentRedirect(destinationPath(d, lang));

  const [plans, content, live] = await Promise.all([getListing(d.code), getContent(), getLiveDestinations()]);
  // A failed read throws, so ISR keeps serving the last good page rather than
  // caching an error; an EMPTY shelf is a real 404.
  if (plans === null) throw new Error(`eSIM listing for ${d.code} could not be read`);
  if (plans.length === 0) notFound();

  const { selling } = storeState();
  const from = formatEur(Math.min(...plans.map((p) => p.retail_eur_cents)), lang);
  const nets = [...new Set(plans.flatMap((p) => (p.networks ?? []).map((n) => n.name.trim())).filter(Boolean))];
  const place = { name: lang === "en" ? d.en : d.fr, inPlace: lang === "en" ? d.enIn : d.frIn };
  const u = urls(slug);
  const whatsapp = content.contact.whatsappNumbers?.[0]?.number ?? content.contact.phone ?? null;

  return (
    <>
      <JsonLd
        data={esimJsonLd({
          lang,
          url: lang === "en" ? u.en : u.fr,
          plans,
          faq: worldFaq(lang, place, from, nets),
          selling,
          place,
        })}
      />
      <AppPageHeader showBack backHref={lang === "en" ? "/esim" : "/fr/esim-maurice-rodrigues"} />
      <main lang={lang} className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <EsimStore plans={plans} selling={selling} lang={lang} whatsapp={whatsapp} destination={d} live={live} />
        <div className="mx-auto max-w-2xl px-5 pt-8">
          {lang === "en" ? (
            <FrenchTwinLink href={`/fr/esim/${slug}`} label="Lire cette page en français" />
          ) : (
            <FrenchTwinLink href={`/esim/${slug}`} label="Read this page in English" lang="en" />
          )}
        </div>
      </main>
    </>
  );
}
