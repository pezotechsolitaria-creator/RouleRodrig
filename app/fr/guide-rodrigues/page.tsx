import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { RODRIGUES_KNOWLEDGE } from "@/lib/rodrigues-knowledge";
import { breadcrumbLd, touristDestinationLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const revalidate = 3600;

// The French half of /guide/rodrigues. All 15 knowledge topics already had a
// `fr` answer written — real French, sitting in the codebase, that Google has
// never read because translations are applied client-side only. This gives them
// a URL and a French FAQPage, which is what feeds French AI Overviews. That
// matters: the AI Overview for "roule rodrigues" answers in French and has been
// sourcing its facts from TripAdvisor instead of us.
//
// Must cover every id in RODRIGUES_KNOWLEDGE — see the humanize() fallback on
// the English page for what happens when one is forgotten ("budget" shipped as
// a heading and as a schema question).
const TITRES: Record<string, string> = {
  getThere: "Comment se rendre à Rodrigues",
  bestTime: "Quand visiter Rodrigues",
  money: "Argent & devises",
  budget: "Quel budget prévoir pour un voyage à Rodrigues ?",
  gettingAround: "Se déplacer sur l'île",
  tortoises: "Tortues géantes — Réserve François Leguat",
  cocos: "L'Île aux Cocos, sanctuaire d'oiseaux",
  caves: "La grotte de Caverne Patate",
  trouDArgent: "La plage de Trou d'Argent",
  montLimon: "Le point de vue du Mont Limon",
  food: "Cuisine et spécialités rodriguaises",
  culture: "Culture, séga & le marché de Port Mathurin",
  activities: "Activités — snorkeling, plongée, kitesurf",
  safety: "Sécurité & voyage responsable",
  hiddenGems: "Trésors cachés",
};

function humanize(id: string): string {
  const words = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// 57 chars / 158 — measured.
const TITLE = "Guide de l'île Rodrigues par les locaux | Roule Rodrigues";
const DESCRIPTION =
  "Le guide de Rodrigues par des locaux : comment y aller, quand partir, budget, plages, tortues géantes, cuisine et sécurité. Plus la location de scooter.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "guide Rodrigues",
    "île Rodrigues",
    "comment aller à Rodrigues",
    "que faire à Rodrigues",
    "budget Rodrigues",
    "Trou d'Argent",
    "location scooter Rodrigues",
  ],
  alternates: {
    canonical: `${SITE_URL}/fr/guide-rodrigues`,
    // Mirrors the `languages` block on /guide/rodrigues. Both directions or
    // Google ignores it.
    languages: {
      "en-US": `${SITE_URL}/guide/rodrigues`,
      "fr-FR": `${SITE_URL}/fr/guide-rodrigues`,
      "x-default": `${SITE_URL}/guide/rodrigues`,
    },
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/fr/guide-rodrigues`,
    type: "article",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function GuideFrPage() {
  const content = await getContent();

  // Every answer below is rendered on the page, so FAQPage is legitimate — and
  // inLanguage: fr tells Google these are French answers to French questions.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "fr",
    mainEntity: RODRIGUES_KNOWLEDGE.map((k) => ({
      "@type": "Question",
      name: TITRES[k.id] ?? humanize(k.id),
      acceptedAnswer: { "@type": "Answer", text: k.fr },
    })),
  };

  return (
    <>
      <JsonLd
        data={[
          faqLd,
          touristDestinationLd(),
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            { name: "Guide de Rodrigues", url: `${SITE_URL}/fr/guide-rodrigues` },
          ]),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />

      {/* Scoped lang — the root layout owns <html lang>. Accessibility fix;
          Google detects language from the content itself. */}
      <main className="bg-dark min-h-screen" lang="fr">
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">GUIDE DE L&apos;ÎLE</p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              Le guide de l&apos;île Rodrigues par les locaux
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">{DESCRIPTION}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/fr/location-scooter-rodrigues"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Louer un scooter <ArrowRight size={16} />
              </Link>
              <Link
                href="/fr/plages-rodrigues"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                Les plus belles plages
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-5 py-14">
          <article className="space-y-10">
            {RODRIGUES_KNOWLEDGE.map((k) => (
              <section key={k.id} id={k.id} className="scroll-mt-24">
                <h2 className="font-syne text-xl md:text-2xl font-bold text-offwhite">
                  {TITRES[k.id] ?? humanize(k.id)}
                </h2>
                <p className="mt-3 font-dm text-muted leading-relaxed">{k.fr}</p>
                {k.place && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.place)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    Voir sur Google Maps <ArrowRight size={14} />
                  </a>
                )}
              </section>
            ))}
          </article>

          <nav className="mt-14 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">À découvrir aussi</p>
            <ul className="mt-3 space-y-2">
              {[
                { href: "/fr/location-scooter-rodrigues", label: "Location de scooter à Rodrigues" },
                { href: "/fr/plages-rodrigues", label: "Les plus belles plages de Rodrigues" },
                { href: "/guide/routes", label: "Itinéraires en scooter & randonnées" },
                { href: "/browse/car", label: "Location de voiture à Rodrigues" },
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
      <Footer social={content.social} branding={content.branding} />
    </>
  );
}
