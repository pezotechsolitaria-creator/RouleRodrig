"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Compass,
  Sparkles,
  Loader2,
  Clock,
  Lightbulb,
  ChevronRight,
  ChevronLeft,
  MapPin,
} from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface Activity {
  slot: string;
  id: string;
  name: string;
  emoji: string;
  type: string;
  duration: string;
  description: string;
  tip: string;
}

interface Day {
  day: number;
  theme: string;
  activities: Activity[];
}

const SLOT_COLOR: Record<string, string> = {
  Morning:   "bg-amber-400/10 text-amber-400 border-amber-400/30",
  Lunch:     "bg-green-500/10 text-green-400 border-green-500/30",
  Afternoon: "bg-blue-500/10  text-blue-400  border-blue-500/30",
  Evening:   "bg-violet-500/10 text-violet-400 border-violet-500/30",
};

export default function TripPlanner() {
  const { t } = useLanguage();
  const [days, setDays] = useState(3);
  const [interests, setInterests] = useState<string[]>(["beach", "culture", "adventure", "food"]);
  const [generating, setGenerating] = useState(false);
  const [itinerary, setItinerary] = useState<Day[] | null>(null);
  const [activeDay, setActiveDay] = useState(0);

  // Build translated interests list
  const INTERESTS = [
    { id: "beach",     label: t.planner.interests.beach,     emoji: "🏖️" },
    { id: "culture",   label: t.planner.interests.culture,   emoji: "🏛️" },
    { id: "adventure", label: t.planner.interests.adventure, emoji: "🛵" },
    { id: "food",      label: t.planner.interests.food,      emoji: "🍛" },
  ];

  function toggleInterest(id: string) {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function generate() {
    setGenerating(true);
    setItinerary(null);
    try {
      const res = await fetch("/api/trip-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, interests: interests.length ? interests : ["all"] }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { itinerary: Day[] };
      setItinerary(data.itinerary);
      setActiveDay(0);
    } catch {
      // silently fall through — keep form visible
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section id="trip-planner" className="bg-[#0a0a0a] py-24 md:py-36" aria-label="AI Trip Planner">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.planner.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none break-words"
            style={{ fontSize: "clamp(40px, 7vw, 72px)" }}
          >
            {t.planner.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-xl">
            {t.planner.subtitle}
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-14">
          {/* Config panel */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <div className="bg-dark-card border border-dark-border rounded-2xl p-7 space-y-7 sticky top-24">
              {/* Days selector */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="font-bebas text-muted text-[10px] tracking-[0.3em]">{t.planner.daysLabel}</p>
                  <span className="font-syne font-extrabold text-yellow text-2xl">{days}</span>
                </div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setDays(n)}
                      className={`flex-1 h-10 rounded-lg font-syne font-bold text-sm transition-all ${
                        days === n
                          ? "bg-yellow text-dark"
                          : "bg-[#0d0d0d] border border-[#2a2a2a] text-muted hover:border-yellow/40 hover:text-offwhite"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests */}
              <div>
                <p className="font-bebas text-muted text-[10px] tracking-[0.3em] mb-4">{t.planner.interestsLabel}</p>
                <div className="grid grid-cols-2 gap-2">
                  {INTERESTS.map((interest) => {
                    const active = interests.includes(interest.id);
                    return (
                      <button
                        key={interest.id}
                        onClick={() => toggleInterest(interest.id)}
                        className={`flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left text-sm font-dm transition-all ${
                          active
                            ? "bg-yellow/10 border-yellow/40 text-yellow"
                            : "bg-[#0d0d0d] border-[#2a2a2a] text-muted hover:border-yellow/30 hover:text-offwhite"
                        }`}
                      >
                        <span className="text-base">{interest.emoji}</span>
                        <span className="text-xs leading-tight">{interest.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={generate}
                disabled={generating}
                className="w-full flex items-center justify-center gap-3 bg-yellow text-dark font-syne font-bold py-4 rounded-xl hover:bg-yellow-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <><Loader2 size={18} className="animate-spin" /> {t.planner.planning}</>
                ) : (
                  <><Sparkles size={18} /> {t.planner.plan}</>
                )}
              </button>

              {itinerary && (
                <button
                  onClick={() => setItinerary(null)}
                  className="w-full text-center font-dm text-xs text-muted/50 hover:text-muted transition-colors"
                >
                  Start over
                </button>
              )}
            </div>
          </motion.div>

          {/* Itinerary panel */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {!itinerary && !generating && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[460px] text-center"
                >
                  <Compass size={56} className="text-yellow/20 mb-6" />
                  <p className="font-syne font-bold text-offwhite/30 text-xl">{t.planner.emptyTitle}</p>
                  <p className="text-muted/40 font-dm text-sm mt-2 max-w-xs">{t.planner.emptyDesc}</p>
                </motion.div>
              )}

              {generating && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[460px] gap-5"
                >
                  <div className="relative">
                    <Loader2 size={40} className="text-yellow animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="font-syne font-bold text-offwhite text-lg">{t.planner.planning}</p>
                    <p className="text-muted font-dm text-sm mt-1">
                      {t.planner.loadingDesc(days)}
                    </p>
                  </div>
                </motion.div>
              )}

              {itinerary && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  {/* Day tabs */}
                  <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                    {itinerary.map((day, i) => (
                      <button
                        key={day.day}
                        onClick={() => setActiveDay(i)}
                        className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-syne font-bold transition-all ${
                          activeDay === i
                            ? "bg-yellow text-dark"
                            : "bg-dark-card border border-dark-border text-muted hover:text-offwhite hover:border-yellow/40"
                        }`}
                      >
                        Day {day.day}
                      </button>
                    ))}
                  </div>

                  {/* Active day */}
                  <AnimatePresence mode="wait">
                    {itinerary[activeDay] && (
                      <motion.div
                        key={activeDay}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                      >
                        {/* Day header */}
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 rounded-full bg-yellow/10 flex items-center justify-center">
                            <MapPin size={16} className="text-yellow" />
                          </div>
                          <div>
                            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em]">
                              {t.planner.dayOf(itinerary[activeDay].day, itinerary.length)}
                            </p>
                            <p className="font-syne font-bold text-offwhite text-lg leading-tight">
                              {itinerary[activeDay].theme}
                            </p>
                          </div>
                        </div>

                        {/* Activities */}
                        <div className="space-y-4">
                          {itinerary[activeDay].activities.map((act, idx) => (
                            <motion.div
                              key={act.id + idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.08 }}
                              className="bg-dark-card border border-dark-border rounded-2xl p-5 hover:border-yellow/30 transition-colors"
                            >
                              <div className="flex items-start gap-4">
                                <span className="text-2xl mt-0.5 shrink-0">{act.emoji}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className={`font-bebas text-[9px] tracking-[0.2em] border px-2 py-0.5 rounded-full ${SLOT_COLOR[act.slot] ?? "bg-muted/10 text-muted border-muted/20"}`}>
                                      {act.slot.toUpperCase()}
                                    </span>
                                    <span className="flex items-center gap-1 text-muted/50 text-xs font-dm">
                                      <Clock size={10} /> {act.duration}
                                    </span>
                                  </div>
                                  <p className="font-syne font-bold text-offwhite text-sm mb-1">{act.name}</p>
                                  <p className="text-muted font-dm text-xs leading-relaxed mb-2">{act.description}</p>
                                  {act.tip && (
                                    <div className="flex items-start gap-2 bg-yellow/5 border border-yellow/20 rounded-xl px-3 py-2">
                                      <Lightbulb size={11} className="text-yellow shrink-0 mt-0.5" />
                                      <p className="text-yellow/80 font-dm text-xs leading-relaxed">{act.tip}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {/* Day navigation */}
                        <div className="flex items-center justify-between mt-6 pt-5 border-t border-dark-border">
                          <button
                            onClick={() => setActiveDay((p) => Math.max(0, p - 1))}
                            disabled={activeDay === 0}
                            className="flex items-center gap-2 text-sm font-dm text-muted hover:text-offwhite disabled:opacity-30 transition-colors"
                          >
                            <ChevronLeft size={16} /> {t.planner.prevDay}
                          </button>
                          <button
                            onClick={() => setActiveDay((p) => Math.min(itinerary.length - 1, p + 1))}
                            disabled={activeDay === itinerary.length - 1}
                            className="flex items-center gap-2 text-sm font-dm text-muted hover:text-offwhite disabled:opacity-30 transition-colors"
                          >
                            {t.planner.nextDay} <ChevronRight size={16} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* CTA */}
                  <div className="mt-6 bg-yellow/5 border border-yellow/20 rounded-2xl p-5 flex items-start gap-3">
                    <Sparkles size={16} className="text-yellow shrink-0 mt-0.5" />
                    <div>
                      <p className="font-syne font-bold text-offwhite text-sm">{t.planner.readyTitle}</p>
                      <p className="font-dm text-muted/70 text-xs mt-1">
                        {t.planner.readyDesc(days)}
                      </p>
                      <a
                        href="#booking"
                        className="inline-flex items-center gap-1.5 mt-3 bg-yellow text-dark font-syne font-bold text-xs px-4 py-2 rounded-full hover:bg-yellow-dark transition-colors"
                      >
                        {t.planner.bookNow} <ChevronRight size={12} />
                      </a>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
