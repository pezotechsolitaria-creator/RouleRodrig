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
// /taxi had no French counterpart at all. Every other section of this site has
// one — scooter, voiture, hébergement, plages, que faire, se déplacer — and
// taxi, the thing a visitor needs in the first hour of their trip, did not.
//
// The audience is Réunionnais and metropolitan French: they land at Plaine
// Corail needing a ride before they need anything else on this site, and
// "taxi Rodrigues" and "transfert aéroport Rodrigues" are what they type.
//
// The French pages already carry this site's best rankings —
// /fr/plages-rodrigues sits at position 9 for "plage rodrigues" where the
// English /guide/beaches sits at 83 for the same query. This is the same play,
// on the page that answers an arrival.
//
// ── WHAT IS DELIBERATELY NOT SAID ───────────────────────────────────────────
//
// No fare. taxi_drivers.rate_from exists in the database and M96 decided it
// must never be published: every driver charges differently, so a number here
// would be a quote Roulé Rodrigues cannot honour. lib/i18n.ts states that on
// every taxi surface, and this page does not become the exception.
//
// No claim to be a transport operator. The disclaimer this site publishes says
// plainly that it is not one, and a French page implying otherwise would
// contradict its own English twin.
//
// No driver count. It moves, and "nos chauffeurs" reads as many when it is
// currently one — so the page describes the mechanism, not the size of a fleet.

const TITLE = "Taxi à Rodrigues et transfert aéroport | Roule Rodrigues";
const DESCRIPTION =
  "Taxi et transfert à l'île Rodrigues : chauffeurs locaux indépendants, prise en charge à l'aéroport de Plaine Corail, prix confirmé avant tout paiement. Réservation en ligne ou WhatsApp.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/taxi-rodrigues`,
    // Mirrors the `languages` block on app/taxi/layout.tsx. A one-way hreflang
    // is silently ignored, so both halves must name each other.
    languages: {
      "en": `${SITE_URL}/taxi`,
      "fr": `${SITE_URL}/fr/taxi-rodrigues`,
      "x-default": `${SITE_URL}/taxi`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/taxi-rodrigues`,
    type: "website",
    locale: "fr_FR",
  },
};

// Five questions somebody has before landing on an island they do not know.
// Every answer restates its subject and ends on a concrete fact, so it still
// reads as a complete thought when an assistant lifts it out with no context.
const FAQ = [
  {
    q: "Comment aller de l'aéroport de Plaine Corail à son logement ?",
    a: "En taxi : il n'y a pas de navette régulière depuis l'aéroport de Plaine Corail. Réservez un transfert à l'avance en indiquant votre numéro de vol — il figure sur la fiche du chauffeur, qui sait donc quelle arrivée attendre et peut tenir compte d'un retard.",
  },
  {
    q: "Combien coûte un taxi à Rodrigues ?",
    a: "Chaque chauffeur fixe son propre tarif : il n'existe pas de grille de prix sur l'île. Dites-nous votre trajet et le prix vous est confirmé avant tout engagement — rien ne vous est facturé tant que vous n'avez pas accepté, et Roulé Rodrigues ne prend jamais de paiement pour une course.",
  },
  {
    q: "Faut-il réserver son taxi à l'avance à Rodrigues ?",
    a: "Pour une arrivée à l'aéroport, oui : les vols vers Rodrigues sont peu nombreux et les chauffeurs s'organisent autour d'eux. Pour un trajet en journée, votre demande part aux chauffeurs disponibles et vous avez une réponse en quelques minutes ; vous pouvez aussi appeler ou écrire directement à un chauffeur de la liste.",
  },
  {
    q: "Les chauffeurs parlent-ils français ?",
    a: "Oui. Les chauffeurs rodriguais parlent créole et français, et souvent anglais. Vous pouvez réserver, poser vos questions et convenir du prix en français, par WhatsApp comme au téléphone.",
  },
  {
    q: "Peut-on louer un taxi à la journée pour visiter l'île ?",
    a: "Oui : c'est la mise à disposition. Vous indiquez où l'on vient vous chercher, et le chauffeur reste avec vous — vous lui dites où aller au fur et à mesure de la journée. Le prix est convenu avec lui avant le départ.",
  },
];

export default async function TaxiRodriguesPage() {
  const { content, businessWhatsApp } = await getFleetView();

  const wa = (businessWhatsApp ?? "").replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        "Bonjour ! J'ai besoin d'un taxi à Rodrigues.",
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
            // A booking service, not a transport service — the same modelling
            // the English /taxi uses, and for the same reason: this site's own
            // disclaimer says it is not a transport operator.
            "@context": "https://schema.org",
            "@type": "Service",
            "@id": `${SITE_URL}/fr/taxi-rodrigues#service`,
            name: "Réservation de taxi et de transfert à Rodrigues",
            serviceType: "Réservation de taxi",
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
              serviceUrl: `${SITE_URL}/taxi/book`,
              name: "Réserver une course",
              availableLanguage: ["fr", "en", "mfe"],
            },
            description:
              "Demandez une course à Rodrigues et elle part aux chauffeurs disponibles, y compris les transferts depuis l'aéroport de Plaine Corail. Les chauffeurs sont indépendants, fixent leur tarif et confirment le prix avant tout engagement.",
          },
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            { name: "Taxi à Rodrigues", url: `${SITE_URL}/fr/taxi-rodrigues` },
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
              Taxi à Rodrigues et transfert depuis l&apos;aéroport
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Il n&apos;y a pas de navette régulière depuis Plaine Corail, et
              les bus ne desservent pas tout. Le taxi reste le moyen le plus
              simple d&apos;arriver à son logement et de traverser
              l&apos;île&nbsp;: donnez-nous votre trajet, nous le transmettons
              aux chauffeurs disponibles, et vous validez le prix avant
              d&apos;engager quoi que ce soit.
            </p>

            <ul className="mt-7 space-y-2.5">
              {[
                "Prix confirmé avant tout paiement — rien ne vous est facturé tant que vous n'avez pas accepté",
                "Transfert aéroport avec votre numéro de vol, transmis au chauffeur",
                "Chauffeurs rodriguais indépendants, parlant créole et français",
                "Mise à disposition à la journée : le chauffeur reste avec vous",
                "Suivi de votre course en ligne une fois la réservation confirmée",
                "Réservation par le site ou directement sur WhatsApp",
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
                href="/taxi/book"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Réserver une course <ArrowRight size={16} />
              </Link>
              <Link
                href="/taxi"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                Voir les chauffeurs
              </Link>
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                <MessageCircle size={15} /> WhatsApp
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

          {/* Somebody who has just sorted their arrival needs the rest of the
              trip next, and these are the French pages that already rank. */}
          <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
            <p className="font-syne text-lg font-bold text-offwhite">
              Aussi sur Roulé Rodrigues
            </p>
            <ul className="mt-4 space-y-2.5">
              {[
                {
                  href: "/fr/se-deplacer-a-rodrigues",
                  label: "Se déplacer à Rodrigues : tous les moyens comparés",
                },
                {
                  href: "/fr/location-voiture-rodrigues",
                  label: "Location de voiture à Rodrigues",
                },
                {
                  href: "/fr/location-scooter-rodrigues",
                  label: "Location de scooter à Rodrigues",
                },
                {
                  href: "/fr/hebergement-rodrigues",
                  label: "Où dormir à Rodrigues",
                },
                {
                  href: "/fr/que-faire-a-rodrigues",
                  label: "Que faire à Rodrigues",
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
