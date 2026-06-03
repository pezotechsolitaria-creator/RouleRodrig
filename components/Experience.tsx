"use client";

import Image from "next/image";
import { MapPin, ClipboardList, CreditCard, Key } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  {
    icon: ClipboardList,
    step: "01",
    title: "Choose Your Scooter",
    description:
      "Pick the Burgman 200 for raw power or the Avenis 125 for agility — both are immaculate and ready to explore.",
  },
  {
    icon: CreditCard,
    step: "02",
    title: "Pay Securely",
    description:
      "Simple, transparent pricing. Book online or pay on arrival. No hidden fees, no surprises.",
  },
  {
    icon: Key,
    step: "03",
    title: "Pick Up & Ride",
    description:
      "Collect your scooter at our location or opt for free island delivery on weekly rentals. The road is yours.",
  },
];

export default function Experience() {
  return (
    <section id="about" className="bg-dark-card py-24 md:py-36 overflow-hidden" aria-label="About our experience">
      <div className="max-w-7xl mx-auto px-6">
        {/* ── Row 1: Image left, text right ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center mb-24 md:mb-40">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-72 md:h-[540px] rounded-2xl overflow-hidden"
          >
            <Image
              src="/images/burgman-sunset.jpeg"
              alt="Suzuki Burgman scooter at golden-hour sunset on the coast of Rodrigues Island"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-dark-card/70 via-transparent to-transparent" />
            {/* Yellow accent bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-yellow/60" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 mb-5">
              <MapPin size={14} className="text-yellow" />
              <p className="font-bebas text-yellow text-xs tracking-[0.35em]">THE ISLAND AWAITS</p>
            </div>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.92] mb-7"
              style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
            >
              RODRIGUES LIKE YOU&apos;VE NEVER SEEN IT
            </h2>
            <p className="text-muted font-dm leading-relaxed mb-5 text-sm md:text-base">
              Wind along coastal cliffs where the turquoise lagoon stretches endlessly to the horizon.
              Discover hidden beaches only reachable by scooter, and weave through charming villages
              where locals greet you with a genuine smile.
            </p>
            <p className="text-muted font-dm leading-relaxed text-sm md:text-base">
              Rodrigues is a world apart — unspoiled, unhurried, and utterly extraordinary.
              The best way to experience it all? On two wheels, at your own pace, with the wind
              as your only guide.
            </p>

            {/* Accent stat */}
            <div className="mt-10 flex items-end gap-3 border-l-2 border-yellow pl-5">
              <p className="font-bebas text-yellow text-5xl leading-none">40+</p>
              <p className="font-dm text-muted text-sm leading-relaxed mb-1">
                km of stunning coastal roads<br />to discover at your own pace
              </p>
            </div>
          </motion.div>
        </div>

        {/* Thin divider */}
        <div className="w-full h-px bg-dark-border mb-24 md:mb-40" />

        {/* ── Row 2: Text left, image right ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="order-2 md:order-1"
          >
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-5">EASY RENTAL PROCESS</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-[0.92] mb-12"
              style={{ fontSize: "clamp(36px, 5vw, 64px)" }}
            >
              THREE STEPS TO THE OPEN ROAD
            </h2>

            <div className="space-y-8">
              {STEPS.map(({ icon: Icon, step, title, description }, i) => (
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
                    <p className="font-bebas text-yellow text-[10px] tracking-[0.25em] mb-1">STEP {step}</p>
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
              src="/images/avenis-rear.jpeg"
              alt="Yellow Suzuki Avenis 125 scooter rear view in tropical garden setting"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-tl from-dark-card/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-yellow/60" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
