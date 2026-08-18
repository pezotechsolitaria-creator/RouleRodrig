"use client";

import { useEffect, useState } from "react";

// ── The arrival sequence, in one place ──────────────────────────────────────
//
// Both heroes now play the same opening: the headline is WRITTEN a letter at a
// time, held long enough to actually read, and then dissolves into the footage.
// It was built for the Authentic homepage and tuned there over several rounds,
// so this is that timeline extracted rather than a second one invented for
// Curated — two hero intros drifting apart is exactly the kind of split that
// makes "make it a bit slower" a two-file job with one file forgotten.
//
// Everything here is pure and framework-free on purpose: no framer-motion, no
// component, just the numbers and the two pieces of browser state the sequence
// depends on. That is what makes it safe for a component to import.

/**
 * The hero's opening timeline. Every value is seconds unless the name says MS.
 *
 * Slow on purpose. The owner asked for roughly ten seconds end to end: each
 * letter placed deliberately rather than typed, a long enough pause to actually
 * read the phrase, and an unhurried dissolve into the footage.
 *
 * Measured from the moment the launch splash lifts, not from page load — the
 * splash owns the first ~1.9s and the headline waits for it (see useSplashGate).
 *
 *   START + (letters - 1) x STAGGER + LETTER   the phrase completes   ~4.8s
 *   + HOLD_MS                                  it is held             ~7.3s
 *   + DISSOLVE / REVEAL                        it opens into video    ~8.9s
 *
 * STAGGER is set from a 6s completion target rather than chosen for feel: with
 * nine letters it is the only value that moves that moment. It was tuned by
 * measuring — 0.37 landed at 5.1s and 0.47 at 6.3s, so 0.45 sits on the mark.
 *
 * Tuning: STAGGER is the rhythm, HOLD_MS is how long it sits. Those two are
 * what to change; the rest only affect how soft each individual move is.
 */
export const INTRO = {
  START: 0.25,
  STAGGER: 0.45,
  LETTER: 0.9,
  LINE_GAP: 0.7,
  HOLD_MS: 2500,
  DISSOLVE: 1.6,
  REVEAL: 1.7,
} as const;

/**
 * Has the launch splash lifted?
 *
 * The installed-app splash covers the whole page for 1.8s on a first visit
 * (app/layout.tsx). The letters finish in about a second, so without this the
 * entire reveal happens UNDERNEATH it and the one visitor it was built for —
 * the first-time one — never sees a thing. That was caught by screenshotting
 * the real page at 620ms and finding the splash, not the hero.
 *
 * The splash announces itself with data-splash on <html> and removes the
 * attribute when it finishes, including when a tap skips it early, so this
 * follows it exactly rather than racing a hardcoded delay.
 */
export function useSplashGate(): boolean {
  const [open, setOpen] = useState(
    // Evaluated during render, not in an effect: setting it afterwards would
    // let one frame through with the letters already animating, and would also
    // be a cascading render. SSR has no document, so it defaults to open —
    // correct, because the splash only ever exists on the client.
    () => typeof document === "undefined" || !document.documentElement.hasAttribute("data-splash"),
  );

  useEffect(() => {
    const html = document.documentElement;
    if (!html.hasAttribute("data-splash")) return;
    const mo = new MutationObserver(() => {
      if (!html.hasAttribute("data-splash")) {
        setOpen(true);
        mo.disconnect();
      }
    });
    mo.observe(html, { attributes: true, attributeFilter: ["data-splash"] });
    // Belt and braces: if the splash ever failed to clean up, the headline must
    // still arrive rather than stay invisible for ever.
    const failsafe = window.setTimeout(() => {
      setOpen(true);
      mo.disconnect();
    }, 3000);
    return () => {
      mo.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return open;
}

/**
 * Has the reader asked for less motion?
 *
 * Distinct from framer-motion's useReducedMotion, which is read synchronously
 * during render. This one tracks CHANGES to the preference, and is what gates
 * the parts of the sequence that make content leave the screen on its own —
 * precisely the unrequested movement the setting is about.
 */
export function useCalm(): boolean {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return calm;
}

/**
 * When the last letter lands, in milliseconds after the gate opens.
 *
 * Derived from the copy rather than hardcoded, so editing a headline in admin
 * cannot leave the timing describing a sentence that no longer exists. Takes
 * the LONGEST line: lines are staggered against each other by LINE_GAP, but the
 * phrase is not complete until the widest one has finished writing.
 */
export function lettersDoneMs(lines: (string | undefined | null)[]): number {
  const longest = lines
    .filter((l): l is string => !!l?.trim())
    .reduce((n, l) => Math.max(n, [...l].length), 0);
  return (INTRO.START + Math.max(0, longest - 1) * INTRO.STAGGER + INTRO.LETTER) * 1000;
}

/**
 * The whole sequence as one boolean: has the headline had its moment?
 *
 * `false` until the gate opens, the letters finish and the hold elapses; then
 * `true` for good. Callers use it to dissolve the words and lift the scrim off
 * the footage in one movement.
 *
 * ── IT RUNS ON ITS OWN CLOCK, NOT THE VIDEO'S ─────────────────────────────
 * The headline used to leave only when footage happened to start, so on a slow
 * connection the words simply sat there and the arrival never resolved. Worse,
 * when the video WAS quick it took the text with it — measured at 9.5s on one
 * load and 9.0s on the next with slower settings, because the player beat the
 * timer. A sequence the owner asked to be ten seconds cannot be at the mercy of
 * a third-party player's buffering.
 *
 * `hasVideo` gates it because without footage the headline IS the hero: there
 * is nothing behind it to dissolve into, and removing it would leave a bare
 * photograph. Reduced motion never reveals, for the same reason.
 */
export function useHeroReveal(input: {
  hasVideo: boolean;
  calm: boolean;
  /** The headline, one entry per line. */
  lines: (string | undefined | null)[];
}): boolean {
  const gateOpen = useSplashGate();
  const [revealed, setRevealed] = useState(false);
  const done = lettersDoneMs(input.lines);

  useEffect(() => {
    if (!gateOpen || !input.hasVideo || input.calm) return;
    // A real pause, not a beat. The phrase has to be readable at a glance and
    // then sit there long enough to register before the island takes over.
    const t = window.setTimeout(() => setRevealed(true), done + INTRO.HOLD_MS);
    return () => window.clearTimeout(t);
  }, [gateOpen, input.hasVideo, input.calm, done]);

  return revealed;
}
