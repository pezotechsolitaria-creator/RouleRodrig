"use client";

import type { MouseEvent } from "react";
import { useLanguage } from "@/context/LanguageContext";

// ── "Skip to content" (architecture review 2026-09-30, a11y item 3) ─────────
//
// There was no skip link anywhere on the site, so a keyboard or switch user
// tabbed through the announcement bar and every header control on every page
// before reaching what they came for. This is the first focusable element in
// the root layout: hidden above the viewport until it takes focus, then shown
// top-left with the site's own focus ring (globals.css draws it — gold on the
// dark theme, the blue accent in light mode, which is a contrast decision this
// does not override).
//
// ── WHERE IT LANDS ───────────────────────────────────────────────────────────
// The page's main landmark. About a hundred pages render their own <main>, and
// none carried an id, so the target is found when the link is used: an element
// with id="main-content" if the page marks one, otherwise the first <main>.
// Found at click time, not at mount, because client navigation swaps the page
// under a layout that never remounts. The href keeps the link meaningful
// before hydration, on pages whose <main> carries the id.

export const SKIP_TARGET_ID = "main-content";

const LABEL = {
  en: "Skip to content",
  fr: "Aller au contenu",
  cr: "Al direk lor paz",
} as const;

/** The page's main landmark, or null when the page has none. */
export function skipTarget(doc: Pick<Document, "getElementById" | "querySelector">): HTMLElement | null {
  return doc.getElementById(SKIP_TARGET_ID) ?? doc.querySelector<HTMLElement>("main");
}

type Focusable = Pick<
  HTMLElement,
  "hasAttribute" | "setAttribute" | "removeAttribute" | "focus" | "addEventListener"
> & { style: { outline: string } };

/**
 * Moves keyboard focus to `el`. A <main> is not focusable by itself, so it gets
 * tabindex="-1" for as long as it holds focus — left on, a mouse click anywhere
 * in the page would focus the whole landmark. Its outline is held off for the
 * same span: a ring around the entire page says nothing the next Tab will not,
 * and the next Tab lands on the first control inside it.
 */
export function focusSkipTarget(el: Focusable): void {
  const added = !el.hasAttribute("tabindex");
  if (added) el.setAttribute("tabindex", "-1");
  const outline = el.style.outline;
  el.style.outline = "none";
  el.addEventListener(
    "blur",
    () => {
      if (added) el.removeAttribute("tabindex");
      el.style.outline = outline;
    },
    { once: true },
  );
  el.focus();
}

export default function SkipLink() {
  const { language } = useLanguage();

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    const target = skipTarget(document);
    if (!target) return; // no landmark: the plain fragment link is all there is
    e.preventDefault();
    focusSkipTarget(target);
  }

  return (
    <a
      href={`#${SKIP_TARGET_ID}`}
      onClick={onClick}
      className="fixed left-4 top-0 z-[1000] inline-flex min-h-11 -translate-y-full items-center rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark focus:translate-y-4 focus:shadow-lg"
    >
      {LABEL[language] ?? LABEL.en}
    </a>
  );
}
