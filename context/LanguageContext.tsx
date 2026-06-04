"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Language } from "@/lib/i18n";
import { translations } from "@/lib/i18n";

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
