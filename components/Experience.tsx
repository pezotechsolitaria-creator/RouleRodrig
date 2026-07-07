"use client";

import Image from "next/image";
import { MapPin, ClipboardList, CreditCard, Key } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import type { ExperienceContent } from "@/lib/defaults";

const STEP_ICONS = [ClipboardList, CreditCard, Key];

export default function Experience({ content }: { content?: ExperienceContent }) {
  const { t } = useLanguage();
  const img1 = content?.image1 || "/images/burgman-sunset.jpeg";
  const img2 = content?.image2 || "/images/avenis-rear.jpeg";
  const show1 = content?.showImage1 !== false && !!img1;
  const show2 = content?.showImage2 !== false && !!img2;
  const steps = t.experience.steps.map((s, i) => ({
    ...s,
    icon: STEP_ICONS[i] ?? ClipboardList,
    step: `0${i + 1}`,
  }));

  return (
    <section id="about" className="bg-dark-card py-24 md:py-36 overflow-hidden" aria-label="About our experience">
      <div className="max-w-7xl mx-auto px-6">
        {/* ── Row 1: intro (with or without photo) ─────────────── */}
        <div
          className={
            show1
              ? "grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center mb-24 md:mb-40"
              : "max-w-3xl mx-auto text-center mb-24 md:mb-40"
          }
        >
          {show1 && (
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-72 md:h-[540px] rounded-2xl overflow-hidden"
            >
              <Image
                src={img1}
                alt="Scooter at golden-hour sunset on the coast of Rodrigues Island"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                loading="lazy"
                unoptimized={img1.startsWith("/uploads/") || img1.startsWith("http")}
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-dark-card/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-yellow/60" />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, x: show1 ? 50 : 0, y: show1 ? 0 : 20 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={`flex items-center gap-2 mb-5 ${show1 ? "" : "justify-center"}`}>
              <MapPin size={14} className="text-yellow" />
              <p className="font-bebas text-yellow text-xs tracking-[0.35em]">{t.experience.eyebrow1}</p>
            </div>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.92] mb-7"
              style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
            >
              {t.experience.title1}
            </h2>
            <p className={`text-muted font-dm leading-relaxed mb-5 text-sm md:text-base ${show1 ? "" : "max-w-2xl mx-auto"}`}>
              {t.experience.para1}
            </p>
            <p className={`text-muted font-dm leading-relaxed text-sm md:text-base ${show1 ? "" : "max-w-2xl mx-auto"}`}>
              {t.experience.para2}
            </p>

            {/* Accent stat */}
            {show1 ? (
              <div className="mt-10 flex items-end gap-3 border-l-2 border-yellow pl-5">
                <p className="font-bebas text-yellow text-5xl leading-none">40+</p>
                <p className="font-dm text-muted text-sm leading-relaxed mb-1">{t.experience.statLabel}</p>
              </div>
            ) : (
              <div className="mt-10 inline-flex items-end gap-3 mx-auto">
                <p className="font-bebas text-yellow text-5xl leading-none">40+</p>
                <p className="font-dm text-muted text-sm leading-relaxed mb-1 text-left max-w-[12rem]">{t.experience.statLabel}</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Thin divider */}
        <div className="w-full h-px bg-dark-border mb-24 md:mb-40" />

        {/* ── Row 2: rental process (with or without photo) ─────────────── */}
        {show2 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="order-2 md:order-1"
            >
              <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-5">{t.experience.eyebrow2}</p>
              <h2
                className="font-syne font-extrabold text-offwhite uppercase leading-[0.92] mb-12"
                style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
              >
                {t.experience.title2}
              </h2>
              <div className="space-y-8">
                {steps.map(({ icon: Icon, step, title, description }, i) => (
                  <motion.div
                    key={step}
                    initial={{ opacity: 0, x: -24 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    className="flex gap-5 items-start"
                  >
                    <div className="shrink-0 w-12 h-12 rounded-full border border-yellow/40 flex items-center justify-center mt-0.5">
                      <Icon size={18} className="text-yellow" />
                    </div>
                    <div>
                      <p className="font-bebas text-yellow text-[10px] tracking-[0.25em] mb-1">{t.experience.stepLabel} {step}</p>
                      <h4 className="font-syne font-bold text-offwhite text-lg mb-1.5">{title}</h4>
                      <p className="text-muted font-dm text-sm leading-relaxed">{description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-72 md:h-[540px] rounded-2xl overflow-hidden order-1 md:order-2"
            >
              <Image
                src={img2}
                alt="Scooter ready for rental in a tropical setting on Rodrigues"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                loading="lazy"
                unoptimized={img2.startsWith("/uploads/") || img2.startsWith("http")}
              />
              <div className="absolute inset-0 bg-gradient-to-tl from-dark-card/70 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-yellow/60" />
            </motion.div>
          </div>
        ) : (
          /* No photo → clean centered heading + 3-column step cards */
          <div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7 }}
              className="text-center max-w-2xl mx-auto mb-14"
            >
              <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-5">{t.experience.eyebrow2}</p>
              <h2
                className="font-syne font-extrabold text-offwhite uppercase leading-[0.92]"
                style={{ fontSize: "clamp(34px, 5vw, 60px)" }}
              >
                {t.experience.title2}
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
              {steps.map(({ icon: Icon, step, title, description }, i) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                  className="bg-dark border border-dark-border rounded-2xl p-7 hover:border-yellow/40 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full border border-yellow/40 flex items-center justify-center mb-5">
                    <Icon size={18} className="text-yellow" />
                  </div>
                  <p className="font-bebas text-yellow text-[10px] tracking-[0.25em] mb-1.5">{t.experience.stepLabel} {step}</p>
                  <h4 className="font-syne font-bold text-offwhite text-lg mb-2">{title}</h4>
                  <p className="text-muted font-dm text-sm leading-relaxed">{description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
