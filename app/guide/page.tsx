import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Compass } from "lucide-react";
import BackLink from "@/components/BackLink";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import { breadcrumbLd, itemListLd } from "@/lib/schema";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { guideHubLinks } from "@/lib/guide/hub";
import { guideTrail } from "@/lib/guide/places";
import { ogImages } from "@/lib/share-image";

export const revalidate = 3600;

// ── /guide WAS A 404 ────────────────────────────────────────────────────────
//
// Eight guide pages live under this path and the parent returned the not-found
// screen. Nothing in the app linked to it, so no test caught it and no crawl
// reached it — but it is one of the most natural URLs on this site to type, to
// shorten a shared link to, or for another site to point at.
//
// A redirect to /guide/rodrigues would have cleared the 404 in a line, and
// thrown away the reason to have the page: eight guides that are only ever
// reachable one at a time, from whichever article happens to mention them.
// This is the one page that links all eight.

const DESCRIPTION =
  "Rodrigues Island guides by people who live here: beaches, viewpoints, hikes, scooter routes, Île aux Cocos, food and shops, all in one place.";

export const metadata: Metadata = {
  title: "Rodrigues Island Guides | Roule Rodrigues",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/guide` },
  openGraph: {
    title: "Rodrigues Island guides | Roule Rodrigues",
    description: DESCRIPTION,
    url: `${SITE_URL}/guide`,
    images: ogImages(),
  },
};

export default async function GuideHubPage() {
  const content = await getContent();
  // ── THE LIST, COUNTED FROM WHAT EACH PAGE SHOWS (architecture review 2026-09-30) ──
  // Titles carry the count the target page prints ("The 2 best hikes", not the
  // "5" typed here once, which this page also published in its ItemList —
  // item 5). /guide/shops is listed only while it has a shop to show, and a
  // place that has earned a page of its own joins the list the hour it passes
  // the gate (item 2). See lib/guide/hub.ts.
  const guides = guideHubLinks(content);

  return (
    <>
      <JsonLd
        data={[
          // Home › Island guide: the name every guide's own trail gives this
          // page (item 6), rather than "Roule Rodrigues › Guides".
          breadcrumbLd(guideTrail(SITE_URL)),
          // The same links the page renders, so the markup can never describe
          // content a visitor cannot see.
          itemListLd(
            "Rodrigues Island guides",
            guides.map((g) => ({ name: g.title, url: `${SITE_URL}${g.href}` })),
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
            fallback="/more"
            iconSize={15}
            className="inline-flex items-center gap-2 font-dm text-sm text-muted transition-colors hover:text-yellow"
          >
            {" "}Back
          </BackLink>

          <p className="mt-6 font-bebas text-[11px] tracking-[0.3em] text-yellow">ISLAND GUIDE</p>
          <h1 className="mt-1 font-syne text-3xl font-extrabold uppercase leading-[0.95] sm:text-4xl">
            Rodrigues, explained
          </h1>
          {/* No number: "Eight guides" was true until a shop pin came and went
              or a place earned its own page. The list below is the count. */}
          <p className="mt-3 max-w-xl font-dm text-sm leading-relaxed text-muted">
            Guides written by people who live here — where the beaches are, which hike is
            worth the morning, and what the octopus season actually means.
          </p>

          <ul className="mt-8 space-y-2.5">
            {guides.map((g) => (
              <li key={g.href}>
                <Link
                  href={g.href}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-dark-card p-4 transition-colors hover:border-yellow/40"
                >
                  <Compass size={17} className="mt-0.5 shrink-0 text-yellow" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-syne text-sm font-bold text-offwhite">{g.title}</span>
                    <span className="mt-0.5 block font-dm text-xs leading-relaxed text-muted">
                      {g.blurb}
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
