import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { getPublicPlans, storeState } from "@/lib/esim/service";
import { esimFaq } from "@/lib/esim/content";
import { esimJsonLd } from "@/lib/esim/seo";
import { formatEur } from "@/lib/esim/pricing";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import { ogImages } from "@/lib/share-image";
import FrenchTwinLink from "@/components/FrenchTwinLink";
import EsimStore from "./EsimStore";

// ── /esim — the eSIM store (M223) ────────────────────────────────────────────
//
// Replaced "Fishing" in the homepage's "What are you looking for?" grid (owner,
// 30 Sep 2026): fishing trips are still one tap away under Experiences, and
// mobile data is the first thing every visitor needs, before a ride, a room or
// a boat — and the one thing on this island a newcomer cannot sort out on the
// spot without a queue at a shop in Port Mathurin.
//
// SEARCH INTENT this page answers: "Rodrigues eSIM", "Mauritius eSIM",
// "Rodrigues mobile data / SIM card", "does Airalo work in Rodrigues". Its
// French twin is /fr/esim-maurice-rodrigues. The one thing it can say that a
// global eSIM site cannot — WHICH network reaches Rodrigues — is the page's
// centre of gravity, in the copy and in the FAQ.
//
// Read on the server (plans from the cookieless client, so the page stays
// static and a crawler sees every price), refreshed every 10 minutes.

export const revalidate = 600;

const TITLE = "Rodrigues & Mauritius eSIM — Instant Data on my.t 4G | Roule Rodrigues";
const DESCRIPTION =
  "Buy a data eSIM for Rodrigues and Mauritius in a minute. Runs on my.t 4G, the network that covers Rodrigues — Chili does not. QR code in seconds.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/esim`,
    // Mirrors app/fr/esim-maurice-rodrigues. hreflang is silently ignored
    // unless both pages name each other.
    languages: {
      en: `${SITE_URL}/esim`,
      fr: `${SITE_URL}/fr/esim-maurice-rodrigues`,
      "x-default": `${SITE_URL}/esim`,
    },
  },
  openGraph: {
    title: "Rodrigues & Mauritius eSIM — data before you land",
    description: "Instant eSIM on my.t 4G, the network that actually covers Rodrigues. Install at home, it starts when you arrive.",
    url: `${SITE_URL}/esim`,
    type: "website",
    images: ogImages("Mobile data eSIM for Rodrigues and Mauritius"),
  },
};

export default async function EsimPage() {
  const [plans, content] = await Promise.all([getPublicPlans("mauritius"), getContent()]);
  const { selling } = storeState();
  const fromPrice = plans?.length ? formatEur(Math.min(...plans.map((p) => p.retail_eur_cents))) : null;
  const widest = plans?.reduce<string[] | null>((a, p) => (!a || p.country_codes.length > a.length ? p.country_codes : a), null) ?? null;
  const whatsapp = content.contact.whatsappNumbers?.[0]?.number ?? content.contact.phone ?? null;

  return (
    <>
      <JsonLd
        data={esimJsonLd({
          lang: "en",
          url: `${SITE_URL}/esim`,
          plans: plans ?? [],
          faq: esimFaq("en", fromPrice, widest),
          selling,
        })}
      />
      <AppPageHeader showBack backHref="/" />
      <main className="min-h-[calc(100vh-4rem)] bg-dark pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <EsimStore plans={plans} selling={selling} whatsapp={whatsapp} />
        <div className="mx-auto max-w-2xl px-5 pt-8">
          <FrenchTwinLink href="/fr/esim-maurice-rodrigues" label="Lire cette page en français" />
        </div>
      </main>
    </>
  );
}
