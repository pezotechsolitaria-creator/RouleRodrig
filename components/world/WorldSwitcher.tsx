"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useExperienceWorld } from "@/context/ExperienceWorldContext";
import { useLanguage } from "@/context/LanguageContext";
import { otherWorld, WORLD_COPY, WORLD_PAGE } from "@/lib/worlds";

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
  const router = useRouter();

  // `world` is never null once ready — everyone starts in Authentic since the
  // gateway was removed. The null branch stays as a type guard rather than as
  // a behaviour: this control is now the ONLY way to reach Curated, so it
  // hiding itself would strand the whole world behind nothing.
  // ── THE OTHER WORLD IS FETCHED BEFORE IT IS ASKED FOR ───────────────────
  // Switching used to pause: `router.push` had to go and get the page. The
  // route is known the moment we know which world you are NOT in, so it is
  // fetched then, and the press becomes a paint. Prefetching one route the
  // visitor is being actively invited to visit is the cheapest kind.
  //
  // Above the `ready` guard because hooks cannot run conditionally; it simply
  // does nothing until there is a world.
  useEffect(() => {
    if (!ready || world === null) return;
    router.prefetch(WORLD_PAGE[otherWorld(world)]);
  }, [ready, world, router]);

  if (!ready || world === null) return null;

  const next = otherWorld(world);
  const copy = WORLD_COPY[next];
  const label =
    language === "fr" ? "Changez votre Rodrigues"
    : language === "cr" ? "Sanz ou Rodrigues"
    : "Change your Rodrigues";

  const here = WORLD_COPY[world];

  // ── A DOOR, NOT A SETTING ────────────────────────────────────────────────
  // The first version was a bordered chip reading "CHANGE YOUR RODRIGUES
  // CURATED →" — a settings row wearing a serif. Two problems: it announced the
  // mechanism rather than the destination, and it gave equal weight to the
  // world you are in and the one you are not.
  //
  // This shows the WORLD YOU ARE IN as the subject, with the other offered
  // quietly beside it — the way a good masthead names the section you are
  // reading. The accent comes from the live world token, so the control is
  // painted by whichever world owns the page rather than by a fixed gold.
  const button = (
    <button
      type="button"
      // Choose, then GO. The world owns a page now (lib/worlds.ts → WORLD_PAGE),
      // so switching has somewhere to arrive; restyling the page you were
      // already on made the control read as a theme toggle.
      onClick={() => {
        choose(next);
        router.push(WORLD_PAGE[next]);
      }}
      aria-label={`${label} — ${copy.eyebrow} ${copy.name}`}
      className={`group relative inline-flex min-h-11 items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rr-world-accent,#F5C842)]/60 ${className}`}
      style={{
        border: "1px solid var(--rr-world-line, rgba(255,255,255,0.12))",
        background: "color-mix(in srgb, var(--rr-world-accent, #F5C842) 7%, transparent)",
      }}
    >
      {/* WHERE YOU ARE. The world names itself, in its own accent. */}
      <span
        className="font-bebas text-[13px] leading-none tracking-[0.26em]"
        style={{ color: "var(--rr-world-accent, #F5C842)" }}
      >
        {here.eyebrow}
      </span>

      {/* The hairline that separates the two halves — the visual equivalent of
          the word "or", without spending a word on it. */}
      <span
        aria-hidden
        className="h-3.5 w-px"
        style={{ background: "var(--rr-world-line, rgba(255,255,255,0.18))" }}
      />

      {/* WHERE YOU COULD GO. Quieter, and it brightens on approach so the
          control reveals that it is a door rather than a label. */}
      <span className="flex items-center gap-1 font-dm text-[10.5px] font-semibold leading-none text-muted transition-colors group-hover:text-offwhite">
        {copy.eyebrow}
        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
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
