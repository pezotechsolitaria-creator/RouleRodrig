"use client";

import { Sun, Moon } from "lucide-react";
import type { Mode } from "@/lib/time-of-day";

// ── The Day/Night control ───────────────────────────────────────────────────
//
// Two real buttons in a track, not a styled checkbox: this changes WHICH
// EXPERIENCES EXIST on the page, so it has to be operable and announced like
// the filter it is. A toggle reads as a preference; this is a choice between
// two catalogues.
//
// ── WHY IT IS NOT A CINEMATIC SEQUENCE ──────────────────────────────────────
// The brief asked for a 700–1200ms dusk animation — light softening, horizon
// darkening, stars emerging. It is a lovely idea and it is the wrong thing to
// put between a visitor and the list they asked for. A second of animation on
// every tap is a second of not browsing, on a phone, on island mobile data, and
// it is paid EVERY time rather than once. The atmosphere here is carried by the
// palette shift and the copy instead, both of which cost nothing and arrive
// instantly.
//
// The count on each side is the honest part: a Night button leading to an empty
// page is worse than no button, so the number is shown and a mode with nothing
// in it is disabled rather than left to disappoint.

export default function DayNightSwitch({
  mode,
  onChange,
  counts,
  cue,
  labels,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  counts: { day: number; night: number };
  /** Why this mode was chosen for them — shown so a dark page is explained. */
  cue: string;
  labels: { day: string; night: string };
}) {
  const opts: { key: Mode; icon: typeof Sun; label: string; count: number }[] = [
    { key: "day", icon: Sun, label: labels.day, count: counts.day },
    { key: "night", icon: Moon, label: labels.night, count: counts.night },
  ];

  return (
    <div className="mt-5">
      <div
        role="group"
        aria-label={`${labels.day} / ${labels.night}`}
        className="flex w-full gap-1 rounded-2xl border border-white/10 bg-dark-card p-1"
      >
        {opts.map((o) => {
          const on = mode === o.key;
          // Nothing to show is a reason to stop somebody going there, not a
          // reason to hide that the mode exists.
          const empty = o.count === 0;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              disabled={empty}
              aria-pressed={on}
              className={`flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-xl px-4 font-syne text-sm font-bold transition-colors ${
                on
                  ? o.key === "day"
                    ? "bg-yellow text-dark"
                    : "bg-white/10 text-offwhite ring-1 ring-inset ring-white/20"
                  : "text-muted hover:text-offwhite"
              } ${empty ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <o.icon size={16} className="shrink-0" />
              {o.label}
              <span className={`font-dm text-xs font-normal ${on ? "opacity-70" : "opacity-60"}`}>
                {o.count}
              </span>
            </button>
          );
        })}
      </div>
      {/* Live, because the list below changes when this does and a screen
          reader would otherwise get no notice of it. */}
      <p aria-live="polite" className="mt-2 font-dm text-xs text-muted">
        {cue}
      </p>
    </div>
  );
}
