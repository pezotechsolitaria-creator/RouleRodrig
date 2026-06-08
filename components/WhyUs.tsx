"use client";

import { Shield, Clock, MapPin, Headphones } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";

const FEATURE_ICONS = [Shield, Clock, MapPin, Headphones];

export default function WhyUs() {
  const { t } = useLanguage();
  const features = t.whyUs.features.map((f, i) => ({
    ...f,
    icon: FEATURE_ICONS[i] ?? Shield,
  }));
  return (
    <section className="bg-dark-card py-24 md:py-36 border-y border-dark-border" aria-label="Why choose us">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16 flex flex-col md:flex-row md:items-end md:justify-between gap-4"
        >
          <div>
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.whyUs.eyebrow}</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-none"
              style={{ fontSize: "clamp(34px, 8vw, 80px)" }}
            >
              {t.whyUs.title}
            </h2>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className="bg-dark rounded-2xl border border-dark-border p-6 md:p-7 hover:border-yellow/40 transition-all duration-300"
              >
                <div className="w-11 h-11 rounded-xl bg-yellow/10 flex items-center justify-center mb-5">
                  <Icon size={20} className="text-yellow" />
                </div>
                <h3 className="font-syne font-bold text-offwhite text-lg mb-3">{feature.title}</h3>
                <p className="text-muted font-dm text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
