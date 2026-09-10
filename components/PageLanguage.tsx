"use client";

import { useEffect } from "react";
import type { Language } from "@/lib/i18n";
import { useLanguage } from "@/context/LanguageContext";

// ── A PAGE WHOSE CONTENT IS IN ONE LANGUAGE, WHATEVER THE SWITCHER SAYS ─────
//
// The /fr/ landing pages are written in French. Their words do not change when
// somebody flips the header switch — they are hand-written French SEO pages,
// not translations of a shared template.
//
// ── WHAT THIS USED TO DO, AND WHY IT WAS NOT ENOUGH ─────────────────────────
// It set `document.documentElement.lang` and stopped there. That fixed the
// attribute a screen reader and Google read, and fixed nothing a customer saw:
// the header, the nav, "Book Now" and the entire footer are client components
// reading LanguageContext, and the context only ever knew the VISITOR's
// preference. So a French page served French prose inside English furniture,
// permanently, for anyone who had not separately switched the site to French.
//
// Measured on the live site before this change — all eleven /fr pages carried
// "EXPLORE THE ISLAND", "Island Map", "Book Now", "Sell with us",
// "Official visitor information and support", "Tag us in your Rodrigues
// adventures." and "Explore Rodrigues. Ride free. Premium scooter and car
// rental on the most beautiful island in the Indian Ocean." in English, every
// one of which has had a French translation in lib/i18n.ts the whole time.
//
// So it now claims the CONTEXT, and the provider owns `<html lang>` from the
// same value — one writer instead of two fighting over the attribute.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
// It does not save anything. The visitor's own choice is untouched, so
// navigating away from a French page returns them to the language they picked.
// And an explicit press of the switcher clears the claim (see setLanguage), so
// somebody who deliberately chooses English on a French page gets English
// chrome rather than a control that visibly does nothing.

export default function PageLanguage({ lang }: { lang: Language }) {
  const { forceLanguage } = useLanguage();

  useEffect(() => {
    forceLanguage(lang);
    return () => forceLanguage(null);
  }, [lang, forceLanguage]);

  return null;
}
