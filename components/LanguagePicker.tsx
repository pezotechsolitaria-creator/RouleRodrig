"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import {
  LANGUAGE_FLAGS,
  LANGUAGE_NATIVE,
  LANGUAGE_SAMPLE,
  translations,
  type Language,
} from "@/lib/i18n";

const LANGS: Language[] = ["en", "fr", "cr"];

export default function LanguagePicker() {
  const { hasChosen, setLanguage } = useLanguage();

  // Lock vertical scroll while picker is visible (overflow-x untouched)
  useEffect(() => {
    document.body.style.overflowY = hasChosen ? "" : "hidden";
    return () => { document.body.style.overflowY = ""; };
  }, [hasChosen]);

  return (
    <AnimatePresence>
      {!hasChosen && (
        <motion.div
          key="language-picker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-[200] bg-dark flex flex-col items-center justify-center px-5"
        >
          {/* Soft glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[500px] rounded-full bg-yellow/[0.05] blur-3xl" />
          </div>

          {/* ── Compact header ── */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative text-center mb-7 sm:mb-10"
          >
            {/* Wordmark */}
            <div className="flex items-center justify-center gap-2 mb-5 sm:mb-8">
              <span className="font-syne font-extrabold text-lg sm:text-2xl text-offwhite uppercase tracking-tight leading-none">
                ROULE
              </span>
              <span className="w-px h-4 bg-dark-border" />
              <span className="font-bebas text-sm tracking-[0.25em] text-yellow leading-none">
                RODRIGUES
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
            </div>

            <p className="font-bebas text-yellow text-[9px] sm:text-[10px] tracking-[0.4em] mb-2 sm:mb-3 uppercase">
              Welcome · Bienvenue · Bonzour
            </p>
            <h1 className="font-syne font-extrabold text-offwhite uppercase leading-none mb-2 text-2xl sm:text-4xl md:text-5xl">
              {translations.en.picker.heading}
            </h1>
            <p className="text-muted font-dm text-xs sm:text-sm">
              {translations.en.picker.subheading}
            </p>
          </motion.div>

          {/* ── Language options ── */}
          {/* Mobile: full-width horizontal rows  |  Desktop: 3-col cards */}
          <div className="relative w-full max-w-sm sm:max-w-2xl">

            {/* ── Mobile list (visible below sm) ── */}
            <div className="flex flex-col gap-3 sm:hidden">
              {LANGS.map((lang, i) => (
                <motion.button
                  key={lang}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.22 + i * 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setLanguage(lang)}
                  className="group flex items-center gap-4 w-full bg-dark-card border border-dark-border active:border-yellow hover:border-yellow/60 rounded-2xl px-5 py-4 transition-all duration-200 active:bg-yellow/5 text-left"
                >
                  <span className="text-4xl leading-none shrink-0">{LANGUAGE_FLAGS[lang]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-syne font-extrabold text-lg uppercase tracking-wide text-offwhite group-active:text-yellow transition-colors">
                      {LANGUAGE_NATIVE[lang]}
                    </p>
                    <p className="font-dm text-muted text-xs mt-0.5 leading-snug italic truncate">
                      &ldquo;{LANGUAGE_SAMPLE[lang]}&rdquo;
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-muted/30 group-active:text-yellow group-hover:text-yellow/60 shrink-0 transition-colors" />
                </motion.button>
              ))}
            </div>

            {/* ── Desktop 3-column cards (visible at sm+) ── */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-4">
              {LANGS.map((lang, i) => (
                <motion.button
                  key={lang}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.22 + i * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setLanguage(lang)}
                  className="group flex flex-col items-center gap-5 bg-dark-card border-2 border-dark-border hover:border-yellow rounded-2xl p-8 transition-all duration-300 hover:scale-[1.04] hover:bg-yellow/5 text-center"
                >
                  <span className="text-5xl leading-none">{LANGUAGE_FLAGS[lang]}</span>
                  <div>
                    <p className="font-syne font-extrabold text-xl uppercase tracking-wide text-offwhite group-hover:text-yellow transition-colors duration-200">
                      {LANGUAGE_NATIVE[lang]}
                    </p>
                    <p className="font-dm text-muted text-xs mt-2 leading-relaxed italic">
                      &ldquo;{LANGUAGE_SAMPLE[lang]}&rdquo;
                    </p>
                  </div>
                  <div className="w-8 h-0.5 bg-dark-border group-hover:bg-yellow group-hover:w-14 transition-all duration-300 rounded-full" />
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
