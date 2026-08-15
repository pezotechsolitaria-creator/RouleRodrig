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
    // ── THE SUN HAS TO BE A SUN ─────────────────────────────────────────────
    // It used to fade from the first frame, so by the midpoint — which is the
    // moment anyone photographing this actually catches — it was at 15% and
    // simply not there. All you saw was a coloured wash, which is precisely
    // how it was reported: "it does not look like a sun".
    //
    // It is now FULLY BRIGHT for the first 60% and only dims as it goes under
    // the horizon, which is what a setting sun does. The moon takes over
    // exactly where it lands, so the two are still never on screen together.
    sun: t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) * 5),
    moon: Math.max(0, (t - 0.8) * 5),
    stars: Math.max(0, (t - 0.84) * 6.25),
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
          never average into grey behind it.

          The first attempt at these stops began #2E1C58 → #7B3A73 → #C75C6A —
          violet into rose — and on a phone the top two thirds of the screen
          read as dark maroon. It looked like a warning state, not an evening.
          A tropical sunset keeps BLUE overhead and confines the warmth to the
          bottom of the sky, so that is what these stops do: the dome stays
          oceanic, and the fire sits low where the sun actually is. */}
      <div
        className="absolute inset-0"
        style={{
          opacity: warm,
          background:
            "linear-gradient(180deg,#123A6B 0%,#2E6FA8 22%,#6BA3C4 40%,#C6A98E 56%,#F2A15C 72%,#FF8A47 88%,#FFC98A 100%)",
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

      {/* THE SUN. A hard-edged disc with a halo around it, not a soft smudge.
          The previous one was a 96px blurred gradient at partial opacity, and
          against a bright sky that is not a sun — it is a slightly lighter
          patch. A sun is read from its EDGE: a definite bright circle sitting
          inside a glow. So the core is opaque white-gold with a crisp boundary,
          the halo is a separate box-shadow, and only the halo softens.

          Positioned by transform rather than top, so it composites instead of
          forcing layout on every frame. */}
      <div
        className="absolute left-1/2 h-32 w-32 rounded-full"
        style={{
          top: "12%",
          transform: `translate(-50%, ${t * 64}vh)`,
          opacity: sun,
          background:
            "radial-gradient(circle at 50% 50%,#FFFEF7 0%,#FFF3C4 46%,#FFD976 74%,#FFC24E 100%)",
          boxShadow:
            "0 0 60px 24px rgba(255,214,120,0.55), 0 0 140px 60px rgba(255,150,60,0.35)",
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
