"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, HelpCircle } from "lucide-react";
import type { FaqContent } from "@/lib/defaults";

export default function Faq({ content }: { content?: FaqContent }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  if (!content || !content.enabled) return null;
  const items = (content.items ?? []).filter((i) => i.question && i.answer);
  if (items.length === 0) return null;

  return (
    <section id="faq" className="bg-[#0a0a0a] py-24 md:py-32" aria-label={t.a11yMore.faq}>
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">FAQ</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 64px)" }}
          >
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-muted font-dm text-sm md:text-base mt-3">{content.subtitle}</p>
          )}
        </motion.div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const isOpen = open === item.id;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: (i % 8) * 0.04 }}
                className={`bg-dark-card border rounded-2xl overflow-hidden transition-colors ${
                  isOpen ? "border-yellow/40" : "border-dark-border"
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-6 py-5"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-start gap-3">
                    <HelpCircle size={18} className="text-yellow shrink-0 mt-0.5" />
                    <span className="font-syne font-bold text-offwhite text-sm md:text-base">{item.question}</span>
                  </span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
                    <Plus size={20} className={isOpen ? "text-yellow" : "text-muted"} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="text-muted/85 font-dm text-sm leading-relaxed px-5 md:px-6 pb-5 pl-[3.25rem]">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
