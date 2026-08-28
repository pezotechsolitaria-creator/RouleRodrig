import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { getFleetView, fleetFromPrice } from "@/lib/site-data";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

/** Rs, written the way a French reader writes it: 1 500, never 1,500. */
const rs = (n: number) => n.toLocaleString("fr-FR");

// ── Why this page exists ────────────────────────────────────────────────────
// Rodrigues searches in French. "location scooter Rodrigues" returns French
// sites (ecolidays, 2000tours, petitfute) — and we were invisible to all of it,
// because every page of this site server-renders <html lang="en"> with the
// FR/CR translations applied client-side only. Google never sees a French word,
// so it answered a French query about us using TripAdvisor's numbers instead.
//
// This is the first genuinely server-rendered French page: real French in the
// HTML, hreflang pairing it with the English /browse/scooter, and FAQPage
// schema in French so Google has OUR answers on price and duration.
//
// It is NOT a doorway page: it's the French equivalent of an existing English
// page, which is exactly what hreflang is for. Spinning up
// /cheap-scooter-rental-rodrigues, /burgman-rental-rodrigues etc. in the same
// language WOULD be doorway pages, and Google penalises those.

// 60 chars / 156 chars — inside the 50–60 and 140–160 targets. Measured, not
// eyeballed: the first draft was 65/161 and would have been truncated.
// Was "dès Rs 599/jour" while line 88 computed the real minimum and rendered
// Rs 699 in the <h1> — one document contradicting itself. generateMetadata()
// below derives it from the same fleet the page already reads.
const TITLE = (from: number) =>
  `Location Scooter Rodrigues dès Rs ${from}/jour | Roule Rodrigues`;
const DESCRIPTION = (from: number) =>
  `Louez un scooter à l’île Rodrigues à partir de Rs ${from} par jour. Casque et assurance inclus, livraison à votre hôtel, sans durée minimale. Réservez en ligne.`;

// Async, because the price in the title has to come from the same fleet the
// page renders. A static `metadata` object cannot read it, which is exactly how
// the two drifted apart in the first place.
export async function generateMetadata(): Promise<Metadata> {
  const { fleet } = await getFleetView();
  const from = fleetFromPrice(fleet, "scooter");
  return metadataFor(from);
}

const metadataFor = (from: number): Metadata => ({
  title: TITLE(from),
  description: DESCRIPTION(from),
  alternates: {
    canonical: `${SITE_URL}/fr/location-scooter-rodrigues`,
    // Tells Google these two URLs are the same page in two languages, so they
    // reinforce each other instead of competing.
    languages: {
      "en-US": `${SITE_URL}/browse/scooter`,
      "fr-FR": `${SITE_URL}/fr/location-scooter-rodrigues`,
      "x-default": `${SITE_URL}/browse/scooter`,
    },
  },
  openGraph: {
    title: TITLE(from),
    description: DESCRIPTION(from),
    url: `${SITE_URL}/fr/location-scooter-rodrigues`,
    type: "website",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
});

// Every answer here is traced to real data or real code — never asserted.
// Price: the live fleet. "Sans durée minimale": no minimum-day logic exists
// anywhere, and the booking form explicitly supports a 1-day rental.
// ── THE QUESTION THE LAST ANSWER CREATES (M136) ────────────────────────────
//
// This page works — roughly ten customers — and the rule has been not to touch
// its formula. This is not a rewrite: it is the answer to the question the
// existing FAQ leaves hanging.
//
// The last answer ends "nos scooters 125cc accueillent confortablement deux
// personnes". A family of four reads that and their next thought is "so not
// us". Until now the page had nothing to say to them except a link fifth in a
// list at the very bottom, below the fold, after everything else.
//
// So the car price is passed in and the answer is honest: a scooter carries
// two, here is what a car costs, here is where to look. That serves the reader
// first — and it puts a contextual link from the page that ranks to the page
// that does not, in the place where the need actually arises rather than in a
// footer nobody scrolls to.
//
// It is also the shape an assistant quotes when asked "is a scooter enough for
// a family in Rodrigues?" — a real question, answered with a real price.
const FAQ = (from: number, carFrom: number) => [
  {
    q: "Combien coûte la location d'un scooter à Rodrigues ?",
    a: `Nos scooters sont proposés à partir de Rs ${rs(from)} par jour, avec un casque pour chaque passager et l'assurance au tiers inclus. Le prix affiché est le prix final : aucun frais de réservation, aucune commission.`,
  },
  {
    q: "Y a-t-il une durée minimale de location ?",
    a: "Non. Vous pouvez louer pour une seule journée si cela vous suffit. Il n'y a pas de minimum de trois jours ni de durée imposée : réservez exactement les dates qui vous arrangent.",
  },
  {
    q: "Faut-il un permis de conduire ?",
    a: "Oui. Un permis valide correspondant au véhicule est obligatoire, et vous devez avoir au moins 18 ans. Présentez votre permis et une pièce d'identité ou votre passeport lors de la remise du scooter.",
  },
  {
    q: "Livrez-vous le scooter à mon hôtel ?",
    a: "Oui. Nous livrons et récupérons le scooter à votre hôtel ou pension, partout sur l'île. Dites-nous simplement où vous logez au moment de la réservation.",
  },
  {
    q: "Le casque est-il fourni ?",
    a: "Oui, gratuitement. Un casque est inclus pour chaque conducteur, ainsi qu'un second casque pour le passager. Nos scooters 125cc accueillent confortablement deux personnes.",
  },
  {
    q: "Nous sommes plus de deux, ou nous voyageons avec des enfants — le scooter convient-il ?",
    a: `Un scooter 125cc transporte deux personnes, casques compris. À trois ou plus, avec de jeunes enfants, ou avec des valises à récupérer à l'aéroport de Plaine Corail, prenez une voiture : nos voitures sont proposées à partir de Rs ${rs(carFrom)} par jour, boîte automatique et climatisation, livrées à votre hôtel comme les scooters. Beaucoup de familles louent les deux : une voiture pour arriver et repartir, un scooter pour faire le tour de l'île.`,
  },
];

export default async function LocationScooterPage() {
  const { content, fleet, businessWhatsApp } = await getFleetView();

  const from = fleetFromPrice(fleet, "scooter");
  // Read from the same live fleet as the scooter price. A car price typed by
  // hand here would drift from /fr/location-voiture-rodrigues the first time
  // the owner changed it, and the two pages would advertise different numbers.
  const carFrom = fleetFromPrice(fleet, "car");
  const faq = FAQ(from, carFrom);

  const wa = (businessWhatsApp ?? "").replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent("Bonjour ! Je souhaite louer un scooter à Rodrigues.")}`
    : "/#contact";

  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT,
          not the reader's preference. See components/PageLanguage.tsx. */}
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
              name: "Location de scooter à Rodrigues",
              url: `${SITE_URL}/fr/location-scooter-rodrigues`,
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

      {/* lang="fr" belongs on <html>, but the root layout owns that and a page
          can't override it without splitting every route into route groups —
          not worth that churn for one page. Scoping it here is valid HTML and
          fixes the real victim: screen readers, which would otherwise read this
          French copy with English pronunciation. Google doesn't care either way
          (it detects language from the content itself and ignores lang=), so
          this is an accessibility fix, not an SEO one. Revisit in the full i18n
          pass, where <html lang> should follow the route. */}
      <main className="bg-dark min-h-screen" lang="fr">
        <header className="border-b border-dark-border bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <p className="font-bebas text-yellow text-xs tracking-[0.3em]">
              ÎLE RODRIGUES
            </p>
            <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
              Location de scooter à Rodrigues, dès Rs {rs(from)} par jour
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Rodrigues se découvre en scooter : peu de circulation, de bonnes
              routes et des paysages à couper le souffle. Nous louons nos
              scooters directement, sans intermédiaire — casque et assurance
              inclus, livraison à votre hôtel, et aucune durée minimale.
            </p>

            <ul className="mt-7 space-y-2.5">
              {[
                `À partir de Rs ${rs(from)} par jour — le prix affiché est le prix final`,
                "Aucune durée minimale : louez pour une seule journée si vous voulez",
                "Casque inclus pour chaque passager + assurance au tiers",
                "Livraison et récupération à votre hôtel, partout sur l'île",
                "Assistance en français, anglais et créole",
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
                href="/browse/scooter"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Voir les scooters &amp; réserver <ArrowRight size={16} />
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
            {faq.map((f) => (
              <section key={f.q}>
                <h3 className="font-syne text-lg font-bold text-offwhite">
                  {f.q}
                </h3>
                <p className="mt-2 font-dm text-muted leading-relaxed">{f.a}</p>
              </section>
            ))}
          </div>

          <nav className="mt-14 border-t border-dark-border pt-8">
            <p className="font-syne text-sm font-bold text-offwhite">
              À découvrir aussi
            </p>
            <ul className="mt-3 space-y-2">
              {[
                {
                  href: "/browse/scooter",
                  label: "Nos scooters et disponibilités",
                },
                // Was /browse/car: a French label pointing at the English
                // page, from before the French one existed.
                {
                  href: "/fr/location-voiture-rodrigues",
                  label: "Location de voiture à Rodrigues",
                },
                {
                  href: "/fr/hebergement-rodrigues",
                  label: "Où dormir à Rodrigues",
                },
                {
                  href: "/fr/que-faire-a-rodrigues",
                  label: "Que faire à Rodrigues",
                },
                {
                  href: "/guide/beaches",
                  label: "Les plus belles plages de Rodrigues",
                },
                {
                  href: "/guide/rodrigues",
                  label: "Le guide de Rodrigues par les locaux",
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
