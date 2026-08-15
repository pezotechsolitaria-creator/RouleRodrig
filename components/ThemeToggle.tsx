"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import DuskSequence, { useDusk } from "@/components/DuskSequence";

// ── Light, dark, or let the island decide ───────────────────────────────────
//
// Three states, not two. Auto follows RODRIGUES time, not the visitor's
// device: somebody planning a trip from Paris at midnight should see the island
// in daylight, because that is the place they are looking at. Choosing Light or
// Dark pins it for good.
//
// DARK REMAINS THE DEFAULT. This site's identity is the near-black-and-gold
// "Golden Hour" world; light is an option a visitor asks for, which is exactly
// what the owner specified. So the class written here is `light` — its absence
// is the normal state, and every surface that has never heard of this feature
// keeps working.

export type ThemeChoice = "light" | "dark";
// ── A NEW KEY, SO EVERY DEVICE STARTS AT DARK ───────────────────────────────
// The old key is deliberately abandoned rather than read. During the days this
// theme was being built, several intermediate builds wrote 'rr_theme' — and one
// of them made light the default, so devices are carrying a stored "light" that
// nobody ever chose. Reading that value cannot tell an accidental "light" from
// a deliberate one, so it is not read at all.
//
// Everything starts dark, which is this site's identity. Pressing Light writes
// the new key and sticks for good. Nothing has to be cleared by hand.
export const THEME_KEY = "rr_theme_v2";

/** What the document should look like for a choice. */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  return choice === "light" ? "light" : "dark";
}

export function readChoice(): ThemeChoice {
  // ── DARK UNLESS THE WORD IS EXACTLY "light" ───────────────────────────────
  // There used to be a third option, Auto, which followed the island clock. It
  // was removed because of what it did in practice: somebody taps it once,
  // and from then on the site is WHITE every afternoon on every device they
  // own, with nothing on screen connecting that to a switch they touched days
  // ago. That is indistinguishable from the site being broken, and it is
  // exactly how it was reported.
  //
  // Dark is this site's identity. Light is a preference somebody opts into,
  // and it stays until they opt out. Reading anything that is not the literal
  // "light" as dark also means a stored "auto" from before decays to dark by
  // itself — no migration, no clearing, no stale value surviving.
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.toggle("light", resolved === "light");

  // iOS paints Safari's chrome and the standalone status bar from
  // <meta name="theme-color">. It is static in the document head, so without
  // this a light page keeps a black status bar and a black notch area — the
  // one place a theme switch looks broken on an iPhone specifically, because
  // on Android the same meta only tints a slim bar nobody is looking at.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#F8F9FA" : "#0a0a0a");
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  // Nothing reads as selected until the client has read localStorage. The
  // server cannot know the choice, and claiming one for a frame is a visible
  // lie — and, as this page learned the hard way elsewhere, a server/client
  // disagreement is what breaks hydration and silently kills every handler.
  const [ready, setReady] = useState(false);
  const { t, sweep, play, jump } = useDusk();

  useEffect(() => {
    const c = readChoice();
    // localStorage cannot be read on the server, so claiming a selected button
    // during render is a guess that breaks hydration. Nothing reads as chosen
    // until this runs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(c);
    setReady(true);
    // Start the sky where the page already is, so the first switch sweeps from
    // the right place rather than from an assumed daytime.
    jump(c === "light" ? "day" : "night");
  }, [jump]);

  function pick(next: ThemeChoice) {
    // Compare against what is ACTUALLY on screen, not against React state.
    // State lags by a render, so guarding on it swallowed any second press that
    // arrived before React had re-rendered — the control looked dead exactly
    // when somebody was tapping it quickly, which is when they are least
    // patient. The document class cannot lag; it is the thing being changed.
    const current: ThemeChoice =
      document.documentElement.classList.contains("light") ? "light" : "dark";
    if (next === current) return;

    setChoice(next);
    localStorage.setItem(THEME_KEY, next);

    // ── THE SUNSET RUNS OVER THE TOP OF AN ALREADY-CORRECT PAGE ─────────────
    // The theme commits first and the dusk is decoration, exactly as on the
    // experiences hub. The alternative — applying the theme when the animation
    // finishes — makes the control feel broken anywhere requestAnimationFrame
    // is throttled, which is every backgrounded tab.
    applyTheme(resolveTheme(next));
    play(next === "light" ? "day" : "night");
  }

  const opts: { key: ThemeChoice; icon: typeof Sun; label: string }[] = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "dark", icon: Moon, label: "Dark" },
  ];

  return (
    <>
      {/* Same component, same colours, same 1200ms as the experiences hub —
          switching the whole site's light is at least as much of a moment as
          switching one page's. */}
      <DuskSequence t={t} sweep={sweep} />
      <div
        role="group"
        aria-label="Appearance"
        className="flex w-full gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1"
      >
        {opts.map((o) => {
          const on = ready && choice === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => pick(o.key)}
              aria-pressed={on}
              className={`flex min-h-[46px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 font-dm text-xs font-semibold transition-colors ${
                on ? "bg-yellow text-dark" : "text-muted hover:text-offwhite"
              }`}
            >
              <o.icon size={14} className="shrink-0" />
              {o.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
