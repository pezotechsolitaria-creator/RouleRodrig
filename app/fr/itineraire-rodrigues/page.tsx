import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { getFleetView, fleetFromPrice } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

// ── ITINÉRAIRE À RODRIGUES ──────────────────────────────────────────────────
//
// The French twin of /blog/rodrigues-itinerary, written the day after it —
// not a translation job queued for later, because "later" is how
// /fr/location-voiture-rodrigues spent months unindexed. The audience that
// asks "itinéraire Rodrigues" is the site's MAJORITY audience (Réunion,
// Maurice, France), and the English post alone serves them at position ~60.
//
// Same composition rule as the English post: every place named here is
// already published on this site's own guides and listings, and the weather/
// transport advice defers by link to /fr/se-deplacer-a-rodrigues and the
// guide, which carry the verified facts. Nothing is claimed here first.
//
// Prices in the FAQ are DERIVED from the live fleet (fleetFromPrice), exactly
// as /fr/se-deplacer-a-rodrigues does — a hardcoded number here is the
// Rs 599/699 drift again, in French.

const NB = " "; // narrow no-break space — French sets one before ? ! ; :

const TITLE = `Itinéraire à Rodrigues${NB}: 3, 5 ou 7 jours | Roule Rodrigues`;
const DESCRIPTION =
  "Un itinéraire à Rodrigues jour par jour, écrit par des locaux : plages de la côte est, Trou d'Argent, Mont Limon, Île aux Cocos — en 3, 5 ou 7 jours.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/itineraire-rodrigues`,
    // Mirror of the block generateMetadata emits on /blog/rodrigues-itinerary
    // — a one-way hreflang is silently ignored by Google.
    languages: {
      "en": `${SITE_URL}/blog/rodrigues-itinerary`,
      "fr": `${SITE_URL}/fr/itineraire-rodrigues`,
      "x-default": `${SITE_URL}/blog/rodrigues-itinerary`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/itineraire-rodrigues`,
    type: "article",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

const rs = (n: number) => n.toLocaleString("fr-FR");

// Visible on the page AND the source of the FAQPage markup below — one list,
// so the structured data can never claim a question the page does not render.
const FAQ = (scooter: number, car: number) => [
  {
    q: `Combien de jours faut-il pour visiter Rodrigues${NB}?`,
    a: "Quatre à cinq jours pour un vrai séjour sans courir : les sites majeurs, deux ou trois plages sans se presser, une sortie en bateau, et une matinée sans programme — ce qui, à Rodrigues, est le but. En dessous de trois jours, on passe plus de temps à se déplacer qu'à être quelque part.",
  },
  {
    q: `Que voir absolument en 3 jours${NB}?`,
    a: "Un jour pour la côte est et ses plages — Pointe Coton, puis le sentier côtier vers Trou d'Argent. Un jour pour l'intérieur : les tortues géantes de la réserve François Leguat, la Caverne Patate et le coucher de soleil depuis le Mont Limon. Un jour pour Port Mathurin, avec le marché si vos dates tombent bien.",
  },
  {
    q: `Faut-il réserver un véhicule à l'avance${NB}?`,
    a: `Oui. L'île est petite et les bons véhicules partent vite en saison. Un scooter à partir de Rs ${"{SCOOTER}"} par jour suffit à deux ; une voiture, à partir de Rs ${"{CAR}"}, s'impose en famille ou avec des valises. Réservez avant d'arriver, et votre premier jour commence à la plage plutôt qu'à un comptoir.`
      .replace("{SCOOTER}", rs(scooter))
      .replace("{CAR}", rs(car)),
  },
  {
    q: `Peut-on visiter l'Île aux Cocos${NB}?`,
    a: "Oui, en excursion en bateau avec un skipper local — c'est une réserve d'oiseaux posée sur le lagon, et l'une des plus belles journées de l'île. La sortie se réserve directement auprès de celui qui la propose, depuis notre page des excursions.",
  },
];

// The 5-day table. Same content as the English post's — a liftable block an
// assistant can quote whole, which prose cannot be.
const PLAN: Array<[string, string, string]> = [
  ["1", "La côte est", "Pointe Coton, puis le sentier côtier par St François jusqu'à Trou d'Argent"],
  ["2", "L'intérieur", "Les tortues de la réserve François Leguat, la Caverne Patate, le Mont Limon au couchant"],
  ["3", "Port Mathurin et le nord", "La ville, le marché si vos dates tombent bien, la côte nord sans se presser"],
  ["4", "Le lagon", "L'Île aux Cocos et ses oiseaux, ou le snorkeling sur le corail à Rivière Banane"],
  ["5", "Le sud — et nulle part", "Mourouk et la côte sud, puis une matinée sans programme"],
];

export default async function ItinerairePage() {
  const content = await getContent();
  const { fleet } = await getFleetView();
  const faq = FAQ(fleetFromPrice(fleet, "scooter"), fleetFromPrice(fleet, "car"));

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
              name: "Itinéraire à Rodrigues",
              url: `${SITE_URL}/fr/itineraire-rodrigues`,
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
              Itinéraire à Rodrigues{NB}: 3, 5 ou 7 jours
            </h1>
            {/* Answer first: the rule, then the constraint that makes it true. */}
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              L&apos;île fait environ 18 km de bout en bout, et pourtant on ne
              la « fait » pas en une journée{NB}: les routes montent et
              tournent, les plus belles plages se méritent à pied, et Rodrigues
              récompense la lenteur. Une seule règle structure ce qui suit{NB}:
              un coin de l&apos;île par jour.
            </p>
            <p className="mt-4 font-dm text-sm text-muted">
              <Link
                href="/blog/rodrigues-itinerary"
                hrefLang="en"
                className="text-yellow underline underline-offset-4 hover:opacity-80"
              >
                Read this itinerary in English
              </Link>
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          <section>
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Le plan sur 5 jours, en un tableau
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Basez-vous où vous voulez — rien n&apos;est loin. Deux journées
              dépendent du calendrier plutôt que de l&apos;envie{NB}: Port
              Mathurin est à son meilleur un jour de marché, et la journée en
              bateau dépend du lagon. Gardez ces deux-là souples, et fixez les
              journées plages et points de vue autour.
            </p>
            <div className="mt-5 overflow-x-auto rounded-lg border border-offwhite/10">
              <table className="w-full min-w-[560px] border-collapse font-dm text-sm">
                <thead>
                  <tr className="bg-offwhite/5 text-left">
                    <th className="px-3 py-2 font-semibold text-offwhite">Jour</th>
                    <th className="px-3 py-2 font-semibold text-offwhite">Où</th>
                    <th className="px-3 py-2 font-semibold text-offwhite">L&apos;essentiel</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN.map(([d, ou, quoi]) => (
                    <tr key={d} className="border-t border-offwhite/10 align-top">
                      <td className="px-3 py-2 text-muted">{d}</td>
                      <td className="px-3 py-2 text-muted">{ou}</td>
                      <td className="px-3 py-2 text-muted">{quoi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              3 jours{NB}: l&apos;essentiel
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Les jours 1 à 3 du tableau sont le voyage{NB}: la côte est,
              l&apos;intérieur, la ville. Cela fonctionne — vous aurez vu les
              sites majeurs — mais c&apos;est serré, et il faudra choisir
              plutôt que tout faire. S&apos;il faut sacrifier quelque chose,
              sacrifiez la ville avant Trou d&apos;Argent.
            </p>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Avec si peu de temps, les roues ne sont pas une option. Un
              scooter met chaque étape à portée et vous laisse suivre la
              lumière plutôt qu&apos;un horaire — réservez-le avant
              d&apos;atterrir, et le premier jour commence à la plage.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              5 jours{NB}: la version qu&apos;on conseille à un ami
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Cinq jours, c&apos;est le tableau entier, et c&apos;est
              l&apos;île au rythme pour lequel elle est faite. Ce qui
              s&apos;ajoute au long week-end, c&apos;est justement ce dont on
              reparle après{NB}: la journée sur le lagon — l&apos;Île aux
              Cocos et ses oiseaux, ou le snorkeling à Rivière Banane avec un
              skipper local — et une journée sans rien de prévu, qui a une
              façon bien à elle de devenir la meilleure.
            </p>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Mangez en prenant votre temps{NB}: la cuisine rodriguaise est une
              raison de venir à elle seule, et les plats qui comptent —
              l&apos;ourite rougaille en tête — sont sur notre page food, avec
              ceux qui les cuisinent.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              7 jours{NB}: l&apos;île à son rythme
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Une semaine, c&apos;est le plan de cinq jours plus le luxe de la
              répétition{NB}: retourner à la plage qu&apos;on a aimée, une
              deuxième matinée en mer, une vraie randonnée côtière plutôt
              qu&apos;un aperçu. Les kitesurfeurs camperont sur le lagon de
              Mourouk, les marcheurs prendront la page des itinéraires — et
              tout le monde aura droit à la chose la plus rare en vacances{NB}:
              ne rien faire, deux fois.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Quand venir, et comment se déplacer{NB}?
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              Les deux questions ont leur réponse honnête ailleurs sur ce site,
              écrite depuis les relevés officiels plutôt que depuis une
              brochure. La version courte{NB}: de septembre à décembre, la
              météo est la plus simple à planifier, et il faut louer quelque
              chose à roues — aucun bus ne va à la plage que vous êtes venu
              voir. Le détail bus-taxi-scooter-voiture est sur{" "}
              <Link
                href="/fr/se-deplacer-a-rodrigues"
                className="text-yellow underline underline-offset-4 hover:opacity-80"
              >
                Se déplacer à Rodrigues
              </Link>
              .
            </p>
          </section>

          <section className="mt-12">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Questions fréquentes
            </h2>
            <div className="mt-6 space-y-6">
              {faq.map((f) => (
                <div key={f.q}>
                  <h3 className="font-syne text-lg font-bold text-offwhite">{f.q}</h3>
                  <p className="mt-2 font-dm text-muted leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          <nav className="mt-14 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">
              À découvrir aussi
            </p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/fr/location-scooter-rodrigues", label: "Location de scooter à Rodrigues" },
                { href: "/fr/location-voiture-rodrigues", label: "Location de voiture à Rodrigues" },
                { href: "/browse/tours", label: "Île aux Cocos et sorties en mer" },
                { href: "/fr/plages-rodrigues", label: "Les plus belles plages de Rodrigues" },
                { href: "/fr/guide-rodrigues", label: "Le guide de l'île par les locaux" },
                { href: "/fr/se-deplacer-a-rodrigues", label: "Se déplacer à Rodrigues" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/90 hover:text-yellow transition-colors"
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
