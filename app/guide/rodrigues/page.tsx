import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, MessageCircle } from "lucide-react";
import { getContent } from "@/lib/content";
import { SITE_URL } from "@/lib/site";
import { RODRIGUES_KNOWLEDGE } from "@/lib/rodrigues-knowledge";
import { breadcrumbLd, touristDestinationLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Static-ish content page: refresh hourly (nav/footer come from the CMS).
export const revalidate = 3600;

// Human-readable section titles for the knowledge entries (English, for SEO).
const TITLES: Record<string, string> = {
  getThere: "How to get to Rodrigues",
  bestTime: "Best time to visit Rodrigues",
  money: "Money & currency",
  gettingAround: "Getting around the island",
  tortoises: "Giant tortoises — François Leguat Reserve",
  cocos: "Île aux Cocos bird sanctuary",
  caves: "Caverne Patate cave",
  trouDArgent: "Trou d'Argent beach",
  montLimon: "Mont Limon viewpoint",
  food: "Rodriguan food & specialities",
  culture: "Culture, séga & the Port Mathurin market",
  activities: "Activities — snorkelling, diving, kitesurfing",
  safety: "Safety & responsible travel",
  hiddenGems: "Hidden gems",
};

const DESCRIPTION =
  "A local's guide to Rodrigues Island: how to get there, the best time to visit, beaches, viewpoints, giant tortoises, food, culture and safety — plus scooter & car rental and a free AI island guide.";

export const metadata: Metadata = {
  title: "Rodrigues Island travel guide — beaches, tortoises, ferry & tips | Roule Rodrigues",
  description: DESCRIPTION,
  keywords: [
    "Rodrigues Island", "Rodrigues travel guide", "how to get to Rodrigues", "Rodrigues best time to visit",
    "Trou d'Argent", "François Leguat tortoises", "Île aux Cocos", "Caverne Patate", "Mont Limon",
    "Rodrigues beaches", "Rodrigues scooter rental",
  ],
  alternates: { canonical: `${SITE_URL}/guide/rodrigues` },
  openGraph: {
    title: "Rodrigues Island travel guide | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/guide/rodrigues`,
    type: "article",
    images: [`${SITE_URL}/og-image.jpg`],
  },
};

export default async function RodriguesGuidePage() {
  const content = await getContent();

  // Every Q&A below is rendered on the page, so FAQPage markup is legitimate
  // here — this is what feeds Google's "People also ask" and AI answers.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: RODRIGUES_KNOWLEDGE.map((k) => ({
      "@type": "Question",
      name: TITLES[k.id] ?? k.id,
      acceptedAnswer: { "@type": "Answer", text: k.en },
    })),
  };

  return (
    <>
      <JsonLd
        data={[
          faqLd,
          touristDestinationLd(),
          breadcrumbLd([
            { name: "Home", url: SITE_URL },
            { name: "Rodrigues Island guide", url: `${SITE_URL}/guide/rodrigues` },
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
      <main className="bg-dark min-h-screen">
        {/* Hero */}
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">ISLAND GUIDE</p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              The local&apos;s guide to Rodrigues Island
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">{DESCRIPTION}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/#explore"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Rent a scooter or car <ArrowRight size={16} />
              </Link>
              <Link
                href="/#trip-planner"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
              >
                Plan my trip <Compass size={16} />
              </Link>
            </div>
          </div>
        </header>

        {/* Knowledge sections */}
        <div className="mx-auto max-w-3xl px-5 py-14">
          <article className="space-y-10">
            {RODRIGUES_KNOWLEDGE.map((k) => (
              <section key={k.id} id={k.id} className="scroll-mt-24">
                <h2 className="font-syne text-xl md:text-2xl font-bold text-offwhite">{TITLES[k.id] ?? k.id}</h2>
                <p className="mt-3 font-dm text-muted leading-relaxed">{k.en}</p>
                {k.place && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(k.place)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    See it on Google Maps <ArrowRight size={14} />
                  </a>
                )}
              </section>
            ))}
          </article>

          {/* Closing CTA — Ti Roulé */}
          <div className="mt-14 rounded-3xl border border-yellow/20 bg-gradient-to-br from-yellow/[0.08] to-transparent p-8 text-center">
            <MessageCircle size={28} className="mx-auto text-yellow" />
            <p className="mt-4 font-syne text-xl font-bold text-offwhite">Still have a question?</p>
            <p className="mt-2 font-dm text-muted text-sm max-w-md mx-auto">
              Ask Ti Roulé, our free island guide — he&apos;ll help you plan, find food, and discover
              hidden beaches, in English, French or Creole.
            </p>
            <Link
              href="/#explore"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
            >
              Start exploring <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </main>
      <Footer social={content.social} branding={content.branding} />
    </>
  );
}
