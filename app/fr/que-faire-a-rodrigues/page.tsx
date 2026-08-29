import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { loc } from "@/lib/localize";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

// ── QUE FAIRE À RODRIGUES ───────────────────────────────────────────────────
//
// The French counterpart of /experiences, which is titled "Things to Do in
// Rodrigues" — so this is genuinely the same page in another language, and the
// hreflang pair is honest. It is not a second English page wearing a French
// slug, and it is not a doorway: the two describe the same thing to two
// audiences.
//
// ── IT RENDERS THE OWNER'S OWN FRENCH, NOT MINE ─────────────────────────────
// RecommendedPlace and RideRoute both carry `descriptionFr` / `nameFr` siblings
// that the admin maintains. This page reads them through loc(), so where the
// owner has written French the visitor gets the owner's words, and where they
// have not it falls back rather than going blank. Several listings are already
// French in the source — "Balade en mer", "Pêche Traditionelle" — because the
// person writing them is Rodriguan.
//
// That is also the thing an aggregator cannot copy. Anyone can write "things to
// do in Rodrigues"; nobody else can list what is actually bookable this week,
// at the price it actually costs, in the words of the person selling it.
//
// ── THE COUNTS ARE COUNTED ──────────────────────────────────────────────────
// The beach and viewpoint numbers come from the same filter those pages use, so
// this page can never promise 18 beaches to a page that shows 12. That exact
// drift is why the filter on /guide/beaches was rewritten.

const NB = " "; // narrow no-break space — French sets one before ? ! ; :

const TITLE = `Que faire à Rodrigues${NB}? Le guide des activités | Roule Rodrigues`;
const DESCRIPTION =
  "Que faire à Rodrigues : excursions en mer, plongée, pêche traditionnelle, randonnées, plages et points de vue. Les activités réservables sur place, avec les prix.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_URL}/fr/que-faire-a-rodrigues`,
    // Mirrored by the block on /experiences. A one-way hreflang is ignored.
    languages: {
      "en": `${SITE_URL}/experiences`,
      "fr": `${SITE_URL}/fr/que-faire-a-rodrigues`,
      "x-default": `${SITE_URL}/experiences`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/que-faire-a-rodrigues`,
    type: "website",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

/** Same bar as /guide/beaches: a name and a pin is not a guide entry. */
const hasWriting = (l: { story?: string; description?: string }) =>
  Boolean(l.story?.trim() || l.description?.trim());

const FAQ = (beaches: number, activities: number) => [
  {
    q: `Que faire à Rodrigues en une semaine${NB}?`,
    a: `Une semaine suffit largement pour faire le tour de l'île sans courir. Comptez une journée pour l'île aux Cocos, une ou deux pour les plages de l'est — Trou d'Argent et Graviers se rejoignent à pied par le sentier côtier — une matinée en mer, et le reste à rouler entre les points de vue. Il y a ${beaches} plages décrites sur ce site et ${activities} activités réservables directement.`,
  },
  {
    q: `Que faire à Rodrigues quand il pleut${NB}?`,
    a: "Les averses passent vite et sont rarement des journées perdues. La Caverne Patate se visite guidée et à l'abri, le marché de Port Mathurin tourne quoi qu'il arrive, et les tables d'hôte se réservent la veille. Une voiture aide ces jours-là, plus qu'un scooter.",
  },
  {
    q: `Faut-il réserver les activités à l'avance${NB}?`,
    a: "Pour l'île aux Cocos, oui : l'accès demande une autorisation et les bateaux partent quand le lagon le permet. Pour le reste, un jour ou deux d'avance suffisent en général, sauf en haute saison. Les activités listées ici se réservent directement, sans intermédiaire.",
  },
  {
    q: `Rodrigues vaut-elle le détour depuis Maurice${NB}?`,
    a: "Ce n'est pas la même île et il vaut mieux le savoir avant de partir. Pas de grands complexes hôteliers, très peu de vie nocturne, et des distances qui se font en scooter ou en voiture. En échange : un lagon deux fois plus grand que l'île, des plages où l'on est seul en semaine, et un accueil qui n'a rien d'industriel. Si vous cherchez un resort, ce n'est pas ici.",
  },
  {
    q: `Comment se déplacer pour visiter${NB}?`,
    a: "Le scooter pour deux personnes avec peu de bagages, la voiture dès qu'on est une famille ou qu'on veut la climatisation. Les distances sont courtes — l'île fait une vingtaine de kilomètres de long — mais les routes montent et descendent beaucoup, et il n'y a pas de transport en commun pensé pour les visiteurs.",
  },
];

export default async function QueFaireRodriguesPage() {
  const content = await getContent();

  // The same filter /experiences applies: a listing without a name or a photo
  // is an admin placeholder, and a hub is the wrong place to discover that.
  const activities = content.recommended.items.filter(
    (p) =>
      p.category === "activity" && p.name.trim() && (p.image || p.images?.[0]),
  );

  const beachCount = content.mapLocations.filter(
    (l) => l.category === "beach" && hasWriting(l),
  ).length;
  const viewpointCount = content.mapLocations.filter(
    (l) =>
      (l.category === "viewpoint" || l.category === "landmark") &&
      hasWriting(l),
  ).length;

  const routes = content.rideRoutes.filter((r) => r.name?.trim());
  const faq = FAQ(beachCount, activities.length);

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
              name: "Que faire à Rodrigues",
              url: `${SITE_URL}/fr/que-faire-a-rodrigues`,
            },
          ]),
          // Only the names, because that is all this page renders for each one
          // — the prices live on the listing itself and marking up what is not
          // visible here is exactly what Google's policy forbids.
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Activités à Rodrigues",
            inLanguage: "fr",
            numberOfItems: activities.length,
            itemListElement: activities.map((p, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: p.name.trim(),
            })),
          },
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
              Que faire à Rodrigues{NB}?
            </h1>
            {/* Answer first: the shape of the island, in one paragraph. */}
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Rodrigues tient dans une vingtaine de kilomètres et se visite
              entièrement en quelques jours. L&apos;essentiel se joue autour du
              lagon — deux fois plus grand que l&apos;île elle-même : sorties en
              mer, plongée, pêche, et l&apos;île aux Cocos, la réserve
              d&apos;oiseaux qui se visite en bateau avec autorisation. À terre,{" "}
              {beachCount} plages et {viewpointCount} points de vue décrits un
              par un, et des sentiers qui traversent l&apos;île d&apos;un
              versant à l&apos;autre.
            </p>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          {activities.length > 0 && (
            <section>
              <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
                Ce qui se réserve directement
              </h2>
              <p className="mt-2 font-dm text-sm text-muted">
                Les activités proposées sur Roulé Rodrigues, avec le prix
                annoncé par le prestataire.
              </p>
              <ul className="mt-6 space-y-5">
                {activities.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-dark-border bg-white/[0.02] p-5"
                  >
                    <h3 className="font-syne text-lg font-bold text-offwhite">
                      {p.name.trim()}
                    </h3>
                    {/* The owner's French where they wrote it. */}
                    <p className="mt-2 font-dm text-sm leading-relaxed text-muted">
                      {loc(
                        "fr",
                        p.description,
                        p.descriptionFr,
                        p.descriptionCr,
                      )}
                    </p>
                    {p.priceNote && (
                      <p className="mt-2 font-dm text-sm font-semibold text-yellow/90">
                        {p.priceNote}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <Link
                href="/experiences"
                className="mt-6 inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
              >
                Voir toutes les activités <ArrowRight size={14} />
              </Link>
            </section>
          )}

          <section className="mt-14">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              La mer
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              L&apos;île aux Cocos est la sortie que tout le monde fait, et la
              seule qui demande une autorisation : c&apos;est une réserve
              d&apos;oiseaux, on ne s&apos;y rend pas seul et la pointe sud est
              fermée aux visiteurs. Le reste du lagon se découvre en bateau, en
              apnée ou à la ligne, souvent le matin quand l&apos;eau est plate.
            </p>
            <Link
              href="/fr/ile-aux-cocos"
              className="mt-4 inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
            >
              Île aux Cocos : ce qu&apos;il faut savoir avant de réserver{" "}
              <ArrowRight size={14} />
            </Link>
          </section>

          <section className="mt-14">
            <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
              Les plages et les points de vue
            </h2>
            <p className="mt-3 font-dm text-muted leading-relaxed">
              {beachCount} plages décrites une par une, avec l&apos;accès et ce
              qu&apos;il faut en attendre — de celles où l&apos;on pique-nique
              le dimanche à celles qu&apos;on rejoint à pied et où l&apos;on est
              seul. Trou d&apos;Argent, la plus photographiée, se mérite : elle
              se rejoint par le sentier côtier depuis Graviers.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <Link
                href="/fr/plages-rodrigues"
                className="inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
              >
                Les plages de Rodrigues <ArrowRight size={14} />
              </Link>
              <Link
                href="/guide/viewpoints"
                className="inline-flex items-center gap-2 font-dm text-sm text-muted hover:text-offwhite transition-colors"
              >
                {viewpointCount} points de vue <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          {routes.length > 0 && (
            <section className="mt-14">
              <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
                À pied et à deux roues
              </h2>
              <p className="mt-2 font-dm text-sm text-muted">
                Les itinéraires que nous conseillons, avec les distances
                réelles.
              </p>
              <ul className="mt-5 space-y-3">
                {routes.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dark-border pb-3"
                  >
                    <span className="font-dm text-sm text-offwhite/90">
                      {loc("fr", r.name, r.nameFr, r.nameCr)}
                    </span>
                    <span className="font-dm text-xs text-muted tabular-nums">
                      {[r.distance, r.duration].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/guide/routes"
                className="mt-5 inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
              >
                Voir les itinéraires <ArrowRight size={14} />
              </Link>
            </section>
          )}

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
                </section>
              ))}
            </div>
          </section>

          <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
            <p className="font-syne text-lg font-bold text-offwhite">
              Pour organiser le séjour
            </p>
            <ul className="mt-4 space-y-3">
              {[
                // ── THE PAGE ABOUT ACTIVITIES NOW LINKS TO THE BOOKABLE
                //    ACTIVITIES (M137) ──────────────────────────────────────
                //
                // This page describes what to do on Rodrigues and linked to
                // guides, scooters and cars — but never to /experiences, where
                // the boat trips, the fishing and the massage it is describing
                // can actually be booked. The same gap the car vertical had:
                // the ranking page passed its traffic everywhere except to the
                // thing it was about.
                //
                // First in the list, because it is the only commercial
                // destination here and the reader arrived asking exactly this.
                {
                  href: "/experiences",
                  label: "Réserver une activité : bateau, pêche, massage",
                },
                {
                  href: "/fr/guide-rodrigues",
                  label: "Guide de l'île Rodrigues",
                },
                {
                  href: "/fr/se-deplacer-a-rodrigues",
                  label: "Se déplacer à Rodrigues",
                },
                {
                  href: "/fr/location-voiture-rodrigues",
                  label: "Location de voiture à Rodrigues",
                },
                {
                  href: "/fr/location-scooter-rodrigues",
                  label: "Location de scooter à Rodrigues",
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
              <li>
                <Link
                  href="/experiences"
                  className="inline-flex items-center gap-2 font-dm text-sm text-muted hover:text-offwhite transition-colors"
                >
                  Read this page in English <ArrowRight size={14} />
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </main>
    </>
  );
}
