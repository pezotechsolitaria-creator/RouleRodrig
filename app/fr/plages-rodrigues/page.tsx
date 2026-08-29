import type { Metadata } from "next";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, itemListLd, placeLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PlaceGuide from "@/components/PlaceGuide";
import PageLanguage from "@/components/PageLanguage";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const revalidate = 3600;

// The French half of /guide/beaches. Not a translation afterthought: every one
// of these beaches already has descriptionFr + storyFr in the database — real
// French writing the owner paid for, that Google has never been able to read
// because the site applies translations client-side only.
//
// hreflang pairs it with the English page. Both must point at each other or
// Google ignores the annotation entirely.
const DESCRIPTION =
  "Toutes les plages de Rodrigues qui valent le détour, repérées par des locaux : Pointe Coton, Baladirou, St François. Photos réelles, accès et conseils honnêtes.";

// ── WHICH BEACHES THIS PAGE CAN HONESTLY SHOW ─────────────────────────
//
// This used to filter on `story` — the ENGLISH field — on a page written in
// French. It gave the right answer today only by coincidence: the twelve
// beaches with an English story happen to be the twelve with a French one.
// The day the owner writes a French description for a beach that has no
// English story, the beach would stay invisible here and nothing would say why.
//
// So the test is what this page actually needs: prose IT can render. The
// English twin at /guide/beaches asks the same question of its own fields.
//
// This deliberately does NOT fall back to the English text. Six beaches
// (Anse Raffin, Gravier Second, Île Michel, Mourouk First, Mourouk Second and
// Sandy Patate Bay) are on the English page and have no French writing at all;
// listing them here would put English paragraphs on a French page, which is
// worse for a reader and worse for the hreflang pair than a shorter list.
// They appear the moment the owner fills in a French description in admin.
const hasFrenchWriting = (l: { storyFr?: string; descriptionFr?: string }) =>
  Boolean(l.storyFr?.trim() || l.descriptionFr?.trim());

const beaches = (
  locations: { category: string; storyFr?: string; descriptionFr?: string }[],
) => locations.filter((l) => l.category === "beach" && hasFrenchWriting(l));

// ── THE QUESTIONS THIS PAGE WAS THE ONLY ONE NOT ANSWERING (M156) ───────────
//
// Seven of the eight French pages carry a FAQPage. This one — the richest page
// on the site at 8,817 characters and twelve Beach entities — did not, so the
// one page best placed to be quoted for "quelle plage a Rodrigues" had nothing
// quotable in it.
//
// Every answer is lifted from the beaches' own storyFr, which the owner wrote:
// Pointe Coton is "la carte postale de Rodrigues" and the trailhead for Trou
// d'Argent; Saint-Francois opens on "l'un des plus beaux lagons de l'ocean
// Indien"; Baladirou warns about "les courants a maree basse". Nothing here is
// invented, and nothing names a beach the page does not list.
//
// Trou d'Argent gets its own question deliberately. It is a real search — it
// appears in Search Console reaching the ENGLISH /guide/beaches at position 40
// — and it is not a listed beach here, because you reach it on foot. Both
// trailheads are named in the stories, so the page can answer it honestly
// instead of staying silent on the thing people ask.
const FAQ = (n: number) => [
  {
    q: "Quelle est la plus belle plage de Rodrigues ?",
    a: "Cela dépend de ce que vous cherchez. Pointe Coton est la carte postale de l'île : un long ruban de sable blanc bordé de cocotiers et de filaos. Saint-François s'ouvre sur l'un des plus beaux lagons de l'océan Indien, avec un récif intact. Les deux sont sur la côte est, et ce guide en recense " + n + " au total.",
  },
  {
    q: "Comment aller à Trou d'Argent ?",
    a: "À pied, et seulement à pied : aucune route n'y descend. Le sentier des falaises part de Pointe Coton, et le sentier côtier depuis Saint-François y mène en passant par Anse Bouteille. Prévoyez de l'eau, de bonnes chaussures et de partir tôt — il n'y a aucun commerce sur le chemin.",
  },
  {
    q: "Peut-on se baigner sur toutes les plages de Rodrigues ?",
    a: "Non. Le lagon est calme sur une grande partie de la côte, mais à Baladirou la baignade est agréable et les courants se réveillent à marée basse, et la Pointe du Diable est le côté sauvage et venteux de l'île — roche brute et lagon ouvert, à regarder plutôt qu'à nager. Chaque fiche de ce guide dit ce qui vous attend vraiment.",
  },
  {
    q: "Quelle plage choisir pour le snorkeling à Rodrigues ?",
    a: "Saint-François, pour son récif intact et son eau turquoise, et l'Anse aux Anglais, une plage de village à 2 km de Port Mathurin où l'on nage entre les petits bateaux. Le lagon de Rodrigues fait deux fois la taille de l'île, et il est vivant.",
  },
  {
    q: "Où faire du kitesurf à Rodrigues ?",
    a: "À Pointe Coton, sur la côte est : le vent y est régulier et de classe mondiale, tandis que le lagon reste assez abrité pour se baigner ou pique-niquer juste à côté.",
  },
  {
    q: "Comment se rendre aux plages de Rodrigues ?",
    a: "En scooter, en voiture ou en taxi : il n'y a pas de transport en commun fréquent sur l'île et les plages sont dispersées sur toute la côte. Un scooter suffit pour la plupart, et se loue livré à votre logement.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const n = beaches(content.mapLocations).length;
  // Count comes from live content, so it can never drift when the owner adds a
  // beach in admin.
  const title = `Les ${n} plus belles plages de Rodrigues | Roule Rodrigues`;
  return {
    title,
    description: DESCRIPTION,
    alternates: {
      canonical: `${SITE_URL}/fr/plages-rodrigues`,
      languages: {
        "en": `${SITE_URL}/guide/beaches`,
        "fr": `${SITE_URL}/fr/plages-rodrigues`,
        "x-default": `${SITE_URL}/guide/beaches`,
      },
    },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `${SITE_URL}/fr/plages-rodrigues`,
      type: "article",
      locale: "fr_FR",
      images: [`${SITE_URL}/og-image.jpg`],
    },
  };
}

export default async function PlagesPage() {
  const content = await getContent();
  const places = beaches(content.mapLocations) as typeof content.mapLocations;

  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT,
          not the reader's preference. See components/PageLanguage.tsx. */}
      <PageLanguage lang="fr" />
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            {
              name: "Plages de Rodrigues",
              url: `${SITE_URL}/fr/plages-rodrigues`,
            },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: "fr",
            mainEntity: FAQ(places.length).map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          },
          itemListLd(
            "Plages de l'île Rodrigues",
            places.map((p) => ({ name: p.name.trim() })),
          ),
          ...places.map((p) =>
            placeLd({
              name: p.name.trim(),
              description: p.descriptionFr || p.description,
              category: p.category,
              lat: p.lat,
              lng: p.lng,
              image: p.image,
            }),
          ),
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
      <PlaceGuide
        guideHref="/fr/plages-rodrigues"
        lang="fr"
        eyebrow="GUIDE DE L'ÎLE"
        title={`Les ${places.length} plus belles plages de Rodrigues`}
        intro="Rodrigues possède un lagon deux fois plus grand que l'île elle-même, et ses plages vont des sables animés du dimanche aux criques où vous serez seul au monde. Voici toutes celles que nous recommandons, avec l'accès et ce qui vous attend vraiment."
        places={places}
        labels={{
          rent: "Louer un scooter pour y aller",
          guide: "Guide complet de l'île",
          directions: "Itinéraire",
          keepExploring: "À découvrir aussi",
        }}
        related={[
          {
            href: "/fr/location-scooter-rodrigues",
            label: "Location de scooter à Rodrigues",
          },
          {
            href: "/guide/viewpoints",
            label: "Points de vue & sites remarquables",
          },
          {
            href: "/guide/routes",
            label: "Itinéraires en scooter & randonnées",
          },
          {
            href: "/fr/hebergement-rodrigues",
            label: "Où dormir à Rodrigues",
          },
          {
            href: "/fr/que-faire-a-rodrigues",
            label: "Que faire à Rodrigues",
          },
        ]}
      />

      {/* Visible, because Google requires the answers to be readable on the
          page carrying the FAQPage markup — and from the SAME array, so the
          two can never disagree. */}
      <section className="bg-dark px-5 pb-16" lang="fr">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">
            Questions fréquentes sur les plages de Rodrigues
          </h2>
          <div className="mt-6 space-y-7">
            {FAQ(places.length).map((f) => (
              <article key={f.q}>
                <h3 className="font-syne text-lg font-bold text-offwhite">
                  {f.q}
                </h3>
                <p className="mt-2 font-dm text-muted leading-relaxed">{f.a}</p>
              </article>
            ))}
          </div>
          <Link
            href="/fr/taxi-rodrigues"
            className="mt-10 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
          >
            Taxi et transfert depuis l&apos;aéroport <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}
