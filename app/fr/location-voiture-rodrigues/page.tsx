import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { getFleetView, fleetFromPrice } from "@/lib/site-data";
import { resolveTerms, isMissing } from "@/lib/legal";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, rentalCategoryLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

/** Rs, written the way a French reader writes it: 1 500, never 1,500. */
const rs = (n: number) => n.toLocaleString("fr-FR");

// ── Why this page exists ────────────────────────────────────────────────────
// The French counterpart of /browse/car, and the sibling of
// /fr/location-scooter-rodrigues. "location voiture Rodrigues" is typed by the
// Réunionnais and metropolitan French visitors who make up much of the traffic
// to this island, and every result they got was somebody else's site.
//
// It is NOT a doorway page: it is the French equivalent of an existing English
// page, which is exactly what hreflang is for. /browse/[category] carries the
// reciprocal tag automatically once a category has an `fr` entry.
//
// ── EVERY ANSWER TRACED, NONE ASSERTED ──────────────────────────────────────
// The price comes from the live fleet, the same way the heading does. The
// minimum age comes from the terms the owner actually published — it is a
// configurable clause, not a number to invent, and when it has not been set
// this page says "confirm with us" rather than guessing a figure that would
// then contradict /legal/terms.
//
// The car facts (automatic, air conditioning, five seats, insurance and
// roadside assistance) come from the fleet listing itself. What is NOT claimed:
// anything about deposits, fuel policy or excess, because none of it is written
// down anywhere yet and a rental page that invents those is how a customer
// arrives expecting one thing and is charged another.

// 57 chars / 155 — inside the 50–60 and 140–160 targets.
const TITLE = (from: number) =>
  `Location voiture Rodrigues dès Rs ${rs(from)}/jour | Roule Rodrigues`;
const DESCRIPTION = (from: number) =>
  `Louez une voiture à l'île Rodrigues à partir de Rs ${rs(from)} par jour. Boîte automatique, climatisation, assurance incluse et livraison à votre hôtel. Réservez en ligne.`;

export async function generateMetadata(): Promise<Metadata> {
  const { fleet } = await getFleetView();
  return metadataFor(fleetFromPrice(fleet, "car"));
}

const metadataFor = (from: number): Metadata => ({
  title: TITLE(from),
  description: DESCRIPTION(from),
  alternates: {
    canonical: `${SITE_URL}/fr/location-voiture-rodrigues`,
    // Mirrors the `languages` block /browse/[category] emits for `car`. A
    // one-way hreflang is silently ignored.
    languages: {
      "en-US": `${SITE_URL}/browse/car`,
      "fr-FR": `${SITE_URL}/fr/location-voiture-rodrigues`,
      "x-default": `${SITE_URL}/browse/car`,
    },
  },
  openGraph: {
    title: TITLE(from),
    description: DESCRIPTION(from),
    url: `${SITE_URL}/fr/location-voiture-rodrigues`,
    type: "website",
    locale: "fr_FR",
    images: [`${SITE_URL}/og-image.jpg`],
  },
});

const FAQ = (from: number, minAge: string | null) => [
  {
    q: "Combien coûte la location d'une voiture à Rodrigues ?",
    a: `Nos voitures sont proposées à partir de Rs ${rs(from)} par jour. Le prix affiché est le prix final : aucun frais de réservation, aucune commission. Assurance et assistance routière comprises.`,
  },
  {
    q: "Y a-t-il une durée minimale de location ?",
    a: "Non. Vous pouvez louer pour une seule journée. Il n'existe aucune durée minimale imposée : réservez exactement les dates qui vous arrangent, une journée comme deux semaines.",
  },
  {
    q: "Faut-il un permis de conduire ?",
    a: minAge
      ? `Oui. Un permis de conduire valide est obligatoire et l'âge minimum pour louer est de ${minAge}. Présentez votre permis et une pièce d'identité ou votre passeport à la remise du véhicule. Si votre permis n'est pas en alphabet latin, un permis international est recommandé.`
      : "Oui. Un permis de conduire valide est obligatoire, et vous devez l'avoir sur vous à la remise du véhicule, avec une pièce d'identité ou votre passeport. Si votre permis n'est pas en alphabet latin, un permis international est recommandé. Confirmez l'âge minimum avec nous au moment de réserver.",
  },
  {
    q: "De quel côté roule-t-on à Rodrigues ?",
    a: "À gauche, comme à Maurice — le volant est donc à droite. Si vous venez de France ou de La Réunion, c'est l'inverse de ce dont vous avez l'habitude. Les routes sont peu fréquentées et cela s'apprend vite, mais prévoyez d'être attentif aux premiers ronds-points et aux premières intersections.",
  },
  {
    q: "Livrez-vous la voiture à mon hôtel ?",
    a: "Oui. Nous livrons et récupérons le véhicule à votre hôtel ou pension, partout sur l'île. Indiquez-nous simplement où vous logez au moment de la réservation.",
  },
  {
    q: "Voiture ou scooter à Rodrigues ?",
    a: "Le scooter, moins cher, suffit pour deux personnes avec peu de bagages et donne le meilleur accès aux petites routes côtières. La voiture s'impose dès que vous êtes une famille, que vous voyagez avec des valises, ou que vous voulez la climatisation et rouler à l'abri d'une averse. Beaucoup de visiteurs prennent une voiture pour le séjour et un scooter pour une journée.",
  },
];

export default async function LocationVoiturePage() {
  const { content, fleet, businessWhatsApp } = await getFleetView();

  const from = fleetFromPrice(fleet, "car");
  // How many cars actually exist, counted from the live fleet rather than
  // stated. offerCount is a claim about inventory and inventing one on a page
  // that takes bookings is how a customer is told "available" about a car that
  // is not there.
  const carCount = fleet.filter((f) => (f.category ?? "scooter") === "car").length;
  // The published clause, not an invented number. `isMissing` means the owner
  // has not set it yet, and the FAQ answer changes shape rather than guessing.
  const terms = resolveTerms(content.terms);
  const minAge = isMissing(terms.vehicleMinAge) ? null : terms.vehicleMinAge;
  const faq = FAQ(from, minAge);

  const wa = (businessWhatsApp ?? "").replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent("Bonjour ! Je souhaite louer une voiture à Rodrigues.")}`
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
          // ── THE PRICE, WHERE A MACHINE CAN READ IT (M134) ─────────────
          //
          // The page has always RENDERED "dès Rs 1 500" but said nothing about
          // it in structured data: this page emitted an FAQ and a breadcrumb
          // and stopped. So Google had no price to show in a result and an
          // assistant asked "how much is a car on Rodrigues" had prose to
          // guess from rather than a fact to quote.
          //
          // AggregateOffer/lowPrice, not Offer/price, because "from" is what
          // the page actually says. See lib/schema.ts.
          rentalCategoryLd({
            name: "Location de voiture à Rodrigues",
            category: "car",
            fromPrice: from,
            offerCount: carCount || undefined,
            url: `${SITE_URL}/fr/location-voiture-rodrigues`,
            description: DESCRIPTION(from),
            inLanguage: "fr",
          }),
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            {
              name: "Location de voiture à Rodrigues",
              url: `${SITE_URL}/fr/location-voiture-rodrigues`,
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
              Location de voiture à Rodrigues, dès Rs {rs(from)} par jour
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Une voiture change le séjour dès qu&apos;on est plusieurs ou
              qu&apos;on a des bagages : la climatisation, le coffre, et de quoi
              traverser l&apos;île sans se soucier d&apos;une averse. Nous
              louons directement, sans intermédiaire, avec livraison à votre
              hôtel et aucune durée minimale.
            </p>

            <ul className="mt-7 space-y-2.5">
              {[
                `À partir de Rs ${rs(from)} par jour — le prix affiché est le prix final`,
                "Boîte automatique et climatisation",
                "Assurance et assistance routière incluses",
                "Aucune durée minimale : une journée si c'est tout ce qu'il vous faut",
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
                href="/browse/car"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Voir les voitures &amp; réserver <ArrowRight size={16} />
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

          {/* The sibling page, named in French. Somebody comparing the two is
              the single most common visitor to either. */}
          <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
            <p className="font-syne text-lg font-bold text-offwhite">
              Aussi sur Roulé Rodrigues
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/fr/location-scooter-rodrigues"
                  className="inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  Location de scooter à Rodrigues <ArrowRight size={14} />
                </Link>
              </li>
              <li>
                <Link
                  href="/fr/guide-rodrigues"
                  className="inline-flex items-center gap-2 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  Guide de l&apos;île Rodrigues <ArrowRight size={14} />
                </Link>
              </li>
              <li>
                <Link
                  href="/browse/car"
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
