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

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof translations.en;
  hasChosen: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => {},
  t: translations.en,
  hasChosen: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLang] = useState<Language>("en");
  const [hasChosen, setHasChosen] = useState(false);

  // Restore saved language on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Language | null;
      if (saved && ["en", "fr", "cr"].includes(saved)) {
        setLang(saved);
        setHasChosen(true);
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
    document.documentElement.lang = languageTag(language);
  }, [language]);

  function setLanguage(lang: Language) {
    setLang(lang);
    setHasChosen(true);
    try {
      localStorage.setItem(LS_KEY, lang);
    } catch {
      /* ignore */
    }
  }

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        // cast: all translations share the same structure; literal type differences are safe
        t: translations[language] as typeof translations.en,
        hasChosen,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
