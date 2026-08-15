"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Clock } from "lucide-react";
import { defaultMode } from "@/lib/time-of-day";

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

export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_KEY = "rr_theme";

/** What the document should look like for a choice, at a moment in time. */
export function resolveTheme(choice: ThemeChoice, now: Date = new Date()): "light" | "dark" {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return defaultMode(now) === "day" ? "light" : "dark";
}

export function readChoice(): ThemeChoice {
  // DARK unless explicitly chosen. Auto is still selectable, but it is no
  // longer what an unconfigured visitor gets — see the note above applyTheme.
  if (typeof localStorage === "undefined") return "dark";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "auto" ? v : "dark";
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

  useEffect(() => {
    setChoice(readChoice());
    setReady(true);
  }, []);

  // Auto must keep up: somebody with the page open at sunset should see it
  // change. Every five minutes is cheap and the boundary is crossed twice a day.
  useEffect(() => {
    if (!ready || choice !== "auto") return;
    const tick = () => applyTheme(resolveTheme("auto"));
    tick();
    const id = window.setInterval(tick, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [choice, ready]);

  function pick(next: ThemeChoice) {
    setChoice(next);
    // Every choice is stored now, including auto — with dark as the default,
    // "no value" can no longer mean auto.
    localStorage.setItem(THEME_KEY, next);
    applyTheme(resolveTheme(next));
  }

  const opts: { key: ThemeChoice; icon: typeof Sun; label: string }[] = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "dark", icon: Moon, label: "Dark" },
    { key: "auto", icon: Clock, label: "Auto" },
  ];

  return (
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
  );
}
