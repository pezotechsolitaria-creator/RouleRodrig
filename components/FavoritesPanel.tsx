"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, ArrowRight, Bike, BedDouble, Route as RouteIcon } from "lucide-react";
import { useFavorites, type FavoriteType } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";

const COPY = {
  en: { saved: "Saved", title: "Your saved list", empty: "Tap the ♥ on any scooter, stay or route to save it here.", clear: "Clear all", plan: "Plan my trip", book: "Book a scooter", groups: { scooter: "Scooters", place: "Stay · Eat · Do", route: "Routes & Trails" } },
  fr: { saved: "Favoris", title: "Votre liste de favoris", empty: "Touchez le ♥ sur un scooter, hébergement ou itinéraire pour l'enregistrer ici.", clear: "Tout effacer", plan: "Planifier mon séjour", book: "Réserver un scooter", groups: { scooter: "Scooters", place: "Dormir · Manger · Faire", route: "Routes & Sentiers" } },
  cr: { saved: "Favori", title: "Ou lalis favori", empty: "Tap lor ♥ lor enn skooter, lozman ou rout pou anrezistre li isi.", clear: "Efas tou", plan: "Plann mo vwayaz", book: "Rezerv enn skooter", groups: { scooter: "Skooter", place: "Reste · Manze · Fer", route: "Rout & Santi" } },
} as const;

const GROUP_ICON: Record<FavoriteType, React.ElementType> = {
  scooter: Bike,
  place: BedDouble,
  route: RouteIcon,
};
const GROUP_ORDER: FavoriteType[] = ["scooter", "place", "route"];

export default function FavoritesPanel() {
  const { favorites, count, remove, clear, hydrated } = useFavorites();
  const { language } = useLanguage();
  const c = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [open, setOpen] = useState(false);

  if (!hydrated || count === 0) return null;

  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: favorites.filter((f) => f.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Floating button (bottom-left, opposite WhatsApp) */}
      <button
        onClick={() => setOpen(true)}
        aria-label={`${c.saved} (${count})`}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-2 bg-dark-card/90 backdrop-blur-md border border-white/15 text-offwhite rounded-full pl-3 pr-4 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:border-yellow/50 transition-colors"
      >
        <span className="relative flex">
          <Heart size={18} className="fill-red-500 text-red-500" />
          <span className="absolute -top-2 -right-2 bg-yellow text-dark text-[10px] font-syne font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
            {count}
          </span>
        </span>
        <span className="font-syne font-bold text-sm hidden sm:inline">{c.saved}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[100] flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md h-full bg-dark border-l border-dark-border flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
                <div className="flex items-center gap-2">
                  <Heart size={18} className="fill-red-500 text-red-500" />
                  <h2 className="font-syne font-extrabold text-offwhite text-lg">{c.title}</h2>
                  <span className="font-dm text-muted text-sm">({count})</span>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-offwhite transition-colors">
                  <X size={22} />
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                {grouped.map((g) => {
                  const Icon = GROUP_ICON[g.type];
                  return (
                    <div key={g.type}>
                      <p className="flex items-center gap-2 font-bebas text-yellow text-xs tracking-[0.2em] mb-3">
                        <Icon size={13} /> {c.groups[g.type]} ({g.items.length})
                      </p>
                      <div className="space-y-2.5">
                        {g.items.map((f) => (
                          <div key={`${f.type}:${f.id}`} className="group flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl p-2.5 hover:border-yellow/40 transition-colors">
                            <Link href={f.href} onClick={() => setOpen(false)} className="flex items-center gap-3 flex-1 min-w-0">
                              {f.image ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={f.image} alt={f.name} className="w-14 h-14 rounded-lg object-cover shrink-0" loading="lazy" />
                              ) : (
                                <span className="w-14 h-14 rounded-lg bg-dark flex items-center justify-center shrink-0">
                                  <Icon size={18} className="text-yellow/50" />
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className="block font-syne font-bold text-offwhite text-sm truncate">{f.name}</span>
                                {f.meta && <span className="block font-dm text-muted text-xs truncate">{f.meta}</span>}
                              </span>
                            </Link>
                            <button
                              onClick={() => remove(f.type, f.id)}
                              aria-label="Remove"
                              className="shrink-0 text-muted/50 hover:text-red-400 transition-colors p-1"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="border-t border-dark-border p-4 space-y-3">
                <div className="flex gap-2">
                  <Link href="#trip-planner" onClick={() => setOpen(false)} className="flex-1 flex items-center justify-center gap-1.5 border border-white/20 text-offwhite font-syne font-bold text-sm py-3 rounded-full hover:bg-white/5 transition-colors">
                    {c.plan}
                  </Link>
                  <Link href="#booking" onClick={() => setOpen(false)} className="flex-1 flex items-center justify-center gap-1.5 bg-yellow text-dark font-syne font-bold text-sm py-3 rounded-full hover:bg-yellow-dark transition-colors">
                    {c.book} <ArrowRight size={14} />
                  </Link>
                </div>
                <button onClick={clear} className="w-full text-center font-dm text-xs text-muted/50 hover:text-red-400 transition-colors">
                  {c.clear}
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
