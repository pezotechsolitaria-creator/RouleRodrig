"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Phone, ShieldAlert, Car, Info, ChevronDown, Siren } from "lucide-react";
import type { UsefulContact } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

const GROUPS: { key: UsefulContact["category"]; icon: React.ElementType; ring: string; tint: string }[] = [
  { key: "emergency", icon: ShieldAlert, ring: "ring-red-500/25", tint: "text-red-400 bg-red-500/12" },
  { key: "taxi",      icon: Car,         ring: "ring-yellow/25",  tint: "text-yellow bg-yellow/12" },
  { key: "other",     icon: Info,        ring: "ring-blue-500/25", tint: "text-blue-400 bg-blue-500/12" },
];

// A compact, premium "SOS" accordion: almost no space when collapsed, and it
// reveals the emergency + useful numbers as tappable glass cards when opened.
// The open/closed choice is remembered across visits (localStorage).
export default function UsefulNumbers({ contacts = [] }: { contacts?: UsefulContact[] }) {
  const { t } = useLanguage();
  const u = t.useful;
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem("rr-sos-open") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const valid = contacts.filter((c) => c.label && c.number && !/x{2,}/i.test(c.number));
  if (valid.length === 0) return null;

  function toggle() {
    setOpen((o) => {
      const next = !o;
      try {
        localStorage.setItem("rr-sos-open", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <section id="useful" className="bg-dark py-8 md:py-12" aria-label={t.a11yMore.emergencyNumbers}>
      <div className="mx-auto max-w-3xl px-5">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] backdrop-blur-sm shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="sos-panel"
            className="group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow/50"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/12 text-red-400 ring-1 ring-inset ring-red-500/25"><Siren size={20} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-syne font-extrabold text-offwhite leading-tight">SOS · {u.title}</span>
              <span className="mt-0.5 block font-dm text-xs text-muted">{u.subtitle}</span>
            </span>
            <ChevronDown size={20} className={`shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180 text-yellow" : ""}`} />
          </button>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                id="sos-panel"
                initial={reduce ? undefined : { height: 0, opacity: 0 }}
                animate={reduce ? undefined : { height: "auto", opacity: 1 }}
                exit={reduce ? undefined : { height: 0, opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="space-y-4 px-4 pb-4 pt-1">
                  {GROUPS.map(({ key, icon: Icon, ring, tint }) => {
                    const items = valid.filter((c) => c.category === key);
                    if (items.length === 0) return null;
                    return (
                      <div key={key}>
                        <div className="mb-2 flex items-center gap-2 px-1">
                          <Icon size={14} className={tint.split(" ")[0]} />
                          <p className="font-bebas text-[11px] tracking-[0.25em] text-muted">{u.groups[key]}</p>
                        </div>
                        <div className="space-y-2">
                          {items.map((c) => (
                            <a
                              key={c.id}
                              href={`tel:${c.number.replace(/\s+/g, "")}`}
                              className="flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-dark/40 px-4 py-2.5 transition-all hover:border-yellow/40 hover:bg-dark/60 active:scale-[0.99]"
                            >
                              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${ring} ${tint}`}>
                                <Icon size={16} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-dm text-sm text-offwhite">{c.label}</span>
                                {c.note && <span className="block truncate font-dm text-[11px] text-muted/60">{c.note}</span>}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-yellow/10 px-3 py-2 font-syne text-sm font-bold text-yellow ring-1 ring-inset ring-yellow/20">
                                <Phone size={13} /> {c.number}
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
