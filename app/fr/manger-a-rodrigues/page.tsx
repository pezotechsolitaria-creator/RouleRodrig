import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { getFleetView } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

// ── Why this page exists ────────────────────────────────────────────────────
//
// The French counterpart of /food, and the second page built for an audience
// that lands here speaking French — Réunionnais, Mauriciens, métropolitains.
// "manger à Rodrigues", "cuisine rodriguaise" and "commander à manger
// Rodrigues" reached an English page or nothing.
//
// /food is the richest English page on the site (3,476 characters before its
// FAQ, more than /taxi, /shop or /experiences) because it lists real dishes
// with real prices. None of that was readable by somebody searching in French.
//
// ── WHAT IS DELIBERATELY NOT SAID ───────────────────────────────────────────
//
// No dish is named. Seven of the nine listed belong to "Ti Kitchen (DEMO)", a
// store flagged no_index — naming them would push into French search and into
// AI answers exactly what the site is keeping out of search, and they are also
// the names most likely to disappear when the demo is retired. The page
// describes the cuisine and the mechanism instead, both of which are stable.
//
// The prices ARE real and are stated: Rs 80 is the smallest dish on the live
// page, Rs 2 500 the whole grilled lobster, and 15 to 30 minutes is what every
// kitchen quotes. Those come off the rendered page, not from a guess.
//
// No delivery promise beyond what exists. Collection is always available and
// free; delivery is offered where the kitchen offers it, and the page says it
// that way round rather than advertising island-wide delivery.

const TITLE = "Manger à Rodrigues : commander en ligne | Roule Rodrigues";
const DESCRIPTION =
  "Commander à manger à l'île Rodrigues : cuisine rodriguaise préparée par des cuisines locales, dès Rs 80. Retrait gratuit ou livraison, prix et délai affichés avant de commander.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/manger-a-rodrigues`,
    // Mirrors the `languages` block on app/food/page.tsx. A one-way hreflang
    // is silently ignored, so both halves must name each other.
    languages: {
      "en": `${SITE_URL}/food`,
      "fr": `${SITE_URL}/fr/manger-a-rodrigues`,
      "x-default": `${SITE_URL}/food`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/manger-a-rodrigues`,
    type: "website",
    locale: "fr_FR",
  },
};

// Five questions somebody has before ordering food somewhere they have never
// eaten. Each answer restates its subject and lands on a concrete fact, so it
// still reads as a complete thought when an assistant lifts it out alone.
const FAQ = [
  {
    q: "Peut-on commander à manger en ligne à Rodrigues ?",
    a: "Oui. Les plats des cuisines de l'île sont proposés avec leur prix et leur temps de préparation, et vous commandez depuis le site sans passer un appel. La plupart des cuisines annoncent 15 à 30 minutes.",
  },
  {
    q: "Combien coûte un repas à Rodrigues ?",
    a: "Les plats commencent autour de Rs 80 pour une petite portion et montent jusqu'à Rs 2 500 pour une langouste grillée entière, avec des caris, du poisson grillé et des nouilles entre les deux. Le prix est affiché avant que vous commandiez, pas à la fin.",
  },
  {
    q: "Peut-on venir chercher sa commande plutôt que payer la livraison ?",
    a: "Oui, et le retrait est sans frais : vous recevez un code à présenter à la cuisine en arrivant. La livraison reste possible lorsque la cuisine la propose.",
  },
  {
    q: "Y a-t-il des plats végétariens, halal ou sans gluten ?",
    a: "La liste se filtre par végétarien, halal, sans gluten et fruits de mer, et chaque plat porte ses propres mentions alimentaires ainsi que son niveau de piment — visibles avant de commander, pas après.",
  },
  {
    q: "Qu'est-ce qu'on mange à Rodrigues ?",
    a: "La cuisine rodriguaise tourne autour de la mer et du jardin créole : ourite, poisson grillé au charbon, caris et rougailles, achards, et des douceurs à la noix de coco. Les cuisines de l'île préparent ces plats à la commande.",
  },
];

export default async function MangerARodriguesPage() {
  const { content, businessWhatsApp } = await getFleetView();

  const wa = (businessWhatsApp ?? "").replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        "Bonjour ! Je voudrais commander à manger à Rodrigues.",
      )}`
    : "/#contact";

  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT, not the
          reader's preference. See components/PageLanguage.tsx. */}
      <PageLanguage lang="fr" />
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: "fr",
            mainEntity: FAQ.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          {
            // An ordering service. Deliberately not a Restaurant: Roulé
            // Rodrigues does not cook, the kitchens do, and claiming to be the
            // restaurant would contradict every other surface on this site.
            "@context": "https://schema.org",
            "@type": "Service",
            "@id": `${SITE_URL}/fr/manger-a-rodrigues#service`,
            name: "Commande de repas à Rodrigues",
            serviceType: "Commande de repas en ligne",
            inLanguage: "fr",
            provider: {
              "@type": "Organization",
              name: "Roulé Rodrigues",
              url: SITE_URL,
            },
            areaServed: {
              "@type": "Place",
              name: "Rodrigues, Maurice",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Rodrigues",
                addressCountry: "MU",
              },
            },
            availableChannel: {
              "@type": "ServiceChannel",
              serviceUrl: `${SITE_URL}/food`,
              name: "Commander en ligne",
              availableLanguage: ["fr", "en", "mfe"],
            },
            description:
              "Commandez des plats rodriguais préparés par les cuisines de l'île : prix et temps de préparation affichés avant la commande, retrait gratuit avec un code, ou livraison lorsque la cuisine la propose.",
          },
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            {
              name: "Manger à Rodrigues",
              url: `${SITE_URL}/fr/manger-a-rodrigues`,
            },
          ]),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={
          content.recommended.enabled && content.recommended.items.length > 0
        }
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      <main className="bg-dark min-h-screen" lang="fr">
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              ÎLE RODRIGUES
            </p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              Manger à Rodrigues, et commander en ligne
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              La cuisine rodriguaise se joue entre la mer et le jardin
              créole&nbsp;: ourite, poisson grillé au charbon, caris et
              rougailles. Les cuisines de l&apos;île les préparent à la
              commande — vous voyez le prix et le temps de préparation avant de
              commander, et vous venez chercher ou vous faites livrer.
            </p>

            <ul className="mt-7 space-y-2.5">
              {[
                "Dès Rs 80 le plat, jusqu'à Rs 2 500 pour une langouste entière",
                "Prix et temps de préparation affichés avant la commande",
                "Retrait sans frais, avec un code à présenter à la cuisine",
                "Livraison lorsque la cuisine la propose",
                "Filtres végétarien, halal, sans gluten et fruits de mer",
                "Seuls les plats réellement préparés sur le moment sont proposés",
              ].map((li) => (
                <li
                  key={li}
                  className="flex items-start gap-2.5 font-dm text-sm text-offwhite/90"
                >
                  <Check size={16} className="mt-0.5 shrink-0 text-yellow" />
                  {li}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/food"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Voir les plats &amp; commander <ArrowRight size={16} />
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                <MessageCircle size={15} /> Nous écrire sur WhatsApp
              </a>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
            Questions fréquentes
          </h2>
          <div className="mt-6 space-y-7">
            {FAQ.map((f) => (
              <section key={f.q}>
                <h3 className="font-syne text-lg font-bold text-offwhite">
                  {f.q}
                </h3>
                <p className="mt-2 font-dm text-muted leading-relaxed">{f.a}</p>
              </section>
            ))}
          </div>

          {/* Somebody sorting out dinner is usually sorting out the rest of the
              trip too, and these are the French pages that already rank. */}
          <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
            <p className="font-syne text-lg font-bold text-offwhite">
              Aussi sur Roulé Rodrigues
            </p>
            <ul className="mt-4 space-y-2.5">
              {[
                {
                  href: "/fr/hebergement-rodrigues",
                  label: "Où dormir à Rodrigues",
                },
                {
                  href: "/fr/que-faire-a-rodrigues",
                  label: "Que faire à Rodrigues",
                },
                {
                  href: "/fr/taxi-rodrigues",
                  label: "Taxi et transfert aéroport",
                },
                {
                  href: "/fr/location-scooter-rodrigues",
                  label: "Location de scooter à Rodrigues",
                },
                {
                  href: "/fr/plages-rodrigues",
                  label: "Les plus belles plages de Rodrigues",
                },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    {l.label} <ArrowRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
