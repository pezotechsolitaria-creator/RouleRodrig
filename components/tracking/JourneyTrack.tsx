"use client";

import { Check, Car } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// ── THE JOURNEY AS ONE LINE ─────────────────────────────────────────────────
//
// Horizontal, not the vertical list /taxi/track used to show. The difference is
// not decoration: a vertical list of six steps is a CHECKLIST — it asks the
// reader to find their place in it. A horizontal track with the vehicle sitting
// on it is a PICTURE of the journey, and the answer ("we are here, that far to
// go") arrives before any word is read.
//
// The vehicle rides the track at the current stage with its ETA called out
// above, which is the one number the customer opened the page for.
//
// ── LIGHT MODE ──────────────────────────────────────────────────────────────
// Every colour here is a utility that app/globals.css re-declares under
// `html.light` (bg-yellow, text-yellow, bg-white/10, border-white/10,
// text-offwhite, text-muted). Nothing uses a raw hex or an opacity variant the
// light layer does not cover, so the accent becomes blue on white by itself.

export type JourneyStage = {
  key: string;
  /** Shown under the track. Kept to one or two words — it sits in ~70px. */
  label: string;
};

export default function JourneyTrack({
  stages, at, calloutLabel, stalled = false,
}: {
  stages: JourneyStage[];
  /** Index of the stage in progress. Everything before it is done. */
  at: number;
  /** e.g. "12 min away". Omitted when there is no trustworthy ETA. */
  calloutLabel?: string | null;
  /** Position is stale: the vehicle stops asserting where it is. */
  stalled?: boolean;
}) {
  const { t } = useLanguage();
  const last = stages.length - 1;
  const current = Math.max(0, Math.min(at, last));

  return (
    <div className="pt-6">
      {/* The callout floats above the vehicle. Its own row rather than an
          absolute overlay, so it can never collide with the sheet above it. */}
      <div className="relative h-5">
        {calloutLabel && (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 font-dm text-[10px] font-bold text-offwhite"
            // Centred over the vehicle, but CLAMPED. Un-clamped, the first and
            // last stages put a ~90px pill half outside a 330px phone — the
            // label is a pointer, and a pointer that has fallen off the edge is
            // worse than one that is a few pixels shy of its target.
            style={{
              left: `${Math.min(82, Math.max(18, ((current + 0.5) / stages.length) * 100))}%`,
            }}
          >
            {calloutLabel}
          </span>
        )}
      </div>

      <ol className="flex items-center" aria-label={t.a11yMore.tripProgress}>
        {stages.map((s, i) => {
          const done = i < current;
          const isNow = i === current;
          const isEnd = i === last;
          return (
            <li
              key={s.key}
              className="flex flex-1 items-center last:flex-none"
              aria-current={isNow ? "step" : undefined}
            >
              {/* Every stage gets a name and a state. The visible label row
                  below is aria-hidden, so without this only the current stage
                  was reachable and the other four were invisible to assistive
                  technology. */}
              <span className="sr-only">
                {s.label}
                {done ? " — done" : isNow ? " — in progress" : " — still to come"}
              </span>
              {/* The node */}
              {isNow && !isEnd ? (
                // The vehicle. Bigger than the dots on purpose — it is the only
                // thing on this track that is happening right now.
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                    stalled ? "bg-white/10 text-muted" : "bg-yellow text-dark"
                  }`}
                >
                  <Car size={15} />
                </span>
              ) : isEnd ? (
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${
                    done || isNow
                      ? "border-yellow bg-yellow text-dark"
                      : "border-white/20 text-muted"
                  }`}
                >
                  <Check size={12} />
                </span>
              ) : (
                <span
                  className={`h-3 w-3 shrink-0 rounded-full ${
                    done ? "bg-yellow" : "bg-white/10"
                  }`}
                />
              )}

              {/* The rail to the next node. `done` fills it; the leg the vehicle
                  is currently driving stays empty, because it is not finished. */}
              {!isEnd && (
                <span
                  className={`mx-1.5 h-[3px] flex-1 rounded-full ${
                    done ? "bg-yellow" : "bg-white/10"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Labels, aligned under their nodes. aria-hidden because the <ol> above
          already announces the same words — a screen reader should hear the
          journey once, not twice. */}
      <div className="mt-2 flex" aria-hidden="true">
        {stages.map((s, i) => (
          <span
            key={s.key}
            className={`flex-1 font-dm text-[10px] leading-tight last:flex-none last:text-right ${
              i === current ? "font-bold text-offwhite" : "text-muted"
            } ${i === 0 ? "text-left" : "text-center"}`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
