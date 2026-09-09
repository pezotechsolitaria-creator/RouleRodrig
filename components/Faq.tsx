"use client";

import { useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { motion } from "framer-motion";
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
          {/* h1, not h2. This component IS its page and its title is the
              page's subject — but it shipped as an h2 with no h1 anywhere in
              the document.

              Found by reading the LIVE HTML rather than the source, which is
              the only way it could have been: app/faq/page.tsx does contain an
              h1, inside the branch that renders when there are NO questions.
              So the source looked correct and every real visit served a page
              without one. Four indexed pages had the same fault.

              Used by exactly one route, so promoting it cannot create a second
              h1 somewhere else. */}
          <h1
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 64px)" }}
          >
            {content.title}
          </h1>
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
                  id={`faq-q-${item.id}`}
                  onClick={() => setOpen(isOpen ? null : item.id)}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-6 py-5"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${item.id}`}
                >
                  <span className="flex items-start gap-3">
                    <HelpCircle size={18} className="text-yellow shrink-0 mt-0.5" />
                    <span className="font-syne font-bold text-offwhite text-sm md:text-base">{item.question}</span>
                  </span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
                    <Plus size={20} className={isOpen ? "text-yellow" : "text-muted"} />
                  </motion.span>
                </button>
                {/* ── THE ANSWERS HAVE TO BE IN THE PAGE ──────────────────
                    This was `{isOpen && <motion.div>…}`, which MOUNTS the
                    answer on click. So the whole of /faq was 1,176 characters
                    of visible text: eleven questions and not one answer.
                    "helmet", "licence" and "insurance" each occurred exactly
                    once on the page — in the question.

                    The answers were being published to Google only inside the
                    FAQPage JSON-LD, which is markup describing text that is
                    not on the page. That is the mismatch the structured-data
                    guidelines exist to catch, and it threw away every word of
                    the owner's real writing as far as ranking and as far as an
                    assistant reading the page is concerned.

                    Collapsed with CSS grid rows instead: the text is in the
                    DOM at all times, laid out, indexable and findable with
                    ctrl-F. Never `hidden`, `display:none` or
                    `visibility:hidden` here — those are treated as absent too.
                    aria-hidden is likewise deliberately absent; the panel is
                    reachable and `aria-expanded`/`aria-controls` say what its
                    state is. */}
                <div
                  id={`faq-panel-${item.id}`}
                  role="region"
                  aria-labelledby={`faq-q-${item.id}`}
                  className={`grid transition-[grid-template-rows] duration-250 ease-out ${
                    isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="text-muted/85 font-dm text-sm leading-relaxed px-5 md:px-6 pb-5 pl-[3.25rem]">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
