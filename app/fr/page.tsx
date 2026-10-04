import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Compass } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageLanguage from "@/components/PageLanguage";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { FR_PAGES } from "@/lib/nav/hubs";
import { hubTitle } from "@/lib/guide/hub";
import { ogImages } from "@/lib/share-image";
import { hubBlurb } from "@/lib/live-prices";

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

// No count (architecture review 2026-09-30, item 5): this said 11 guides and
// "Onze" below while FR_PAGES listed 12. The list is the count.
const DESCRIPTION =
  "Rodrigues en français, par des gens qui y vivent : nos guides sur les plages, les activités, où dormir, le taxi et la location de scooter ou de voiture.";

// The "dès Rs …" in a blurb is read from the same content the landing page it
// links reads (hubBlurb, SEO audit 2026-09-29 C1): the car line said Rs 1 499
// while /browse/car charged from Rs 1,899. French grouping, as every French
// page writes a price.
const rs = (n: number) => `Rs ${n.toLocaleString("fr-FR")}`;

export const metadata: Metadata = {
  title: "Rodrigues en français — le guide | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/fr` },
  openGraph: {
    title: "Rodrigues en français | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/fr`,
    locale: "fr_FR",
    images: ogImages(),
  },
};

export default async function FrHubPage() {
  const content = await getContent();
  // "Les 19 plus belles plages" was typed the day it was true; the page counts
  // its own list, and so does this now (lib/guide/hub.ts, item 5).
  const pages = FR_PAGES.map((p) => ({ ...p, title: hubTitle(content, p) }));

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
            pages.map((p) => ({ name: p.title, url: `${SITE_URL}${p.href}` })),
          ),
        ]}
      />
      {/* The hub was written in French throughout and still served English
          chrome, because it was the one /fr route without this. Its own header
          comment says a French visitor greeted in English "has been told
          something about how much the French half of this site is looked
          after" — and the nav directly under it said EXPLORE THE ISLAND. */}
      <PageLanguage lang="fr" />
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
            Nos guides en français : où se baigner, quoi faire, comment se déplacer et combien ça
            coûte vraiment — écrits par des gens qui vivent ici.
          </p>

          <ul className="mt-8 space-y-2.5">
            {pages.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/40"
                >
                  <Compass size={17} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-sm font-bold text-offwhite">{p.title}</span>
                    <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                      {hubBlurb(content, p, rs)}
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
