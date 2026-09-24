import type { ReactNode } from "react";

// ── THESE PAGES ARE FRENCH BEFORE ANY JAVASCRIPT RUNS ───────────────────────
//
// The root layout hardcodes `<html lang="en">`, and its comment explains why:
// the visitor's chosen language lives in localStorage, so the SERVER cannot
// know it. That reasoning is sound for every page whose language is a
// preference — and wrong for these, whose language is the URL. /fr/plages-
// rodrigues is French for everybody, always.
//
// components/PageLanguage.tsx corrects document.documentElement.lang, but it
// is a client component inside a useEffect, so the SERVED html — what a screen
// reader speaks on first paint, and what anything that does not run JavaScript
// reads — said English over French prose. A French screen-reader user heard
// French read with English phonemes until hydration.
//
// ── WHY A WRAPPER AND NOT `<html lang="fr">` ────────────────────────────────
//
// Only the ROOT layout renders <html>, and the only way it could know the path
// is headers(), which opts the whole tree into dynamic rendering. Five of
// these twelve pages are statically generated today; trading that for an
// attribute would cost every visitor more than it gains. `lang` inherits down
// the DOM, so declaring it here is what WCAG calls Language of Parts and it
// gives assistive technology the right pronunciation from the first byte.
//
// An undecorated <div> with no class: it inherits nothing, styles nothing, and
// the pages below render exactly as they did.
export default function FrenchLayout({ children }: { children: ReactNode }) {
  return <div lang="fr">{children}</div>;
}
