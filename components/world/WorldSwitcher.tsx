"use client";

import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { useLanguage } from "@/context/LanguageContext";
import { otherWorld, WORLD_COPY } from "@/lib/worlds";

// ── CHANGE YOUR RODRIGUES ───────────────────────────────────────────────────
//
// Not a settings row. The brief is explicit that this must be discoverable
// without competing with the main navigation, and the difference is in what it
// SAYS: a settings control names a property ("Theme: dark"), whereas this names
// a destination — the world you are not in.
//
// It is a toggle rather than a menu because there are exactly two worlds. A
// select with two options is a button that takes an extra tap.

export default function WorldSwitcher({
  /** Extra classes for the button itself. */
  className = "",
  /** Render the surrounding strip. Off when embedding into an existing row. */
  strip = true,
}: { className?: string; strip?: boolean }) {
  const { world, ready, choose } = useExperienceWorld();
  const { language } = useLanguage();

  // Nothing to switch between until a world exists — before that the gateway
  // is on screen and this would be offering a choice already being made.
  if (!ready || world === null) return null;

  const next = otherWorld(world);
  const copy = WORLD_COPY[next];
  const label =
    language === "fr" ? "Changez votre Rodrigues"
    : language === "cr" ? "Sanz ou Rodrigues"
    : "Change your Rodrigues";

  const button = (
    <button
      type="button"
      onClick={() => choose(next)}
      // The accessible name says what will HAPPEN, because "Curated" alone
      // tells a screen-reader user nothing about which way this goes.
      aria-label={`${label} — ${copy.eyebrow} ${copy.name}`}
      className={`group inline-flex items-center gap-2 rounded-full border border-white/12 px-3.5 py-2 font-dm text-[11px] font-semibold text-muted transition-colors hover:border-yellow/40 hover:text-yellow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50 ${className}`}
    >
      <span className="font-bebas tracking-[0.22em]">{label}</span>
      <span aria-hidden className="text-offwhite/70 transition-colors group-hover:text-yellow">
        {copy.eyebrow} →
      </span>
    </button>
  );

  // The strip belongs to this component, not to its caller. A caller that
  // wrapped it in a bordered row would draw that border for first-time
  // visitors too — an empty bar above the fold, before any world exists.
  // Whatever decides to render nothing has to own everything that would
  // otherwise be left behind.
  if (!strip) return button;
  return (
    <div className="flex justify-center border-t border-white/10 px-4 py-2">{button}</div>
  );
}
