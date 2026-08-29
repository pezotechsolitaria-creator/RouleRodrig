import type { Metadata } from "next";
import Link from "next/link";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import AppPageHeader from "@/components/AppPageHeader";
import PageLanguage from "@/components/PageLanguage";

// ── ÎLE AUX COCOS, EN FRANÇAIS ──────────────────────────────────────────────
//
// The French counterpart of /guide/ile-aux-cocos, and not a translation of it.
// The audit's finding was that the whole French estate was three pages for a
// market that searches almost entirely in French — Mauritius is francophone and
// much of the tourist traffic is Réunionnais and metropolitan French. "Excursion
// île aux Cocos" is typed far more often than its English equivalent.
//
// ── WRITTEN, NOT GLOSSED ────────────────────────────────────────────────────
// The bird names are the real French ones — noddi brun, gygis blanche, sterne
// de Dougall — not calques of the English. A French reader who knows birds can
// tell the difference immediately, and this is a page whose whole credibility
// rests on getting the species right. French typography too: narrow no-break
// spaces before « ? » and « : », which is what a French reader expects and what
// its absence makes look automatic.
//
// The facts are the same as the English page and come from the same two
// sources, cited here as well. What is deliberately absent is also the same:
// the island's area, the crossing time, and any bird count.
//
// hreflang is bidirectional — this page names the English one and the English
// one names this. A one-way hreflang is silently ignored by Google, which is
// the note already written on /guide/beaches.

export const revalidate = 3600;

// Narrow no-break space: French sets one before ? ! ; and :
const NB = " ";

const TITLE = `Île aux Cocos, Rodrigues${NB}: ce qu'il faut savoir avant de réserver`;
const DESCRIPTION =
  "L'île aux Cocos est une réserve d'oiseaux marins à 4 km à l'ouest de Rodrigues. On ne s'y rend pas seul : l'accès exige une autorisation et un bateau encadré. Ce que comprend la sortie, ce qui est fermé aux visiteurs, et comment réserver.";

export const metadata: Metadata = {
  title: `${TITLE} | Roule Rodrigues`,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/ile-aux-cocos`,
    languages: {
      "en": `${SITE_URL}/guide/ile-aux-cocos`,
      "fr": `${SITE_URL}/fr/ile-aux-cocos`,
      "x-default": `${SITE_URL}/guide/ile-aux-cocos`,
    },
  },
  openGraph: {
    title: `${TITLE} | Roule Rodrigues`,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/ile-aux-cocos`,
    type: "article",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: `Peut-on visiter l'île aux Cocos seul${NB}?`,
    a: "Non. L'île est une réserve naturelle et ne se visite pas en accès libre : les sorties se font en bateau, encadrées, et l'accès demande l'autorisation de Discovery Rodrigues Co. Ltd. Concrètement, cela veut dire réserver auprès d'un opérateur local, qui obtient l'autorisation en même temps que la sortie.",
  },
  {
    q: `Où se trouve l'île aux Cocos${NB}?`,
    a: "À quatre kilomètres à l'ouest de Rodrigues, dans le lagon. Elle est inhabitée. Les excursions partent de Pointe du Diable en bateau affrété.",
  },
  {
    q: `Quels oiseaux voit-on à l'île aux Cocos${NB}?`,
    a: "C'est un site de nidification pour le noddi brun, le noddi à bec grêle, la sterne fuligineuse, la gygis blanche et la sterne de Dougall. Des limicoles migrateurs y ont aussi été observés : tournepierre à collier, bécasseau cocorli, drome ardéole et courlis corlieu. Ce sont ces colonies qui justifient la protection de l'île et la limitation de l'accès.",
  },
  {
    q: `Toute l'île est-elle accessible${NB}?`,
    a: "Non. La pointe sud est délimitée par des piquets en bois et fermée aux visiteurs, pour tenir les gens à l'écart de la colonie nicheuse. Ce n'est pas une formalité : c'est la condition à laquelle la réserve se visite.",
  },
  {
    q: `Combien coûte l'excursion à l'île aux Cocos${NB}?`,
    a: "Chaque opérateur fixe son prix, en général bateau et déjeuner compris. La sortie proposée sur Roulé Rodrigues est à Rs 2 000 par personne avec Les Inséparables. Vérifiez ce qui est inclus au moment de réserver, car cela varie d'un opérateur à l'autre.",
  },
  {
    q: `Quand y aller${NB}?`,
    a: "Le matin, et en réservant à l'avance plutôt que le jour même. Les bateaux sortent quand le lagon le permet : une sortie peut être reportée pour cause de météo. Prévoyez une journée de battement si vous y tenez.",
  },
];

export default async function IleAuxCocosFrPage() {
  const content = await getContent();

  return (
    <>
      <PageLanguage lang="fr" />

      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            { name: "Guide de l'île", url: `${SITE_URL}/fr/guide-rodrigues` },
            { name: "Île aux Cocos", url: `${SITE_URL}/fr/ile-aux-cocos` },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "TouristAttraction",
            "@id": `${SITE_URL}/fr/ile-aux-cocos#place`,
            name: "Île aux Cocos",
            description:
              "Réserve d'oiseaux marins inhabitée, à quatre kilomètres à l'ouest de Rodrigues, visitée en bateau avec un guide. Site de nidification de noddis et de sternes ; la pointe sud est fermée aux visiteurs.",
            url: `${SITE_URL}/fr/ile-aux-cocos`,
            inLanguage: "fr",
            geo: {
              "@type": "GeoCoordinates",
              latitude: -19.7194,
              longitude: 63.3,
            },
            containedInPlace: {
              "@type": "Place",
              name: "Île Rodrigues, Maurice",
            },
            isAccessibleForFree: false,
            publicAccess: false,
          },
          // Chaque question ci-dessous est rendue sur la page, mot pour mot.
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
        ]}
      />

      <AppPageHeader showBack backHref="/fr/guide-rodrigues" />

      <main className="min-h-[calc(100vh-3.5rem)] bg-dark px-4 pb-16 pt-4 text-offwhite">
        <article className="mx-auto max-w-2xl">
          <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">
            GUIDE DE L&apos;ÎLE
          </p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold leading-tight sm:text-4xl">
            Île aux Cocos
          </h1>

          {/* La réponse d'abord : celle qui change les plans du lecteur. */}
          <p className="mt-4 font-dm text-lg leading-relaxed text-offwhite/90">
            L&apos;île aux Cocos est une réserve d&apos;oiseaux marins
            inhabitée, à quatre kilomètres à l&apos;ouest de Rodrigues.{" "}
            <strong>On ne s&apos;y rend pas seul.</strong> La visite se fait en
            bateau avec un guide, l&apos;accès demande une autorisation, et la
            pointe sud de l&apos;île est entièrement fermée pour laisser les
            colonies nicheuses tranquilles. Réservez auprès d&apos;un opérateur
            : c&apos;est lui qui obtient l&apos;autorisation avec la sortie.
          </p>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Ce que comprend la sortie
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Une traversée en bateau depuis Pointe du Diable, quelques heures
              sur un îlot de sable dans le lagon ouest, et le déjeuner — la
              plupart des opérateurs l&apos;incluent. Ce que l&apos;on vient
              voir, ce sont les oiseaux : l&apos;île est un site de nidification
              pour le noddi brun, le noddi à bec grêle, la sterne fuligineuse,
              la gygis blanche et la sterne de Dougall, et ils y sont en nombre.
              Des limicoles migrateurs y passent aussi — tournepierre à collier,
              bécasseau cocorli, drome ardéole, courlis corlieu.
            </p>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Les bateaux sortent quand le lagon le permet. Si la météo décale
              votre sortie, c&apos;est normal : prévoyez une journée de
              battement plutôt que de la placer votre dernier matin.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Ce que les visiteurs ignorent souvent
            </h2>
            <div className="mt-3 rounded-2xl border border-yellow/30 bg-yellow/[0.06] p-4">
              <p className="font-dm leading-relaxed text-offwhite/90">
                La pointe sud est délimitée par des piquets en bois et fermée
                aux visiteurs. Ce n&apos;est ni une suggestion ni une limite
                souple : c&apos;est la condition à laquelle la réserve
                s&apos;ouvre, et la raison pour laquelle la colonie est encore
                là. Restez sur la partie qu&apos;on vous montre.
              </p>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Ce que nous ne pouvons pas vous dire
            </h2>
            <p className="mt-3 font-dm leading-relaxed text-muted">
              Des chiffres circulent sur la superficie de l&apos;île, la durée
              de la traversée et le nombre d&apos;oiseaux. Nous n&apos;en avons
              trouvé aucun suffisamment sourcé pour le reprendre, donc cette
              page ne le fait pas. Posez la question à votre opérateur au moment
              de réserver : il y va toutes les semaines, et sa réponse vaut
              mieux qu&apos;un nombre recopié de site en site.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="font-syne text-xl font-extrabold">
              Questions fréquentes
            </h2>
            <dl className="mt-3 space-y-4">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-syne text-base font-bold text-offwhite">
                    {f.q}
                  </dt>
                  <dd className="mt-1 font-dm leading-relaxed text-muted">
                    {f.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8 rounded-2xl border border-white/10 bg-dark-card p-5">
            <h2 className="font-syne text-lg font-extrabold">Réserver</h2>
            <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
              L&apos;excursion proposée sur Roulé Rodrigues part avec Les
              Inséparables. Les opérateurs obtiennent l&apos;autorisation dans
              le cadre de la sortie : réserver auprès de l&apos;un d&apos;eux,
              c&apos;est ainsi que la permission se règle.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/browse/tours"
                className="flex min-h-12 items-center justify-center rounded-xl bg-yellow px-5 font-dm text-sm font-bold text-dark"
              >
                Voir l&apos;excursion
              </Link>
              <Link
                href="/fr/guide-rodrigues"
                className="flex min-h-12 items-center justify-center rounded-xl border border-white/15 px-5 font-dm text-sm text-offwhite"
              >
                Guide de l&apos;île
              </Link>
            </div>
          </section>

          <section className="mt-8 border-t border-white/10 pt-5">
            <h2 className="font-syne text-sm font-bold text-muted">Sources</h2>
            <ul className="mt-2 space-y-1 font-dm text-xs text-muted">
              <li>
                <a
                  href="https://discover-rodrigues.com/nature-wildlife/ile-aux-cocos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow"
                >
                  Office du Tourisme de Rodrigues — Île aux Cocos
                </a>{" "}
                — autorisation, point de départ.
              </li>
              <li>
                <a
                  href="https://en.wikipedia.org/wiki/%C3%8Ele_aux_Cocos"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-yellow"
                >
                  Wikipédia — Île aux Cocos
                </a>{" "}
                — espèces nicheuses, pointe sud fermée, position.
              </li>
            </ul>
            <p className="mt-3 font-dm text-xs text-muted/70">
              Les tarifs et les règles d&apos;accès changent. Si vous trouvez
              une information dépassée ici, dites-le-nous —{" "}
              {content.contact.email || "nous la corrigerons"}.
            </p>
            <p className="mt-3 font-dm text-xs text-muted/70">
              <Link
                href="/guide/ile-aux-cocos"
                className="underline hover:text-yellow"
              >
                Read this page in English
              </Link>
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
