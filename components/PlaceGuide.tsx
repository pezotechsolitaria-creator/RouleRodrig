import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Map as MapIcon, MapPin, Mountain, Navigation } from "lucide-react";
import type { MapLocation } from "@/lib/defaults";
import PlaceDiscovery from "@/components/PlaceDiscovery";
import { loc } from "@/lib/localize";
import { realProse } from "@/lib/place-prose";
import { placeAnchors } from "@/lib/guide/location-page-gate";
import { mapEntryHref } from "@/lib/guide/places";
import type { Language } from "@/lib/i18n";

// Chrome added by the architecture review 2026-09-30 (items 3, 8), in the three
// languages a guide page can be rendered in. Kept here rather than in
// lib/i18n.ts: these are server-rendered strings for a crawler, picked by the
// page's `lang` prop, not by the visitor's client-side language.
const MORE: Record<Language, { onMap: string; fullPage: string; atAGlance: string }> = {
  en: { onMap: "On the map", fullPage: "Read the full page", atAGlance: "Every place at a glance" },
  fr: { onMap: "Voir sur la carte", fullPage: "Lire la page complète", atAGlance: "Tous les lieux en un coup d'œil" },
  // "Get lor kart" is the Kreol the map chrome already uses (lib/i18n.ts
  // viewOnMap), so the two read as one site.
  cr: { onMap: "Get lor kart", fullPage: "Get so paz", atAGlance: "Tou bann plas" },
};

// A themed island-guide page (beaches, viewpoints…) built from the real
// mapLocations the owner maintains in admin.
//
// Why one page per THEME and not one per place: each location's story is only
// ~25–70 words. Twenty-one pages that thin would compete with TripAdvisor on
// depth and lose, and thin pages drag the whole domain. Aggregated, the same
// content is ~1,300 words of genuinely local writing plus 60+ original photos —
// which is worth ranking. If Search Console later shows a single place pulling
// real impressions, split that one out into its own deep page.
//
// That split now has a door and a lock (architecture review 2026-09-30): a
// place the owner writes a long read for gets /guide/<slug> only when it passes
// lib/guide/location-page-gate.ts, and its entry here then links to it. Below
// the gate, this page is still the one place its writing lives.

export default function PlaceGuide({
  eyebrow,
  title,
  intro,
  places,
  guideHref,
  related,
  sibling,
  lang = "en",
  labels,
  anchors,
  pages = {},
}: {
  eyebrow: string;
  title: string;
  intro: string;
  places: MapLocation[];
  /** This page's own path, so a card can deep-link to its long-form entry. */
  guideHref: string;
  /**
   * id → #anchor, from placeAnchors() over ALL map locations, so the anchor
   * here is the one /map and every other page link to (item 3). Omitted, the
   * anchors are made from this page's own places — right for a page nothing
   * else deep-links into.
   */
  anchors?: Record<string, string>;
  /** id → /guide/<slug> for the places that have earned a page of their own. */
  pages?: Record<string, string>;
  related: { href: string; label: string }[];
  /**
   * The other half of this pair, shown as a band ABOVE the fold.
   *
   * Beaches and Viewpoints answer one question between them, and the homepage
   * now has a single fused tile for both — so whichever page you land on has to
   * offer the other one immediately, not in a list under the article.
   */
  sibling?: { href: string; label: string };
  /** Picks description/story from the *Fr / *Cr siblings the owner maintains. */
  lang?: Language;
  /** Chrome strings. Server-rendered, so they can't come from the client
      language context — the whole point is that a crawler reads them. */
  labels?: { rent: string; guide: string; directions: string; keepExploring: string };
}) {
  const L = labels ?? {
    rent: "Rent a scooter to get there",
    guide: "Full island guide",
    directions: "Get directions",
    keepExploring: "Keep exploring",
  };
  const more = MORE[lang] ?? MORE.en;
  const anchorOf = anchors ?? placeAnchors(places);
  // Each article's id is its readable anchor now ("trou-d-argent"), not the
  // admin's timestamp id. Links already out there — /explore, the homepage,
  // the curated world and PlaceDiscovery's own cards — still say #loc-17…, so
  // that id stays on the page as a second, empty target. Only where it cannot
  // clash with another place's anchor.
  const anchorSet = new Set(places.map((p) => anchorOf[p.id] ?? p.id));
  return (
    // Scoped to the content, since the root layout owns <html lang>. Fixes
    // screen-reader pronunciation; Google reads the content itself.
    <main className="bg-dark min-h-screen" lang={lang === "cr" ? "mfe" : lang}>
      <header className="border-b border-white/10 bg-gradient-to-b from-yellow/[0.06] to-transparent px-5 py-10 md:py-14">
        <div className="mx-auto max-w-3xl">
          <p className="font-bebas text-yellow text-xs tracking-[0.3em]">{eyebrow}</p>
          <h1 className="mt-3 font-syne text-4xl md:text-5xl font-extrabold text-offwhite leading-tight">
            {title}
          </h1>
          <p className="mt-4 font-dm text-muted leading-relaxed max-w-2xl">{intro}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={lang === "fr" ? "/fr/location-scooter-rodrigues" : "/browse/scooter"}
              className="inline-flex items-center gap-2 rounded-full bg-yellow px-6 py-3 font-syne font-bold text-dark text-sm transition-transform hover:scale-[1.03]"
            >
              {L.rent} <ArrowRight size={16} />
            </Link>
            <Link
              href="/guide/rodrigues"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-syne font-bold text-white text-sm transition-colors hover:bg-white/10"
            >
              {L.guide}
            </Link>
          </div>

          {/* ── The sibling guide, at the TOP ──────────────────────────────
              The homepage used to carry a Viewpoints tile; Beaches and
              Viewpoints have since been fused into one to free a slot, so this
              page is now the way most people arrive at the question "where do I
              go that's beautiful". A related-link buried under 1,300 words is
              not a route for someone who came from a tile labelled
              "Beaches & Views" — it has to be visible before the scroll.

              Rendered only when a sibling is given, so the viewpoints page does
              not grow a link back to itself. */}
          {sibling && (
            <Link
              href={sibling.href}
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-yellow/25 bg-yellow/[0.06] px-4 py-3 font-dm text-sm text-offwhite/85 transition-colors hover:border-yellow/50"
            >
              <Mountain size={15} className="shrink-0 text-yellow" />
              <span>{sibling.label}</span>
              <ArrowRight size={14} className="shrink-0 text-yellow/70" />
            </Link>
          )}
        </div>
      </header>

      {/* ── DISCOVERY FIRST ──────────────────────────────────────────────────
          The owner's complaint, verbatim: "user clicks Plages and gets dumped
          into long paragraphs". This grid answers "which one do I go to?" in
          about two seconds.

          The article below is NOT removed. It is ~1,300 words of genuinely
          local writing plus 60+ original photos and it earns real search
          traffic — Google reads the whole page either way, so demoting the
          prose costs nothing and deleting it would cost the channel.

          The cards title each place with an h3, and they come BEFORE the
          articles' h2s: the outline read h1 → h3, skipping a level, which is
          what a screen reader's heading list and an accessibility audit both
          flag (architecture review 2026-09-30, item 8). A visually hidden h2
          heads the grid, so it reads h1 → h2 → h3 → h2 with no change to the
          page anybody sees. */}
      {places.length > 0 && <h2 className="sr-only">{more.atAGlance}</h2>}
      <PlaceDiscovery places={places} guideHref={guideHref} />

      <div id="guide" className="mx-auto max-w-3xl px-5 pb-14 pt-4">
        <div className="space-y-16">
          {places.map((p, i) => {
            const photos = (p.images?.length ? p.images : p.image ? [p.image] : []).slice(0, 4);
            const maps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
            // All 24 places carry FR/CR siblings, so a French page is real
            // translated writing — not English text under a French URL, which
            // is what Google penalises.
            const name = loc(lang, p.name, p.nameFr, p.nameCr).trim();
            // realProse strips the admin placeholder ("Add a description.")
            // as well as whitespace — a place with a real story but a stub
            // description was printing the stub above the story.
            const description = realProse(loc(lang, p.description, p.descriptionFr, p.descriptionCr));
            const story = realProse(loc(lang, p.story, p.storyFr, p.storyCr));
            const anchor = anchorOf[p.id] ?? p.id;
            const legacy = p.id !== anchor && !anchorSet.has(p.id);
            const page = pages[p.id];
            return (
              <article key={p.id} id={anchor} className="scroll-mt-24">
                {legacy && <span id={p.id} aria-hidden="true" className="block scroll-mt-24" />}
                <h2 className="font-syne text-2xl md:text-3xl font-bold text-offwhite">{name}</h2>
                <p className="mt-2 flex items-center gap-1.5 font-dm text-xs text-muted">
                  <MapPin size={13} className="text-yellow/70 shrink-0" />
                  {p.lat.toFixed(4)}, {p.lng.toFixed(4)} · Rodrigues Island, Mauritius
                </p>

                {description && (
                  <p className="mt-4 font-dm text-muted leading-relaxed">{description}</p>
                )}
                {story && <p className="mt-3 font-dm text-muted leading-relaxed">{story}</p>}

                {photos.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {photos.map((src, n) => (
                      <div
                        key={src}
                        className="relative aspect-square overflow-hidden rounded-xl border border-white/10"
                      >
                        <Image
                          src={src}
                          // Descriptive, unique per image — never "image1.jpg".
                          alt={`${name} — Rodrigues, ${n + 1}/${photos.length}`}
                          fill
                          sizes="(max-width: 640px) 50vw, 25vw"
                          className="object-cover"
                          // The first card of the first place is the LCP element.
                          loading={i === 0 && n === 0 ? "eager" : "lazy"}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* min-h-11: three small text links side by side under every
                    place, on a phone — each gets the 44px row the repo's other
                    guide controls have. */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5">
                  {/* The place's own page, when it has earned one — the only
                      link into it from the guide it deepens (item 2). */}
                  {page && (
                    <Link
                      href={page}
                      className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm font-bold text-yellow hover:underline"
                    >
                      <BookOpen size={14} /> {more.fullPage}
                    </Link>
                  )}
                  <a
                    href={maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    <Navigation size={14} /> {L.directions}
                  </a>
                  {/* Its row on the island map, which scrolls to it (item 3).
                      The map and the guides used to link each other nowhere. */}
                  <Link
                    href={mapEntryHref(p, anchorOf)}
                    className="inline-flex min-h-11 items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                  >
                    <MapIcon size={14} /> {more.onMap}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        <nav className="mt-16 border-t border-white/10 pt-8">
          <p className="font-syne text-sm font-bold text-offwhite">{L.keepExploring}</p>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.href}>
                <Link
                  href={r.href}
                  className="inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 hover:text-yellow transition-colors"
                >
                  {r.label} <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
