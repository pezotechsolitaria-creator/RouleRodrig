import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Compass } from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { FR_PAGES } from "@/lib/nav/hubs";

export const revalidate = 3600;

// ── /fr WAS A 404, AND THAT COST MORE THAN THE OTHERS ───────────────────────
//
// Eleven French pages live under this path and the parent returned the
// not-found screen. A French blogger or forum post linking "roulerodrig.com/fr"
// — the obvious short form — sent every reader to a dead end.
//
// It also matters more than a missing index usually would. These eleven are the
// best-performing writing on this site and they were an ISLAND: reachable only
// one at a time from whichever English page happened to link one, and four of
// them had never been crawled at all. The problem was the link graph, not the
// content. A redirect would have cleared the 404 and left that untouched; this
// page links all eleven from one crawlable place.
//
// Written in French throughout, because a French visitor arriving at /fr and
// being greeted in English has been told something about how much the French
// half of this site is looked after.

const DESCRIPTION =
  "Tous nos guides sur Rodrigues en français : plages, activités, itinéraires, hébergement, taxi et location de scooter ou de voiture — écrits par des gens qui vivent sur l'île.";

export const metadata: Metadata = {
  title: "Rodrigues en français — guides, plages, activités & transport | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/fr` },
  openGraph: {
    title: "Rodrigues en français | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/fr`,
    locale: "fr_FR",
  },
};

export default async function FrHubPage() {
  const content = await getContent();

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Roule Rodrigues", url: SITE_URL },
            { name: "Français", url: `${SITE_URL}/fr` },
          ]),
          itemListLd(
            "Guides Rodrigues en français",
            FR_PAGES.map((p) => ({ name: p.title, url: `${SITE_URL}${p.href}` })),
          ),
        ]}
      />
      <Navbar
        branding={content.branding}
        announcementActive={false}
        showStayEatDo={content.recommended.enabled && content.recommended.items.length > 0}
        showRoutes={content.rideRoutes.length > 0}
        showEvents={content.events.some((e) => e.title)}
      />
      <main className="min-h-screen bg-dark text-offwhite">
        <div className="mx-auto max-w-3xl px-6 pb-24 pt-28 md:pt-32">
          <BackLink
            fallback="/"
            iconSize={15}
            className="inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Retour
          </BackLink>

          <p className="mt-6 font-bebas text-[11px] tracking-[0.3em] text-yellow">EN FRANÇAIS</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold uppercase leading-[0.95] sm:text-4xl">
            Rodrigues, par les locaux
          </h1>
          <p className="mt-3 max-w-xl font-dm text-sm leading-relaxed text-muted">
            Onze guides en français : où se baigner, quoi faire, comment se déplacer et combien ça
            coûte vraiment — écrits par des gens qui vivent ici.
          </p>

          <ul className="mt-8 space-y-2.5">
            {FR_PAGES.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/40"
                >
                  <Compass size={17} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-sm font-bold text-offwhite">{p.title}</span>
                    <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                      {p.blurb}
                    </span>
                  </span>
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
