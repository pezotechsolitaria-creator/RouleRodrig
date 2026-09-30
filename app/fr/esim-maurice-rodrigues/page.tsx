import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { getListing, getLiveDestinations, storeState } from "@/lib/esim/service";
import { esimFaq } from "@/lib/esim/content";
import { esimJsonLd } from "@/lib/esim/seo";
import { formatEur } from "@/lib/esim/pricing";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PageLanguage from "@/components/PageLanguage";
import HubBacklink from "@/components/nav/HubBacklink";
import { ogImages } from "@/lib/share-image";
import FrenchTwinLink from "@/components/FrenchTwinLink";
import EsimStore from "@/app/esim/EsimStore";

// ── /fr/esim-maurice-rodrigues ───────────────────────────────────────────────
//
// The French twin of /esim, and probably the more important of the two: the
// French pages carry this site's best rankings (/fr/plages-rodrigues sits on
// page one where its English twin does not), and Rodrigues' visitors are
// overwhelmingly Réunionnais and French. "eSIM Maurice", "eSIM Rodrigues",
// "carte SIM Rodrigues" and "internet Rodrigues" are what they type.
//
// Rendered French on the SERVER (EsimStore's `lang` prop), not after
// hydration, so a crawler reads French.

export const revalidate = 600;

const URL = `${SITE_URL}/fr/esim-maurice-rodrigues`;
const TITLE = "eSIM Maurice et Rodrigues — Internet mobile sur my.t 4G | Roule Rodrigues";
const DESCRIPTION =
  "Achetez une eSIM data pour Rodrigues et Maurice en une minute. Réseau my.t 4G, qui couvre Rodrigues — pas Chili. QR code livré en quelques secondes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: URL,
    languages: {
      en: `${SITE_URL}/esim`,
      fr: URL,
      "x-default": `${SITE_URL}/esim`,
    },
  },
  openGraph: {
    title: "eSIM Maurice et Rodrigues — internet dès l'atterrissage",
    description: "eSIM instantanée sur my.t 4G, le réseau qui couvre vraiment Rodrigues. Installez-la chez vous, elle démarre à l'arrivée.",
    url: URL,
    type: "website",
    locale: "fr_FR",
    images: ogImages("eSIM data pour Rodrigues et Maurice"),
  },
};

export default async function EsimFrPage() {
  const [plans, content, live] = await Promise.all([getListing("MU"), getContent(), getLiveDestinations()]);
  const { selling } = storeState();
  const fromPrice = plans?.length ? formatEur(Math.min(...plans.map((p) => p.retail_eur_cents)), "fr") : null;
  const widest = plans?.reduce<string[] | null>((a, p) => (!a || p.country_codes.length > a.length ? p.country_codes : a), null) ?? null;
  const whatsapp = content.contact.whatsappNumbers?.[0]?.number ?? content.contact.phone ?? null;

  return (
    <>
      <PageLanguage lang="fr" />
      <JsonLd data={esimJsonLd({ lang: "fr", url: URL, plans: plans ?? [], faq: esimFaq("fr", fromPrice, widest), selling })} />
      <AppPageHeader showBack backHref="/fr" />
      <main lang="fr" className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <EsimStore plans={plans} selling={selling} lang="fr" whatsapp={whatsapp} live={live} />
        <div className="mx-auto max-w-2xl px-5 pt-8">
          <FrenchTwinLink href="/esim" label="Read this page in English" lang="en" />
        </div>
      </main>
      <HubBacklink href="/fr" label="Tous nos guides en français" />
    </>
  );
}
