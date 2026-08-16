"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { locT, type WorldDoc, type WorldId } from "@/lib/world-docs/types";
import type { WorldView } from "@/lib/world-docs/page-data";
import WorldHeader from "./WorldHeader";
import WorldHeroBanner from "./WorldHeroBanner";
import QuickActionsRow from "./QuickActionsRow";
import WorldPhotoCards from "./WorldPhotoCards";
import WorldQuickAccess from "./WorldQuickAccess";
import FeaturedCurations from "./FeaturedCurations";
import OnlyInRodrigues from "./OnlyInRodrigues";
import MoodRail from "./MoodRail";
import EditorNotes from "./EditorNotes";
import WorldEvents from "./WorldEvents";
import WorldReviews from "./WorldReviews";
import ConciergeInvite from "./ConciergeInvite";
import WorldTools from "./WorldTools";

/**
 * A world, composed.
 *
 * ── NOTHING BELOW IS A HARD-CODED PAGE ────────────────────────────────────
 * The order of the sections, their headings, their cards and whether they
 * appear at all come from the document. This component only knows how each
 * TYPE of section is drawn. Reordering the page in /admin/worlds reorders this
 * loop; nobody has to touch a file. That is the requirement the whole
 * world-docs data model exists to satisfy, and it is worth stating here
 * because the cheapest way to break it is to "just add one more section" in
 * JSX.
 *
 * ── ONE RENDERER ──────────────────────────────────────────────────────────
 * `data-world-page` selects the palette in globals.css, so a second world is a
 * block of CSS values and a document — not a second page. Authentic is the
 * homepage (see WORLD_PAGE in lib/worlds.ts); this renders Curated today and
 * will render anything else the owner composes.
 */
export default function WorldPage({
  world,
  doc,
  view,
}: {
  /** Which world this is. Drives the palette and the section anchors. */
  world: WorldId;
  doc: WorldDoc;
  view: WorldView;
}) {
  const { language } = useLanguage();
  const { world: currentWorld, ready, choose } = useExperienceWorld();

  // ── ARRIVING HERE IS CHOOSING THIS WORLD — ONCE ─────────────────────────
  // Without this the URL and the visitor's stored world can disagree, and the
  // switcher then says "you are in AUTHENTIC → go to CURATED" to somebody
  // standing on the curated page. It happens on every entry that is not the
  // switcher itself: a shared link, a search result, the door on the homepage.
  //
  // ── AND WHY IT IS GUARDED BY A REF ──────────────────────────────────────
  // The first version re-ran whenever the stored world changed, which made the
  // owner's bug: press the switcher on /curated, and `choose("authentic")`
  // changed the context — which woke THIS effect, which saw a mismatch and
  // immediately chose "curated" again. The two fought, the navigation to the
  // other world was undone mid-flight, and the visitor could leave Curated in
  // one direction only.
  //
  // Claiming is something a page does when a visitor ARRIVES, not a rule it
  // enforces for as long as it is mounted. Once per mount, and then it is the
  // switcher's business.
  const claimed = useRef(false);
  useEffect(() => {
    if (!ready || claimed.current) return;
    claimed.current = true;
    if (world !== "authentic" && world !== "curated") return;
    if (currentWorld === world) return;
    choose(world);
  }, [ready, currentWorld, world, choose]);

  return (
    <div className="rr-worldpage min-h-screen" data-world-page={world}>
      <WorldHeader logo={view.logo} />

      <main>
        <WorldHeroBanner hero={doc.hero} images={view.heroImages} world={world} />

        {/* The world's own shortcuts sit hard under the hero — no search field
            between them, which was the brief's one structural instruction. */}
        {doc.quickActions.enabled !== false && (
          <div className="relative z-10 mt-3">
            <QuickActionsRow items={doc.quickActions.items} />
          </div>
        )}

        {/* ── THE RHYTHM IS THE SCROLL BUDGET ────────────────────────────────
            40px between sections on a phone, not the 160px this started with.
            Breathing room is what you can see AROUND something; 160px of black
            is not seen, it is scrolled past. */}
        <div className="space-y-10 pb-10 pt-6 lg:space-y-20 lg:pb-16 lg:pt-12">
          {view.sections.map((s) => {
            const title = locT(language, s.title);
            const subtitle = locT(language, s.subtitle);
            const seeAll = s.raw.seeAll?.trim() || undefined;

            switch (s.type) {
              case "cards": {
                // The world's own list. `fallbackCards` covers a document saved
                // before these sections carried one — rendering nothing there
                // would have deleted a section from a live page.
                const own = s.raw.type === "cards" ? s.raw.items : undefined;
                return (
                  <WorldPhotoCards
                    key={s.id}
                    cards={own?.length ? own.filter((c) => c.enabled !== false) : view.fallbackCards}
                    images={view.cardImages}
                  />
                );
              }
              case "quickAccess": {
                const own = s.raw.type === "quickAccess" ? s.raw.items : undefined;
                return (
                  <WorldQuickAccess
                    key={s.id}
                    id={s.id}
                    title={title}
                    subtitle={subtitle}
                    seeAll={seeAll}
                    items={own?.length ? own.filter((q) => q.enabled !== false) : view.fallbackQuick}
                  />
                );
              }
              case "featured":
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
              case "onlyInRodrigues":
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
              case "moods":
                return (
                  <MoodRail
                    key={s.id}
                    id={s.id}
                    title={title}
                    subtitle={subtitle}
                    seeAll={seeAll}
                    moods={view.moods[s.id] ?? []}
                  />
                );
              case "editors":
                return s.raw.type === "editors" ? (
                  <EditorNotes
                    key={s.id}
                    id={s.id}
                    title={title}
                    subtitle={subtitle}
                    seeAll={seeAll}
                    notes={s.raw.notes}
                  />
                ) : null;
              case "events":
                return (
                  <WorldEvents
                    key={s.id}
                    id={s.id}
                    title={title}
                    subtitle={subtitle}
                    seeAll={seeAll}
                    events={view.events}
                  />
                );
              case "reviews":
                return (
                  <WorldReviews
                    key={s.id}
                    id={s.id}
                    title={title}
                    subtitle={subtitle}
                    reviews={view.reviews}
                  />
                );
              case "concierge":
                return s.raw.type === "concierge" ? (
                  <ConciergeInvite
                    key={s.id}
                    id={s.id}
                    section={s.raw}
                    mascot={view.mascot}
                  />
                ) : null;
              default:
                return null;
            }
          })}
        </div>
      </main>

      {/* Map · Planner · Guide · Emergency, docked above the floating nav. It
          is fixed, so it costs no page height — the spacer below already
          reserves the room for both bars. */}
      <WorldTools />

      {/* Clears the floating bottom nav AND the tools strip above it, so the
          last section is never half-covered on a phone. */}
      <div className="h-[calc(8.5rem+env(safe-area-inset-bottom))] md:h-8" aria-hidden />
    </div>
  );
}
