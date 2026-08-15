"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── THE DUSK SEQUENCE ───────────────────────────────────────────────────────
//
// A 1200ms sunset (or sunrise) that plays over the whole screen when the
// visitor switches between day and night. It lives here rather than inside the
// experiences hub because it is now played from two places — the hub's
// Day/Night switch and the Appearance control in More — and a cinematic that
// looks different in each place is not a signature, it is a bug.
//
// ── IT IS A PICTURE OF THE SKY, NOT A SURFACE OF THE PRODUCT ───────────────
// Every colour below is a literal. Nothing here reads a theme variable, and it
// must stay that way: when this was themed, dark mode produced a BLACK SUN,
// which is the one thing a sunset cannot contain. A sunset over Rodrigues looks
// the same whichever theme the app happens to be in.
//
// ── WHY THREE LAYERS AND NOT A CROSSFADE ───────────────────────────────────
// The first version cross-faded a blue day sky into a navy night sky. At the
// midpoint both sat at 50%, and a light blue averaged with a dark navy is
// GREY-BROWN — the transition read as mud, or as the screen simply getting
// dirty. Nobody has ever seen a grey sunset.
//
// A real dusk does not interpolate between its endpoints, it travels THROUGH a
// third colour: the sky goes blue → orange → deep navy. So the warm sky is its
// own fully-opaque layer that peaks exactly where the mud used to be, and the
// two endpoints are gone by then — day has faded out by the midpoint, night has
// not yet begun. At t=0.5 you see pure sunset and nothing else.

const DUSK_MS = 1200;

/** Deterministic star field — a replay looks identical instead of re-scattering. */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  k: i,
  l: `${(i * 37) % 97}%`,
  tp: `${(i * 53) % 58}%`,
  o: 0.35 + ((i * 17) % 60) / 100,
}));

/** Fully day (0) → fully night (1). */
export type DuskTarget = "day" | "night";

/**
 * Drives one dusk playthrough.
 *
 * `play(target)` starts it and returns immediately — the caller commits its own
 * state change in the same tick and never waits for the animation. That
 * ordering is deliberate and was learned the hard way: when the mode was set
 * from inside requestAnimationFrame, pressing Night did nothing at all in any
 * backgrounded tab, because rAF is suspended there. The animation is decoration; it is
 * never load-bearing for the thing the visitor actually asked for.
 */
export function useDusk() {
  const [t, setT] = useState(0);
  const [sweep, setSweep] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => () => { if (raf.current !== null) cancelAnimationFrame(raf.current); }, []);

  const play = useCallback((target: DuskTarget) => {
    if (typeof window === "undefined") return;
    if (raf.current !== null) cancelAnimationFrame(raf.current);

    const to = target === "night" ? 1 : 0;
    const from = 1 - to;
    const started = performance.now();

    const step = (now: number) => {
      const p = Math.min(1, (now - started) / DUSK_MS);
      // Ease so the horizon lingers where the colour is, instead of the sun
      // travelling at a constant speed and arriving like a lift.
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setT(from + (to - from) * eased);
      setSweep(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else raf.current = null;
    };

    setSweep(0);
    setT(from);
    raf.current = requestAnimationFrame(step);
  }, []);

  /**
   * Arrive already at day or night with no animation. Used on mount, when the
   * island's real clock says night: nobody asked for a transition they did not
   * trigger, and a page that dusks itself on arrival is a page that fought you
   * before you touched it.
   */
  const jump = useCallback((target: DuskTarget) => setT(target === "night" ? 1 : 0), []);

  return { t, sweep, play, jump };
}

/**
 * How opaque each layer is at a given point in the sunset.
 *
 * Pure, and exported, because the failure this component was rewritten to fix
 * is invisible to a type checker and to a screenshot taken at rest: a sunset
 * that averages its two endpoints into grey still renders, still animates, and
 * still looks wrong. lib/dusk.test.ts asserts the shape instead.
 */
export function layerOpacities(t: number) {
  return {
    day: Math.max(0, 1 - t * 2),
    night: Math.max(0, t * 2 - 1),
    warm: Math.sin(Math.PI * t),
    // The sun is gone by t≈0.59, before the moon appears at 0.62. They must not
    // overlap: a sun and a moon both hanging at a fifth of full brightness
    // reads as a rendering fault, not as a sky. The test enforces the gap.
    sun: Math.max(0, 1 - t * 1.7),
    moon: Math.max(0, (t - 0.62) * 3.4),
    stars: Math.max(0, (t - 0.66) * 3),
  };
}

export default function DuskSequence({ t, sweep }: { t: number; sweep: number }) {
  // Invisible at rest (sweep 0 and 1), fully opaque mid-transition. Because it
  // returns to 0 the overlay never sits between the reader and the page, and
  // pointer-events-none means it cannot intercept a tap even at full strength.
  const veil = Math.sin(Math.PI * sweep);
  if (veil <= 0.001) return null;

  // Day gone by the midpoint; night not started until after it. The warm sky
  // owns the middle entirely — see the note above.
  const { day, night, warm, sun, moon, stars } = layerOpacities(t);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      style={{ opacity: veil }}
    >
      {/* DAY — a clean tropical noon sky. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: day,
          background: "linear-gradient(180deg,#4FA8DE 0%,#8FD0EE 46%,#CFEAF7 78%,#EAF6FC 100%)",
        }}
      />

      {/* THE SUNSET ITSELF. Opaque at the midpoint, so the two endpoints can
          never average into grey behind it. These are the colours the sky over
          Rodrigues actually goes: violet at the top of the dome, through rose
          and amber, into a molten band at the horizon. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: warm,
          background:
            "linear-gradient(180deg,#2E1C58 0%,#7B3A73 26%,#C75C6A 48%,#F0885B 66%,#FFB25C 82%,#FFD79A 100%)",
        }}
      />

      {/* NIGHT — deep ocean navy, never flat black, so the stars have somewhere
          to sit. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: night,
          background: "linear-gradient(180deg,#050B1E 0%,#0A1330 44%,#141A3A 74%,#1B1330 100%)",
        }}
      />

      {/* The horizon burn — the beat that reads as "sunset" rather than "a
          fade". Strongest exactly where the warm sky is strongest. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: warm * 0.85,
          background:
            "radial-gradient(120% 55% at 50% 106%, rgba(255,146,54,0.85), rgba(255,94,58,0.28) 42%, transparent 68%)",
        }}
      />

      {/* THE SUN. Sinks and reddens as it goes, the way it does. Positioned by
          transform rather than top, so it composites instead of forcing layout
          on every frame. Stays luminous to the end — a dark sun is the bug this
          component was rewritten to kill. */}
      <div
        className="absolute left-1/2 h-24 w-24 rounded-full"
        style={{
          top: "10%",
          transform: `translate(-50%, ${t * 62}vh)`,
          opacity: sun,
          filter: `blur(${2 + t * 6}px)`,
          background:
            "radial-gradient(circle at 50% 50%,#FFFDF2 0%,#FFE9A8 34%," +
            `rgba(255,166,74,${0.9 - t * 0.2}) 62%, rgba(255,110,50,0) 76%)`,
        }}
      />

      {/* THE MOON, only once the sky is dark enough to justify one. */}
      <div
        className="absolute h-12 w-12 rounded-full"
        style={{
          right: "22%",
          top: `${22 - t * 9}%`,
          opacity: moon,
          background:
            "radial-gradient(circle at 38% 34%,#FFFDF6 0%,#EDEADB 58%,rgba(216,213,198,0) 72%)",
          boxShadow: "0 0 40px 10px rgba(240,238,225,0.18)",
        }}
      />

      {/* STARS. Emerge after the moon. */}
      <div className="absolute inset-0" style={{ opacity: stars }}>
        {STARS.map((st) => (
          <span
            key={st.k}
            className="absolute rounded-full bg-white"
            style={{ left: st.l, top: st.tp, width: 2, height: 2, opacity: st.o }}
          />
        ))}
      </div>
    </div>
  );
}
