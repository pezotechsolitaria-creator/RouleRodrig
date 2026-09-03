"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { WORLD_COPY, type World } from "@/lib/worlds";

// ── NOBODY KNEW THERE WERE TWO ──────────────────────────────────────────────
//
// The switcher has always been a real control, with an aria-label that says
// "Change your Rodrigues". What a SIGHTED visitor sees is two words and an
// arrow — AUTHENTIC │ CURATED → — and nothing that reads as "these are two
// versions of the site and you may have the other one". So Curated existed
// behind a control nobody recognised as a door.
//
// This says it once. Not a permanent caption: the switcher lives in a header
// row measured down to 375px, where the account button was already being
// clipped off-screen, and there is no room to explain anything there forever.
// A visitor needs to be told once, and then never again.
//
// Shown on the visitor's FIRST sight of the switcher, dismissed by tapping it,
// by tapping the switcher itself, or after twelve seconds. Remembered in
// localStorage, so it does not reappear on every page of the same visit.

const SEEN_KEY = "rr_worlds_hint_seen";

const COPY: Record<"en" | "fr" | "cr", (other: string) => [string, string]> = {
  en: (other) => [
    "There are two Rodrigues",
    `Tap here for ${other} — a different way to see the island.`,
  ],
  fr: (other) => [
    "Il y a deux Rodrigues",
    `Touchez ici pour ${other} — une autre façon de voir l’île.`,
  ],
  cr: (other) => [
    "Ena de Rodrigues",
    `Tous isi pou ${other} — enn lot fason pou get lil la.`,
  ],
};

export default function WorldSwitchHint({ other }: { other: World }) {
  const { language } = useLanguage();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Read in a microtask rather than straight down the effect body: this repo
    // lints synchronous setState in an effect as an error, and the answer here
    // genuinely does come from outside React.
    void Promise.resolve().then(() => {
      let seen = true;
      try {
        seen = Boolean(localStorage.getItem(SEEN_KEY));
      } catch {
        // Private mode, or storage refused. Saying nothing is the safe side:
        // a hint that cannot remember being dismissed would come back forever.
        seen = true;
      }
      if (!cancelled && !seen) setShow(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => dismiss(), 12_000);
    return () => clearTimeout(t);
  }, [show]);

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* nothing to remember it with — it simply shows again next visit */
    }
    setShow(false);
  }

  if (!show) return null;

  const name = `${WORLD_COPY[other].eyebrow} ${WORLD_COPY[other].name}`;
  const [title, body] =
    COPY[language === "fr" ? "fr" : language === "cr" ? "cr" : "en"](name);

  return (
    // ── FIXED, NOT ANCHORED ─────────────────────────────────────────────
    // The first version centred itself on the switcher (absolute, left-1/2,
    // -translate-x-1/2). Measured at 375px that put it at left: -24px: the
    // switcher sits near the left of the header, and half of a 272px card is
    // wider than the space beside it, so the card hung off the screen and the
    // heading read "here are two Rodrigues". A screenshot showed it; the
    // element was present and correct in the DOM, which is exactly the kind of
    // bug that survives a test that only asks whether it rendered.
    //
    // Anchoring to an element near a viewport edge cannot be clamped in CSS
    // alone, so it no longer tries: fixed under the header, inset from both
    // edges, capped and centred. It still reads as belonging to the control
    // above it, and it fits at any width.
    <div
      role="status"
      className="fixed inset-x-3 top-[4.25rem] z-50 mx-auto w-auto max-w-[19rem] rounded-2xl border border-yellow/30 bg-dark-card/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="font-syne text-[13px] font-bold text-offwhite">{title}</p>
          <p className="mt-0.5 font-dm text-[11.5px] leading-relaxed text-muted">
            {body}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-0.5 -mt-0.5 shrink-0 rounded-full p-1 text-muted/60 transition-colors hover:text-offwhite"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

/** Mark the hint as seen — called when somebody uses the switcher unprompted. */
export function markWorldHintSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}
