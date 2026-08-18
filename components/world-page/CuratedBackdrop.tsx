"use client";

import { motion } from "framer-motion";

// ── The Curated hero's own visual system ────────────────────────────────────
//
// The Authentic homepage opens on an animated backdrop — glowing blobs,
// topographic contour rings, drawn route lines, floating particles — in yellow
// and orange. Curated asked for the same idea, and the wrong way to give it is
// to import that component: its palette IS the Authentic brand, and a copper
// page wearing highway-yellow route lines would look like a mistake.
//
// So this is the same GRAMMAR in Curated's language, and quieter in every
// dimension, because it plays inside a ~290px inset card rather than behind a
// full-bleed 60vh hero:
//
//   · two drifting glows instead of two blobs plus contour rings
//   · ONE horizon line, drawn once, instead of two looping dashed routes
//   · six motes instead of ten
//
// ── FIXED POSITIONS, ON PURPOSE ────────────────────────────────────────────
// Every coordinate below is a literal. Randomising them would render different
// markup on the server and the client, and this project has already paid for
// one hydration mismatch in a hero.
//
// Purely decorative: pointer-events-none and aria-hidden throughout. Nothing
// here carries meaning, so a screen reader must never meet it.

const MOTES = [
  { left: "12%", top: "34%", size: 2, dur: 9, delay: 0 },
  { left: "28%", top: "72%", size: 3, dur: 11, delay: 1.4 },
  { left: "46%", top: "26%", size: 2, dur: 8.5, delay: 0.7 },
  { left: "63%", top: "64%", size: 3, dur: 10.5, delay: 2.1 },
  { left: "79%", top: "38%", size: 2, dur: 9.5, delay: 1.1 },
  { left: "91%", top: "70%", size: 2, dur: 12, delay: 2.6 },
];

/**
 * `colour` at `pct` opacity, whatever notation the editor typed.
 *
 * The first version of this appended a hex alpha pair — `${accent}2E` — which
 * is correct for #C08457 and produces garbage for `rgb(192 132 87)`, `copper`
 * or a `var(--cur-champagne)`. The admin field takes ANY CSS colour, so the
 * component has to as well, and color-mix is the notation-independent way to
 * say "this colour, fainter".
 */
const alpha = (colour: string, pct: number) =>
  `color-mix(in srgb, ${colour} ${pct}%, transparent)`;

export default function CuratedBackdrop({
  accent,
  /** Off leaves the colour flat and completely still. */
  animated = true,
}: {
  accent: string;
  animated?: boolean;
}) {
  // A still backdrop is a legitimate editorial choice, not a degraded one, so
  // it keeps the same glows — it simply does not move them. Rendering nothing
  // would leave a flat rectangle where the editor asked for depth.
  const drift = (to: Record<string, number[]>, duration: number) =>
    animated ? { animate: to, transition: { duration, repeat: Infinity, ease: "easeInOut" as const } } : {};

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Two glows, warm and low-contrast. blur-3xl on a pair of elements is
          cheap; the same look built from many small nodes is not. */}
      <motion.div
        className="absolute -right-1/4 -top-1/3 h-[70%] w-[80%] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${alpha(accent, 18)}, transparent 68%)` }}
        {...drift({ opacity: [0.5, 0.9, 0.5], scale: [1, 1.09, 1] }, 12)}
      />
      <motion.div
        className="absolute -bottom-1/3 -left-1/4 h-[70%] w-[75%] rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${alpha(accent, 12)}, transparent 68%)` }}
        {...drift({ opacity: [0.35, 0.7, 0.35], scale: [1.06, 1, 1.06] }, 15)}
      />

      {/* One horizon, drawn once and then left alone. The homepage's routes
          loop their dash offset for ever, which reads as live navigation and is
          exactly right there; here it would be movement with nothing to say. */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1440 600"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <motion.path
          d="M-40 430 C 260 350, 470 470, 720 396 S 1180 250, 1480 330"
          stroke={accent}
          strokeWidth="1.25"
          strokeLinecap="round"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 0.28 }}
          transition={{ pathLength: { duration: 3.2, ease: "easeInOut" }, opacity: { duration: 1.4 } }}
        />
        <motion.path
          d="M-40 500 C 300 452, 520 546, 780 470 S 1200 348, 1480 412"
          stroke={accent}
          strokeWidth="1"
          strokeLinecap="round"
          initial={animated ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 0.14 }}
          transition={{
            pathLength: { duration: 3.6, ease: "easeInOut", delay: 0.35 },
            opacity: { duration: 1.4, delay: 0.35 },
          }}
        />
      </svg>

      {MOTES.map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            left: m.left,
            top: m.top,
            width: m.size,
            height: m.size,
            // Still motes sit at a flat mid-opacity rather than at the bottom
            // of a breath they are no longer taking.
            backgroundColor: alpha(accent, animated ? 60 : 34),
          }}
          {...(animated
            ? {
                animate: { y: [0, -14, 0], opacity: [0.15, 0.55, 0.15] },
                transition: {
                  duration: m.dur,
                  repeat: Infinity,
                  ease: "easeInOut" as const,
                  delay: m.delay,
                },
              }
            : {})}
        />
      ))}

    </div>
  );
}
