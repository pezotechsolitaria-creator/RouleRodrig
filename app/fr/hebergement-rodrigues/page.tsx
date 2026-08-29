import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle } from "lucide-react";
import { getFleetView } from "@/lib/site-data";
import { fromPriceOf } from "@/lib/experiences";
import { SITE_URL } from "@/lib/site";
import { breadcrumbLd, stayLd } from "@/lib/schema";
import JsonLd from "@/components/JsonLd";
import Navbar from "@/components/Navbar";
import PageLanguage from "@/components/PageLanguage";

export const revalidate = 3600;

/** Rs, written the way a French reader writes it: 1 000, never 1,000. */
const rs = (n: number) => n.toLocaleString("fr-FR");

// ── Why this page exists ────────────────────────────────────────────────────
//
// The French counterpart of /browse/stays, and the third sibling of
// /fr/location-scooter-rodrigues and /fr/location-voiture-rodrigues. Those two
// are the only pages on this site that produce customers, and the thing they
// have in common is that they are hand-written French — server-rendered, not a
// client-side translation of a shared template.
//
// "hébergement Rodrigues" and "où dormir à Rodrigues" are typed by the same
// Réunionnais and metropolitan French visitors who make up much of the traffic
// to this island. /browse/stays answered them in English.
//
// It is NOT a doorway page: it is the French equivalent of an existing English
// page, paired by hreflang in both directions, which is exactly what hreflang
// is for. What would be a doorway is /pas-cher-hebergement-rodrigues and
// /villa-rodrigues-luxe splitting the same content across near-duplicates.
//
// ── EVERY NUMBER TRACED, NONE ASSERTED ──────────────────────────────────────
//
// The price and the property count come from the live listings, so this page
// cannot advertise a rate the booking does not honour. What is deliberately NOT
// claimed: breakfast, wifi, pools, air conditioning, capacity, star ratings or
// distances to a beach. None of it is written down anywhere, and an
// accommodation page that invents amenities is how a guest arrives expecting a
// pool. If the owner adds those fields, they belong here — until then the page
// says what it knows.

const TITLE = (from: number) =>
  `Hébergement à Rodrigues dès Rs ${rs(from)}/nuit | Roule Rodrigues`;

const DESCRIPTION = (from: number) =>
  `Où dormir à l'île Rodrigues : pensions, villas et maisons d'hôtes dès Rs ${rs(from)} la nuit. Réservation directe avec le propriétaire, sans frais de réservation.`;

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getFleetView();
  const stays = content.recommended.items.filter((p) => p.category === "hotel");
  const from = fromPriceOf(stays) ?? 0;
  return metadataFor(from);
}

const metadataFor = (from: number): Metadata => ({
  title: from ? TITLE(from) : "Hébergement à Rodrigues | Roule Rodrigues",
  description: from
    ? DESCRIPTION(from)
    : "Où dormir à l'île Rodrigues : pensions, villas et maisons d'hôtes choisies sur place. Réservation directe avec le propriétaire, sans frais de réservation.",
  alternates: {
    canonical: `${SITE_URL}/fr/hebergement-rodrigues`,
    // Mirrors the `languages` block /browse/[category] emits for `stays`.
    // A one-way hreflang is silently ignored.
    languages: {
      "en": `${SITE_URL}/browse/stays`,
      "fr": `${SITE_URL}/fr/hebergement-rodrigues`,
      "x-default": `${SITE_URL}/browse/stays`,
    },
  },
  openGraph: {
    title: from ? TITLE(from) : "Hébergement à Rodrigues | Roule Rodrigues",
    description: from ? DESCRIPTION(from) : undefined,
    url: `${SITE_URL}/fr/hebergement-rodrigues`,
    type: "website",
    locale: "fr_FR",
  },
});

// Five questions somebody actually has before booking a room on an island they
// have never been to. Every answer restates its own subject and ends on a
// concrete fact, so it still reads as a complete thought when an assistant
// lifts it out of the page with no context around it.
const FAQ = (from: number, count: number) => [
  {
    q: "Combien coûte un hébergement à Rodrigues ?",
    a: `Nos hébergements commencent à Rs ${rs(from)} la nuit. Le prix affiché est celui du propriétaire : nous ne prenons aucune commission et n'ajoutons aucun frais de réservation.`,
  },
  {
    q: "Paie-t-on avant que la réservation soit confirmée ?",
    a: "Non. Vous envoyez une demande, nous vérifions les dates avec le propriétaire, et vous ne réglez qu'une fois la disponibilité confirmée. Si le logement n'est pas libre à vos dates, nous vous le disons tout de suite et nous vous proposons autre chose — vous n'êtes jamais débité pour un hébergement que nous ne pouvons pas fournir.",
  },
  {
    q: "Quels types de logement proposez-vous à Rodrigues ?",
    a: `Nous proposons actuellement ${count} ${count > 1 ? "hébergements" : "hébergement"} : des pensions et des villas tenues par des Rodriguais, pas des chaînes hôtelières. Chaque annonce indique le prix et les photos réelles du logement avant que vous réserviez.`,
  },
  {
    q: "Faut-il réserver longtemps à l'avance ?",
    a: "Rodrigues est une petite île et le nombre de logements y est limité : en haute saison, et autour des fêtes, les meilleures adresses partent plusieurs semaines à l'avance. Hors saison, quelques jours suffisent souvent. Dans les deux cas nous confirmons avec le propriétaire avant de vous demander quoi que ce soit.",
  },
  {
    q: "Comment se déplacer depuis son hébergement à Rodrigues ?",
    a: "Il n'y a pas de transport en commun fréquent sur l'île, et les logements sont dispersés : prévoyez un véhicule. Nous louons des scooters et des voitures livrés directement à votre hébergement, et nous assurons aussi les transferts depuis l'aéroport de Plaine Corail.",
  },
];

export default async function HebergementRodriguesPage() {
  const { content, businessWhatsApp } = await getFleetView();
  const stays = content.recommended.items.filter((p) => p.category === "hotel");
  const from = fromPriceOf(stays);

  const wa = (businessWhatsApp ?? "").replace(/\D/g, "");
  const waHref = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        "Bonjour ! Je cherche un hébergement à Rodrigues.",
      )}`
    : "/#contact";

  // No listings, or none priced: the page still exists and still answers the
  // question, but it stops short of advertising a rate it cannot support.
  const faq = from ? FAQ(from, stays.length) : [];

  return (
    <>
      {/* This page is written in French; `lang` describes its CONTENT, not the
          reader's preference. See components/PageLanguage.tsx. */}
      <PageLanguage lang="fr" />
      <JsonLd
        data={[
          ...(faq.length
            ? [
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
              ]
            : []),
          // Each property, priced, so a result can carry a nightly rate and an
          // assistant asked "where can I stay on Rodrigues" has something to
          // quote rather than prose to guess from.
          ...stays.map((s) =>
            stayLd({
              name: s.name,
              price: typeof s.depositAmount === "number" ? s.depositAmount : null,
              description: s.description || undefined,
              image: s.image
                ? s.image.startsWith("http")
                  ? s.image
                  : `${SITE_URL}${s.image}`
                : undefined,
              url: `${SITE_URL}/fr/hebergement-rodrigues`,
            }),
          ),
          breadcrumbLd([
            { name: "Accueil", url: SITE_URL },
            {
              name: "Hébergement à Rodrigues",
              url: `${SITE_URL}/fr/hebergement-rodrigues`,
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
              {from
                ? `Où dormir à Rodrigues, dès Rs ${rs(from)} la nuit`
                : "Où dormir à Rodrigues"}
            </h1>
            <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">
              Rodrigues n&apos;est pas Maurice : peu de grands hôtels, beaucoup
              de pensions et de villas tenues par des familles rodriguaises.
              Nous les connaissons, nous vérifions les dates avec le
              propriétaire, et vous réservez en direct — sans commission et sans
              frais de dossier.
            </p>

            <ul className="mt-7 space-y-2.5">
              {[
                from
                  ? `À partir de Rs ${rs(from)} la nuit — le prix du propriétaire, sans commission`
                  : "Le prix du propriétaire, sans commission",
                "Aucun frais de réservation ajouté",
                "Disponibilité confirmée avec le propriétaire avant tout paiement",
                "Des pensions et villas tenues par des Rodriguais, pas des chaînes",
                "Scooter, voiture ou transfert depuis l'aéroport organisés avec le séjour",
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
                href="/browse/stays"
                className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
              >
                Voir les hébergements &amp; réserver <ArrowRight size={16} />
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

        {faq.length > 0 && (
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
                  <p className="mt-2 font-dm text-muted leading-relaxed">
                    {f.a}
                  </p>
                </section>
              ))}
            </div>

            {/* Somebody booking a room needs a way to get to it, and the two
                pages that already convert are the answer. This is the same
                contextual link the scooter page now carries to cars — placed
                where the need arises, not in a footer nobody scrolls to. */}
            <nav className="mt-14 rounded-3xl border border-dark-border bg-white/[0.02] p-8">
              <p className="font-syne text-lg font-bold text-offwhite">
                Aussi sur Roulé Rodrigues
              </p>
              <ul className="mt-4 space-y-2.5">
                {[
                  {
                    href: "/fr/location-voiture-rodrigues",
                    label: "Location de voiture à Rodrigues",
                  },
                  {
                    href: "/fr/location-scooter-rodrigues",
                    label: "Location de scooter à Rodrigues",
                  },
                  {
                    href: "/fr/que-faire-a-rodrigues",
                    label: "Que faire à Rodrigues",
                  },
                  {
                    href: "/fr/plages-rodrigues",
                    label: "Les plus belles plages de Rodrigues",
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
        )}
      </main>
    </>
  );
}
