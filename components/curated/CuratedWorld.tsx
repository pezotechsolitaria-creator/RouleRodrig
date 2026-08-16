"use client";

import { useLanguage } from "@/context/LanguageContext";
import { locT, type CuratedDoc } from "@/lib/world-docs/types";
import type { ResolvedMood, ResolvedSection } from "@/lib/world-docs/resolve";
import CuratedHeader from "./CuratedHeader";
import CuratedHero from "./CuratedHero";
import QuickActionsRow from "./QuickActionsRow";
import FeaturedCurations from "./FeaturedCurations";
import OnlyInRodrigues from "./OnlyInRodrigues";
import MoodRail from "./MoodRail";
import EditorNotes from "./EditorNotes";
import ConciergeInvite from "./ConciergeInvite";

/**
 * The Curated world, composed.
 *
 * ── NOTHING BELOW IS A HARD-CODED PAGE ────────────────────────────────────
 * The order of the sections, their headings, their cards and whether they
 * appear at all come from the document. This component only knows how each
 * TYPE of section is drawn. Reordering the page in /admin/worlds reorders this
 * loop; nobody has to touch a file. That is the requirement the whole worlds
 * data model exists to satisfy, and it is worth stating here because the
 * cheapest way to break it is to "just add one more section" in JSX.
 *
 * `previewAt` is what lets the admin's live preview render the page as it will
 * look at some future moment. On the public site it is simply "now", resolved
 * on the server so the markup is stable.
 */
export default function CuratedWorld({
  doc,
  sections,
  moods,
  heroImages,
  logo,
  mascot,
}: {
  doc: CuratedDoc;
  sections: ResolvedSection[];
  /** Keyed by section id — moods need catalogue photography the doc has no room for. */
  moods: Record<string, ResolvedMood[]>;
  heroImages: string[];
  logo?: string;
  mascot?: string;
}) {
  const { language } = useLanguage();

  return (
    <div className="rr-curated min-h-screen">
      <CuratedHeader logo={logo} />

      <main>
        <CuratedHero hero={doc.hero} images={heroImages} />

        {/* Quick actions sit HARD under the hero — no search field between them,
            which was the brief's one structural instruction. The negative
            margin lifts the row so it overlaps the hero's bottom edge slightly:
            it makes the first screen feel like one composition rather than a
            picture with a menu below it. */}
        {doc.quickActions.enabled !== false && (
          <div className="relative z-10 -mt-8 lg:-mt-10">
            <QuickActionsRow items={doc.quickActions.items} />
          </div>
        )}

        {/* Generous, and deliberately uneven: the gap before the concierge is
            larger than the others so the invitation reads as an arrival. */}
        <div className="space-y-20 py-20 lg:space-y-28 lg:py-28">
          {sections.map((s) => {
            const title = locT(language, s.title);
            const subtitle = locT(language, s.subtitle);

            if (s.type === "featured") {
              return (
                <FeaturedCurations
                  key={s.id}
                  id="curated-featured"
                  title={title}
                  subtitle={subtitle}
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
      <div className="h-[calc(6rem+env(safe-area-inset-bottom))] md:h-10" aria-hidden />
    </div>
  );
}
