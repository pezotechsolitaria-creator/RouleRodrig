"use client";

import { useEffect } from "react";

// ── A PAGE WHOSE CONTENT IS IN ONE LANGUAGE, WHATEVER THE SWITCHER SAYS ─────
//
// The three /fr/ landing pages are written in French. Their words do not change
// when somebody flips the header switch to English — they are hand-written
// French SEO pages, not translations of a shared template. So `<html lang>` on
// those routes describes the CONTENT, not the reader's preference.
//
// Verified on the live site before this existed: /fr/plages-rodrigues served
// `<html lang="en">` while rendering `<h1>Les 12 plus belles plages de
// Rodrigues</h1>`. Google uses `lang` as one signal for which audience a page
// serves, and a screen reader uses it to choose how to pronounce every word on
// it — French read with English phonetics.
//
// ── WHY IT NEEDS A LOCK, NOT JUST AN ASSIGNMENT ─────────────────────────────
// context/LanguageContext.tsx also writes documentElement.lang, from the
// reader's chosen language. Without the flag below, an English-preferring
// visitor landing on a French page would have `lang` corrected to "fr" here and
// then immediately overwritten with "en" by the provider — the two would fight
// on every render, and the last writer would win by accident.
//
// The flag makes the precedence explicit and gives the right answer: a page
// that IS in a language beats a preference about what language to show.

export default function PageLanguage({ lang }: { lang: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = lang;
    root.dataset.langLocked = "1";
    return () => {
      delete root.dataset.langLocked;
      // Hand it back as it was, so navigating away from a French page does not
      // leave the rest of the site claiming to be French.
      root.lang = previous;
    };
  }, [lang]);

  return null;
}
