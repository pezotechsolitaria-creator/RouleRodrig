import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { getFleetView, fleetFromPrice } from "@/lib/site-data";
import { loc } from "@/lib/localize";
import { RODRIGUES_KNOWLEDGE } from "@/lib/rodrigues-knowledge";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import { readTransferFares } from "@/lib/rides/fares";
import type { TransferPricing } from "@/lib/rides/transfer";
import { taxiPriceAnswer, TRANSFERS_LINK } from "@/lib/taxi-faq";
import LangLink from "@/components/nav/LangLink";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";
import HubBacklink from "@/components/nav/HubBacklink";
import FrenchTwinLink from "@/components/FrenchTwinLink";

export const revalidate = 3600;

// ── SE DÉPLACER À RODRIGUES ─────────────────────────────────────────────────
//
// The audit's last French recommendation, and the one with the clearest gap:
// the ENGLISH query "how to get around Rodrigues" already returns
// roulerodrig.com, and the French one returned nothing of ours at all. Same
// question, same island, two audiences, one of them unserved.
//
// ── IT REUSES WHAT WAS ALREADY RESEARCHED ───────────────────────────────────
// lib/rodrigues-knowledge.ts is the site's checked fact base and already
// carries `getThere` and `gettingAround` in French — written for Ti Roulé to
// answer with. Repeating those facts here in my own words would have created a
// second version of them to drift; the page reads the same entries the
// assistant does, so the site says one thing.
//
// content.gettingAround.options carries titleFr/textFr siblings the admin
// maintains, read through loc() for the same reason.
//
// ── AND THE HONEST PART ─────────────────────────────────────────────────────
// No DRIVER's fare is published on this page. Rodriguan taxis are not metered
// and there is no official fare table, so any number here would be invented and
// would be quoted back at a driver who never agreed to it. The page says that
// plainly and sends people to agree the price first.
//
// The AIRPORT is the exception (SEO audit 2026-09-29 C2/C5): since M220 airport
// transfers booked here have the platform's own zone fares, published on
// /transfers. This page said "nous n'en avons pas de fiable" while its English
// twin (/blog/how-to-get-around-rodrigues) and /fr/taxi-rodrigues gave the
// two-part answer, so the price answer is now taxiPriceAnswer("fr") — the zone
// fares read from the price sheet at render time, never typed here, or the
// page named instead of a number when the sheet cannot be read — and the page
// links /transfers.

const NB = " "; // narrow no-break space — French sets one before ? ! ; :

const TITLE = `Se déplacer à Rodrigues${NB}: le guide | Roule Rodrigues`;
const DESCRIPTION =
  "Comment se déplacer à Rodrigues : scooter, voiture, bus limités ou taxi à prix convenu, ce que chacun coûte vraiment, et comment venir de Maurice.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/se-deplacer-a-rodrigues`,
    // Mirror of the block on /blog/how-to-get-around-rodrigues — the same
    // topic in genuinely translated writing. This page was the audit's one
    // hreflang orphan: 7 of 8 FR pages were paired, this one had no partner.
    languages: {
      "en": `${SITE_URL}/blog/how-to-get-around-rodrigues`,
      "fr": `${SITE_URL}/fr/se-deplacer-a-rodrigues`,
      "x-default": `${SITE_URL}/blog/how-to-get-around-rodrigues`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/se-deplacer-a-rodrigues`,
    type: "article",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const rs = (n: number) => n.toLocaleString("fr-FR");

// `link` renders under its answer; it is not part of the FAQPage text.
type FaqEntry = { q: string; a: string; link?: { href: string; label: string } };

const FAQ = (scooter: number, car: number, airport: TransferPricing | null): FaqEntry[] => [
  {
    q: `Faut-il louer une voiture à Rodrigues${NB}?`,
    a: `Pas forcément, mais il faut louer quelque chose. Les bus relient Port Mathurin aux villages principaux, ils sont rares et s'arrêtent tôt, et ils ne vont pas aux plages isolées. Un scooter à partir de Rs ${rs(scooter)} par jour suffit à deux avec peu de bagages ; la voiture, à partir de Rs ${rs(car)}, s'impose en famille, avec des valises, ou pour la climatisation.`,
  },
  {
    q: `Y a-t-il des transports en commun à Rodrigues${NB}?`,
    // The airport figures come from the airport operator's own page
    // (arl.aero), which is the only primary source we found for them.
    a: "Oui : un réseau d'une vingtaine de lignes, presque toutes au départ de Port Mathurin. Deux d'entre elles desservent l'aéroport — l'arrêt est à trois minutes à pied du terminal, en face du poste de police, avec un service de 6h à 16h30 pour environ Rs 29. C'est utile à savoir et c'est aussi la limite : sur un vol tardif, le bus n'est plus une option, et aucune ligne ne va aux plages isolées.",
  },
  {
    q: `Combien coûte un taxi à Rodrigues${NB}?`,
    // The same two-part answer /fr/taxi-rodrigues gives to the same question
    // (C2): two FAQPage answers on one site must not contradict each other.
    a: taxiPriceAnswer("fr", airport),
    link: TRANSFERS_LINK.fr,
  },
  {
    q: `De quel côté roule-t-on${NB}?`,
    a: "À gauche, comme à Maurice, volant à droite. Venant de France ou de La Réunion, c'est l'inverse de vos habitudes. Les routes sont peu fréquentées, cela s'apprend vite, mais soyez attentif aux premières intersections.",
  },
  {
    q: `Comment rejoindre Rodrigues depuis Maurice${NB}?`,
    a: "Le plus simple est l'avion : environ une heure et demie avec Air Mauritius jusqu'à l'aéroport de Plaine Corail, tous les jours. Il existe aussi un ferry passagers depuis Port-Louis vers Port Mathurin, mais environ une fois par MOIS et quelque 36 heures de mer à l'aller — vérifiez le calendrier de la Mauritius Shipping Corporation avant de compter dessus.",
  },
  {
    q: `Les routes sont-elles difficiles${NB}?`,
    a: "Elles sont étroites, sinueuses et vallonnées, mais goudronnées sur les axes et très peu encombrées. Ce n'est pas la circulation qui demande de l'attention, ce sont les virages, les montées et le bétail. Roulez lentement, vous n'avez de toute façon nulle part où aller vite.",
  },
];

export default async function SeDeplacerPage() {
  const [content, { fleet }, fares] = await Promise.all([
    getContent(),
    getFleetView(),
    readTransferFares(),
  ]);

  const scooterFrom = fleetFromPrice(fleet, "scooter");
  const carFrom = fleetFromPrice(fleet, "car");
  const faq = FAQ(scooterFrom, carFrom, fares.airport);

  // The same researched entries Ti Roulé answers from, in French.
  const know = (id: string) => RODRIGUES_KNOWLEDGE.find((k) => k.id === id);
  const getThereFr = know("getThere")?.fr ?? "";
  const aroundFr = know("gettingAround")?.fr ?? "";

  const options = (content.gettingAround.options ?? []).filter((o) =>
    o.title?.trim(),
  );

  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT. */}
      <PageLanguage lang="fr" />
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: "fr",
            mainEntity: faq.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            {
              name: "Se déplacer à Rodrigues",
              url: `${SITE_URL}/fr/se-deplacer-a-rodrigues`,
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
              Se déplacer à Rodrigues
            </h1>
            {/* Answer first. */}
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              {aroundFr} L&apos;île fait une vingtaine de kilomètres de long :
              les distances sont courtes, mais les routes montent, descendent et
              tournent, et rien de ce qu&apos;on vient voir n&apos;est desservi
              par un bus.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          {options.length > 0 && (
            <section>
              <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
                Les options, honnêtement
              </h2>
              <ul className="mt-6 space-y-5">
                {options.map((o) => (
                  <li
                    key={o.id}
                    className="rounded-2xl border border-dark-border bg-white/[0.02] p-5"
                  >
                    <h3 className="font-syne text-lg font-bold text-offwhite">
                      {loc("fr", o.title, o.titleFr, o.titleCr)}
                    </h3>
                    <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
                      {loc("fr", o.text, o.textFr, o.textCr)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-14">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Ce que ça coûte
            </h2>
            <ul className="mt-5 space-y-3">
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dark-border pb-3">
                <span className="font-dm text-sm text-offwhite/90">
                  Scooter, à la journée
                </span>
                <span className="font-dm text-sm text-yellow/90 tabular-nums">
                  dès Rs {rs(scooterFrom)}
                </span>
              </li>
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dark-border pb-3">
                <span className="font-dm text-sm text-offwhite/90">
                  Voiture, à la journée
                </span>
                <span className="font-dm text-sm text-yellow/90 tabular-nums">
                  dès Rs {rs(carFrom)}
                </span>
              </li>
              <li className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-dark-border pb-3">
                <span className="font-dm text-sm text-offwhite/90">Taxi</span>
                {/* Two parts, as the English twin's table row (C2). No figure
                    here: the zone fares are in the FAQ answer, read from the
                    price sheet. */}
                <span className="font-dm text-sm text-muted">
                  transfert aéroport réservé ici : tarif fixe par zone ; autre
                  course : prix à convenir avant de monter
                </span>
              </li>
            </ul>

            {/* The most useful sentence on the page, and the one a comparison
                site cannot write because it does not know the custom. */}
            <div className="mt-5 rounded-2xl border border-yellow/30 bg-yellow/[0.06] p-4">
              {/* "Nous n'en avons pas de fiable" stopped being true with M220's
                  zone fares; this now mirrors the English twin's taxi
                  paragraphs (C2): the airport is the one exception, every
                  other ride keeps no price list, for the same reason. */}
              <p className="font-dm text-sm leading-relaxed text-offwhite/90">
                Aucun tarif officiel n&apos;est publié pour les taxis à
                Rodrigues. Pour un taxi trouvé sur place, convenez du prix avant
                de monter : c&apos;est l&apos;usage, tout le monde le fait, et
                personne ne le prendra mal. La seule exception sur ce site,
                c&apos;est l&apos;aéroport : les transferts aéroport réservés
                ici ont des tarifs fixes par zone, selon la distance par la
                route depuis Plaine Corail, et se règlent au chauffeur. Pour
                toute autre course, nous ne publions volontairement aucune
                grille — un chiffre inventé serait ensuite opposé à un chauffeur
                qui ne l&apos;a jamais accepté.
              </p>
              {/* LangLink: /transfers holds the booking form, which reads the
                  site language — a French reader lands on it in French. */}
              <LangLink
                lang="fr"
                href={TRANSFERS_LINK.fr.href}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
              >
                {TRANSFERS_LINK.fr.label} <ArrowRight size={14} />
              </LangLink>
            </div>
          </section>

          <section className="mt-14">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Rejoindre l&apos;île
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              {getThereFr}
            </p>
          </section>

          <section className="mt-14">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Questions fréquentes
            </h2>
            <div className="mt-6 space-y-7">
              {faq.map((f) => (
                <section key={f.q}>
                  <h3 className="font-syne text-lg font-bold text-offwhite">
                    {f.q}
                  </h3>
                  <p className="mt-2 font-dm text-muted leading-relaxed">
                    {f.a}
                  </p>
                  {f.link && (
                    <LangLink
                      lang="fr"
                      href={f.link.href}
                      className="mt-1 inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
                    >
                      {f.link.label} <ArrowRight size={14} />
                    </LangLink>
                  )}
                </section>
              ))}
            </div>
          </section>

          <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
            <p className="font-syne text-lg font-bold text-offwhite">
              Réserver votre véhicule
            </p>
            <ul className="mt-4 space-y-3">
              {[
                {
                  href: "/fr/location-scooter-rodrigues",
                  label: "Location de scooter à Rodrigues",
                },
                {
                  href: "/fr/location-voiture-rodrigues",
                  label: "Location de voiture à Rodrigues",
                },
                { href: "/taxi", label: "Les chauffeurs de taxi de l'île" },
                {
                  href: "/fr/que-faire-a-rodrigues",
                  label: "Que faire à Rodrigues",
                },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    {l.label} <ArrowRight size={14} />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* The English twin hreflang names — the blog post, not
              /browse/getting-around — as a link a crawler can follow (SEO
              audit 2026-09-29 C13). The other French pages all had one. */}
          <FrenchTwinLink
            href="/blog/how-to-get-around-rodrigues"
            label="Read this page in English"
            lang="en"
          />
        </div>
      </main>
      <HubBacklink href="/fr" label="Tous nos guides en français" />
    </>
  );
}
