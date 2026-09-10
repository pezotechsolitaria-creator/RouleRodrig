"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { Language } from "@/lib/i18n";
import { languageTag, translations } from "@/lib/i18n";

const LS_KEY = "rr_language";

// ── The same choice, where the SERVER can see it ───────────────────────────
//
// localStorage is invisible to the server, and that single fact decided which
// pages could be translated and which could not. Every client component could
// read the visitor's language; every server-rendered page — the legal pages,
// the island guides, the account page — could not, so they stayed English no
// matter what the switcher said. It looked like nobody had translated them. In
// fact they had no way to ask.
//
// A cookie is readable in both places, so writing the choice to one as well is
// the whole unlock. Deliberately NOT httpOnly: the client half still owns this
// value and must be able to write it. It carries nothing private — it is one of
// three known strings — so the only thing to get right is that it is scoped to
// this site and survives a return visit.
//
// `SameSite=Lax` rather than Strict: a visitor arriving from a Google result or
// a WhatsApp link should land in the language they chose last time, and Strict
// would withhold the cookie on exactly that first navigation.
const COOKIE_KEY = "rr_lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a year

function writeCookie(lang: Language) {
  try {
    document.cookie =
      `${COOKIE_KEY}=${lang}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax` +
      (location.protocol === "https:" ? "; Secure" : "");
  } catch {
    /* cookies unavailable — localStorage still holds the choice for the client */
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
  hasChosen: boolean;
  /** A page that IS written in one language claims it — see PageLanguage. */
  forceLanguage: (lang: Language | null) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: translations.en,
  hasChosen: false,
  forceLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [chosen, setLang] = useState<Language>("en");
  const [hasChosen, setHasChosen] = useState(false);

  // ── A PAGE WRITTEN IN A LANGUAGE SPEAKS THAT LANGUAGE ────────────────────
  //
  // PageLanguage used to set `<html lang="fr">` and nothing else. So every
  // /fr/ page served its hand-written French body inside ENGLISH chrome —
  // header, nav, "Book Now", the whole footer — for ever, because the chrome
  // is client components reading THIS context and the context only ever knew
  // the visitor's own preference. Measured on the live site: eleven of eleven
  // French pages, each carrying "Explore Rodrigues. Ride free.",
  // "Official visitor information and support", "Sell with us" and
  // "We love a plastic-free Rodrigues" in English.
  //
  // The lock is per-route and does NOT touch the saved preference, so leaving
  // the page puts the visitor back in the language they actually chose.
  const [forced, setForced] = useState<Language | null>(null);
  const language = forced ?? chosen;

  // Restore saved language on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Language | null;
      if (saved && ["en", "fr", "cr"].includes(saved)) {
        setLang(saved);
        setHasChosen(true);
        // Backfill for everyone who chose a language before the cookie existed.
        // Without this, a returning visitor keeps getting English server pages
        // forever, because the only record of their choice is one the server
        // cannot read.
        writeCookie(saved);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // ── Tell the DOCUMENT, not just React ────────────────────────────
  // Every string on screen could be Kreol while <html lang> still said "en",
  // because nothing in the repo ever wrote that attribute — it was a literal in
  // app/layout.tsx and had no writer at all. A screen reader takes its
  // pronunciation rules from there, so Kreol and French were being read aloud
  // with English phonetics, to the users this site is least able to afford
  // losing. Chrome also kept offering to translate pages already in the
  // reader's language.
  //
  // The pre-paint script in app/layout.tsx sets this for the FIRST load, before
  // anything is drawn. This effect exists for what happens after: the language
  // button is a cycle (en -> fr -> cr), and without this the attribute would go
  // stale the moment somebody pressed it.
  useEffect(() => {
    // A page written IN a language owns the attribute — see
    // components/PageLanguage.tsx. The /fr landing pages stay French for a
    // reader whose switcher says English, because their words do not change.
    document.documentElement.lang = languageTag(language);
  }, [language]);

  function setLanguage(lang: Language) {
    // An explicit press beats the route's claim. Somebody standing on a French
    // page who deliberately picks English means it, and a switcher that
    // visibly does nothing is worse than either language.
    setForced(null);
    setLang(lang);
    setHasChosen(true);
    try {
      localStorage.setItem(LS_KEY, lang);
    } catch {
      /* ignore */
    }
    writeCookie(lang);
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        // cast: all translations share the same structure; literal type differences are safe
        t: translations[language] as typeof translations.en,
        hasChosen,
        forceLanguage: setForced,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
