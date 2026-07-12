"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, X, ArrowRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const VISIT_KEY = "rr-last-visit";
const SESSION_KEY = "rr-welcomed";
const FAV_KEY = "rr-favorites-v1";
const TRIP_KEY = "rr-trip-planner-v1";

const COPY = {
  en: {
    savedTitle: "Welcome back",
    savedBody: (n: number) => `You have ${n} saved ${n === 1 ? "favourite" : "favourites"} — pick up where you left off.`,
    view: "View saved",
    tripTitle: "Welcome back",
    tripBody: "Your trip plan is saved and ready.",
    continue: "Continue planning",
  },
  fr: {
    savedTitle: "Bon retour",
    savedBody: (n: number) => `Vous avez ${n} favori${n === 1 ? "" : "s"} enregistré${n === 1 ? "" : "s"} — reprenez où vous en étiez.`,
    view: "Voir mes favoris",
    tripTitle: "Bon retour",
    tripBody: "Votre plan de séjour est enregistré.",
    continue: "Continuer",
  },
  cr: {
    savedTitle: "Bienvenu ankor",
    savedBody: (n: number) => `Ou ena ${n} favori anrezistre — kontinye kot ou ti arete.`,
    view: "Get mo favori",
    tripTitle: "Bienvenu ankor",
    tripBody: "Ou plan vwayaz finn anrezistre.",
    continue: "Kontinye",
  },
} as const;

/**
 * A subtle, once-per-session "welcome back" nudge for returning visitors who
 * already saved favourites or built a trip — a gentle, honest reason to
 * re-engage (no dark patterns). Dismissible and auto-hides.
 */
export default function ReturnWelcome() {
  const { language } = useLanguage();
  const c = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [state, setState] = useState<null | { kind: "saved"; n: number } | { kind: "trip" }>(null);

  useEffect(() => {
    let favN = 0;
    let hasTrip = false;
    try {
      const f = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (Array.isArray(f)) favN = f.length;
      const t = JSON.parse(localStorage.getItem(TRIP_KEY) || "null");
      hasTrip = !!(t && Array.isArray(t.itinerary) && t.itinerary.length);
    } catch {
      /* ignore */
    }

    const returning = !!localStorage.getItem(VISIT_KEY);
    const welcomed = sessionStorage.getItem(SESSION_KEY);
    // Mark this visit for next time
    try { localStorage.setItem(VISIT_KEY, String(Date.now())); } catch {}

    if (!returning || welcomed) return;
    if (favN > 0) setState({ kind: "saved", n: favN });
    else if (hasTrip) setState({ kind: "trip" });
  }, []);

  // Auto-hide after a while
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => dismiss(), 11000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function dismiss() {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch {}
    setState(null);
  }

  function act() {
    if (state?.kind === "saved") {
      window.dispatchEvent(new CustomEvent("rr:open-saved"));
    } else {
      document.getElementById("trip-planner")?.scrollIntoView({ behavior: "smooth" });
    }
    dismiss();
  }

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[97] w-[calc(100%-2rem)] max-w-md"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-dark-card/95 backdrop-blur-md border border-yellow/30 shadow-[0_12px_40px_rgba(0,0,0,0.55)] p-3.5">
            <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-yellow/10 border border-yellow/20">
              {state.kind === "saved" ? <Heart size={18} className="fill-red-500 text-red-500" /> : <Sparkles size={18} className="text-yellow" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-syne font-bold text-offwhite text-sm leading-tight">
                {state.kind === "saved" ? c.savedTitle : c.tripTitle}
              </p>
              <p className="font-dm text-muted text-xs leading-tight mt-0.5">
                {state.kind === "saved" ? c.savedBody(state.n) : c.tripBody}
              </p>
            </div>
            <button onClick={act} className="shrink-0 flex items-center gap-1 bg-yellow text-dark font-syne font-bold text-xs px-3.5 py-2 rounded-full hover:bg-yellow-dark transition-colors">
              {state.kind === "saved" ? c.view : c.continue} <ArrowRight size={12} />
            </button>
            <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted/50 hover:text-offwhite transition-colors">
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
