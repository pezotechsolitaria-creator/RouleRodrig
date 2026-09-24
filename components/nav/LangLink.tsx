"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Language } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";

// ── THE FRENCH PAGE'S BUTTON LANDED THEM IN ENGLISH ─────────────────────────
//
// /fr/taxi-rodrigues is a French page. Its "Réserver une course" button goes to
// /taxi/book — and the booking form there is a client component reading
// LanguageContext, which at that point knows nothing about where the visitor
// came from. PageLanguage's claim is per-route and released on unmount by
// design, so the form opened in English: pickup, drop-off, "When?", the price
// note, the confirmation. The same happened on the nine other buttons that
// lead out of a French page and into the app — stays, tours, scooter, car,
// food, experiences, the driver list.
//
// That is the worst place to lose somebody. They read three screens of French,
// pressed the one button that commits them, and the language changed under
// them at the exact moment they were being asked for their phone number.
//
// ── WHY NOT ?lang=fr ────────────────────────────────────────────────────────
//
// The obvious fix is a query parameter the provider reads. It does not work
// here: the provider lives in the root layout and mounts once, so it would
// only see the parameter on a full page load and never on the client-side
// navigation a <Link> actually performs. Reading it live would mean
// useSearchParams() in the provider, which opts the entire tree out of static
// rendering — the same trade app/fr/layout.tsx refused, and for more pages.
// It would also put a duplicate URL of every destination into the index.
//
// A click is not ambiguous, and it happens on the page we already know the
// language of. So the link says it.
//
// ── ONLY WHEN NOBODY HAS SAID OTHERWISE ─────────────────────────────────────
//
// `hasChosen` is the guard. These French pages are the best-performing writing
// on this site and English speakers land on them from search too; a button
// that silently switched the whole site to French would be a worse bug than
// the one this fixes. So an explicit press of the switcher always wins, and
// this only speaks for a visitor who has not expressed a preference at all.
//
// The first version of this shipped inert, and only driving it showed why:
// `hasChosen` meant "rr_language has a value", and app/layout.tsx's pre-paint
// script writes one on first load from navigator.language. It was true for
// everybody, so the guard skipped every time. LanguageContext now records the
// press itself under a separate key — see "SAVED IS NOT CHOSEN" there.
export default function LangLink({
  lang,
  href,
  className,
  children,
}: {
  /** The language of the PAGE this link sits on, not the destination's. */
  lang: Language;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const { setLanguage, hasChosen } = useLanguage();

  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        // Synchronous: setLanguage writes the cookie before the router starts
        // the navigation, so the destination's server render already agrees.
        if (!hasChosen) setLanguage(lang);
      }}
    >
      {children}
    </Link>
  );
}
