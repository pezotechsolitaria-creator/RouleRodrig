"use client";

import { Shield, Clock, MapPin, Headphones } from "lucide-react";
import { motion } from "framer-motion";

const FEATURES = [
  {
    icon: Shield,
    title: "Fully Insured",
    description:
      "Ride with complete peace of mind. Every rental includes comprehensive third-party insurance coverage at no extra cost.",
  },
  {
    icon: Clock,
    title: "Flexible Hours",
    description:
      "Pick up and drop off on your schedule. We work around your itinerary — early mornings and late evenings are no problem.",
  },
  {
    icon: MapPin,
    title: "Island Delivery",
    description:
      "We deliver your scooter directly to your hotel, guesthouse, or airport. Weekly rentals include free delivery island-wide.",
  },
  {
    icon: Headphones,
    title: "24/7 Support",
    description:
      "Got a flat tyre? Need directions? We're always one WhatsApp message away, day or night, wherever you are on the island.",
  },
];

export default function WhyUs() {
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
            <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">WHY CHOOSE US</p>
            <h2
              className="font-syne font-extrabold text-offwhite uppercase leading-none"
              style={{ fontSize: "clamp(28px, 8vw, 80px)" }}
            >
              RIDE WITH CONFIDENCE
            </h2>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((feature, i) => {
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
