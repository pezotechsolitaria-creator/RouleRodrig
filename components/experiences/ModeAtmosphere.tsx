"use client";

import type { Mode } from "@/lib/time-of-day";

// ── The page changes weather, not colour scheme ─────────────────────────────
//
// Day and Night have to FEEL different or the switch is just a filter with a
// sun on it. But this site already has a design system with one rule that
// matters here, written in DESIGN.md and re-learned the hard way on the
// homepage: gold is the only accent, and a second saturated colour makes gold
// stop meaning anything. The six home cards were once four competing hues and
// had to be pulled back to a single gold ramp for exactly that reason.
//
// So night does NOT introduce a blue accent. It changes the GROUND — the light
// the page sits in — and leaves gold doing the wayfinding in both modes:
//
//   Day   → a warm, high sun: gold haze from the top, the existing feel.
//   Night → a cool, deep ground with the horizon glow low in the frame, which
//           is the "ember-orange bloom low in the frame" DESIGN.md already
//           describes, dimmed and cooled.
//
// Fixed and behind everything (-z-10), so it costs no layout and cannot push
// content around when it changes. Only `opacity` and `background` animate, both
// compositor-friendly; there is no filter, no blur and no per-frame JS.
//
// NO STAR FIELD. It was in the brief and it is a lot of moving pixels above the
// fold on a phone, for atmosphere the gradient already carries. If it is wanted
// later it belongs in a canvas that stops when the tab is hidden — not thirty
// animated divs.

export default function ModeAtmosphere({ mode }: { mode: Mode }) {
  return (
    <div
      aria-hidden="true"
      // Decorative only, and announced to nobody: a screen reader gains nothing
      // from being told the background is duskier.
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Two stacked grounds cross-fading, rather than one element whose
          background transitions — gradients do not interpolate reliably across
          browsers, and a half-interpolated gradient is a visible band. */}
      <div
        className={`absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(245,200,66,0.10),transparent_60%)] transition-opacity duration-700 motion-reduce:transition-none ${
          mode === "day" ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
          mode === "night" ? "opacity-100" : "opacity-0"
        }`}
        style={{
          // Cooler and deeper than the page's own #0a0a0a, with the warm bloom
          // pushed to the bottom of the frame where a horizon would be.
          background:
            "radial-gradient(120% 70% at 50% -20%, rgba(28,38,66,0.55), transparent 55%)," +
            "radial-gradient(90% 45% at 50% 108%, rgba(245,200,66,0.07), transparent 60%)",
        }}
      />
    </div>
  );
}
