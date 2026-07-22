"use client";

import { motion } from "framer-motion";
import { Phone, ShieldAlert, Car, Info } from "lucide-react";
import type { UsefulContact } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

const GROUPS: { key: UsefulContact["category"]; icon: React.ElementType; accent: string }[] = [
  { key: "emergency", icon: ShieldAlert, accent: "text-red-400 border-red-500/30 bg-red-500/5" },
  { key: "taxi",      icon: Car,         accent: "text-yellow border-yellow/30 bg-yellow/5" },
  { key: "other",     icon: Info,        accent: "text-blue-400 border-blue-500/30 bg-blue-500/5" },
];

export default function UsefulNumbers({ contacts = [] }: { contacts?: UsefulContact[] }) {
  const { t } = useLanguage();
  const u = t.useful;
  const valid = contacts.filter((c) => c.label && c.number && !/x{2,}/i.test(c.number));
  if (valid.length === 0) return null;

  return (
    <section id="useful" className="bg-dark py-8 md:py-12" aria-label="Useful numbers">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{u.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(30px, 7vw, 64px)" }}
          >
            {u.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-3 max-w-lg">{u.subtitle}</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {GROUPS.map(({ key, icon: Icon, accent }) => {
            const items = valid.filter((c) => c.category === key);
            if (items.length === 0) return null;
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5 }}
                className={`rounded-2xl border p-5 ${accent.split(" ").slice(1).join(" ")} border-dark-border`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <Icon size={16} className={accent.split(" ")[0]} />
                  <p className="font-bebas tracking-[0.25em] text-[11px] text-muted">{u.groups[key]}</p>
                </div>
                <div className="space-y-2.5">
                  {items.map((c) => (
                    <a
                      key={c.id}
                      href={`tel:${c.number.replace(/\s+/g, "")}`}
                      className="flex items-center justify-between gap-3 bg-dark-card border border-dark-border rounded-xl px-4 py-3 hover:border-yellow/40 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="font-dm text-offwhite text-sm truncate">{c.label}</p>
                        {c.note && <p className="font-dm text-muted/60 text-xs truncate">{c.note}</p>}
                      </div>
                      <span className="flex items-center gap-1.5 font-syne font-bold text-yellow text-sm shrink-0 group-hover:scale-105 transition-transform">
                        <Phone size={12} /> {c.number}
                      </span>
                    </a>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
