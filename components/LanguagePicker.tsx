"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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

  // Prevent body scroll while picker is visible
  useEffect(() => {
    if (!hasChosen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [hasChosen]);

  return (
    <AnimatePresence>
      {!hasChosen && (
        <motion.div
          key="language-picker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          className="fixed inset-0 z-[200] bg-dark flex flex-col items-center justify-center px-6 overflow-y-auto py-12"
        >
          {/* Ambient glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-yellow/[0.04] blur-3xl" />
          </div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="relative text-center mb-10"
          >
            {/* Wordmark */}
            <div className="flex items-center justify-center gap-2.5 mb-10">
              <span className="font-syne font-extrabold text-2xl text-offwhite uppercase tracking-tight leading-none">
                ROULE
              </span>
              <span className="w-px h-5 bg-dark-border" />
              <span className="font-bebas text-base tracking-[0.25em] text-yellow leading-none">
                RODRIGUES
              </span>
              <span className="w-2 h-2 rounded-full bg-yellow" />
            </div>

            <p className="font-bebas text-yellow text-xs tracking-[0.4em] mb-3 uppercase">
              Welcome · Bienvenue · Bonzour
            </p>
            <h1
              className="font-syne font-extrabold text-offwhite uppercase leading-none mb-4"
              style={{ fontSize: "clamp(30px, 6vw, 54px)" }}
            >
              {translations.en.picker.heading}
            </h1>
            <p className="text-muted font-dm text-sm max-w-xs mx-auto">
              {translations.en.picker.subheading}
            </p>
          </motion.div>

          {/* Language cards */}
          <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {LANGS.map((lang, i) => (
              <motion.button
                key={lang}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.28 + i * 0.09,
                  duration: 0.55,
                  ease: [0.22, 1, 0.36, 1],
                }}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
