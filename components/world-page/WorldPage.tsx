"use client";

import { useEffect } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { locT, type WorldDoc, type WorldId } from "@/lib/world-docs/types";
import type { ResolvedMood, ResolvedSection } from "@/lib/world-docs/resolve";
import WorldHeader from "./WorldHeader";
import WorldHeroBanner from "./WorldHeroBanner";
import QuickActionsRow from "./QuickActionsRow";
import FeaturedCurations from "./FeaturedCurations";
import OnlyInRodrigues from "./OnlyInRodrigues";
import MoodRail from "./MoodRail";
import EditorNotes from "./EditorNotes";
import ConciergeInvite from "./ConciergeInvite";

/**
 * A world, composed.
 *
 * ── NOTHING BELOW IS A HARD-CODED PAGE ────────────────────────────────────
 * The order of the sections, their headings, their cards and whether they
 * appear at all come from the document. This component only knows how each
 * TYPE of section is drawn. Reordering the page in /admin/worlds reorders this
 * loop; nobody has to touch a file. That is the requirement the whole worlds
 * data model exists to satisfy, and it is worth stating here because the
 * cheapest way to break it is to "just add one more section" in JSX.
 *
 * ── ONE RENDERER, TWO WORLDS ──────────────────────────────────────────────
 * Authentic and Curated are the same component with different documents and a
 * different `data-world-page` attribute, which is what selects the palette in
 * globals.css. Building a second page for the second world would have meant
 * two implementations of the same seven sections drifting apart from the day
 * they shipped — and it would have made "add a third world" a rewrite instead
 * of a row in a table.
 */
export default function WorldPage({
  world,
  doc,
  sections,
  moods,
  heroImages,
  logo,
  mascot,
}: {
  /** Which world this is. Drives the palette and the section anchors. */
  world: WorldId;
  doc: WorldDoc;
  sections: ResolvedSection[];
  /** Keyed by section id — moods need catalogue photography the doc has no room for. */
  moods: Record<string, ResolvedMood[]>;
  heroImages: string[];
  logo?: string;
  mascot?: string;
}) {
  const { language } = useLanguage();
  const { world: currentWorld, ready, choose } = useExperienceWorld();

  // ── ARRIVING HERE IS CHOOSING THIS WORLD ────────────────────────────────
  // Without this the URL and the visitor's stored world can disagree, and the
  // switcher in the header then says "you are in AUTHENTIC → go to CURATED"
  // while the reader is standing on the curated page. It happens on every
  // entry that is not the switcher itself: a shared link, a search result, the
  // door on the homepage.
  //
  // The URL wins, because it is the thing the visitor can see. `choose` also
  // stores the world and applies its theme, so the rest of the site agrees
  // from the next page onwards.
  useEffect(() => {
    if (!ready) return;
    if (world !== "authentic" && world !== "curated") return;
    if (currentWorld === world) return;
    choose(world);
  }, [ready, currentWorld, world, choose]);

  return (
    <div className="rr-worldpage min-h-screen" data-world-page={world}>
      <WorldHeader logo={logo} world={world} />

      <main>
        <WorldHeroBanner hero={doc.hero} images={heroImages} world={world} />

        {/* Quick actions sit HARD under the hero — no search field between them,
            which was the brief's one structural instruction. The hero is now a
            framed card, so the row sits just below it rather than overlapping
            it: an overlap onto a rounded card reads as a mistake, where onto a
            full-bleed banner it read as depth. */}
        {doc.quickActions.enabled !== false && (
          <div className="relative z-10 mt-3">
            <QuickActionsRow items={doc.quickActions.items} />
          </div>
        )}

        {/* ── THE RHYTHM IS THE SCROLL BUDGET ────────────────────────────────
            This was space-y-20 py-20: 160px of nothing between every pair of
            sections, 800px of empty page in total on a phone, in the name of
            "luxury breathing room". Breathing room is what you can see AROUND
            something, and 160px of black is not seen, it is scrolled past.
            40px on a phone still separates them — the sections are visually
            different enough to do most of that work themselves — and the
            desktop keeps the more generous rhythm it can afford. */}
        <div className="space-y-10 pb-10 pt-6 lg:space-y-20 lg:pb-16 lg:pt-12">
          {sections.map((s) => {
            const title = locT(language, s.title);
            const subtitle = locT(language, s.subtitle);

            const seeAll = s.raw.seeAll?.trim() || undefined;

            if (s.type === "featured") {
              return (
                <FeaturedCurations
                  key={s.id}
                  id={`${world}-featured`}
                  title={title}
                  subtitle={subtitle}
                  seeAll={seeAll}
                  cards={s.cards}
                />
              );
            }
            if (s.type === "onlyInRodrigues") {
              return (
                <OnlyInRodrigues
                  key={s.id}
                  id={s.id}
                  title={title}
                  subtitle={subtitle}
                  seeAll={seeAll}
                  cards={s.cards}
                />
              );
            }
            if (s.type === "moods") {
              return (
                <MoodRail
                  key={s.id}
                  id={s.id}
                  title={title}
                  subtitle={subtitle}
                  seeAll={seeAll}
                  moods={moods[s.id] ?? []}
                />
              );
            }
            if (s.type === "editors" && s.raw.type === "editors") {
              return (
                <EditorNotes
                  key={s.id}
                  id={s.id}
                  title={title}
                  subtitle={subtitle}
                  seeAll={seeAll}
                  notes={s.raw.notes}
                />
              );
            }
            if (s.type === "concierge" && s.raw.type === "concierge") {
              return (
                <ConciergeInvite key={s.id} id={s.id} section={s.raw} mascot={mascot} />
              );
            }
            return null;
          })}
        </div>
      </main>

      {/* Clears the floating bottom nav (and its safe-area padding) so the last
          section is never half-covered on a phone. */}
      <div className="h-[calc(5rem+env(safe-area-inset-bottom))] md:h-8" aria-hidden />
    </div>
  );
}
