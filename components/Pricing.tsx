"use client";

import { Check } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

const PLANS = [
  { label: "Daily", highlight: false },
  { label: "3 Days", highlight: true, tag: "BEST VALUE" },
  { label: "Weekly", highlight: false },
];

import { DEFAULT_CONTENT, type PricingRow } from "@/lib/defaults";

const INCLUDED = [
  "Helmet",
  "Third-party insurance",
  "24/7 WhatsApp support",
  "Free delivery on weekly rentals",
];

export default function Pricing({ pricing }: { pricing?: PricingRow[] }) {
  const scooters = pricing ?? DEFAULT_CONTENT.pricing;
  return (
    <section id="pricing" className="bg-dark py-24 md:py-36" aria-label="Pricing">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-16"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">PRICING</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(28px, 8vw, 80px)" }}
          >
            TRANSPARENT PRICING
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8 }}
          className="overflow-x-auto rounded-2xl border border-dark-border"
        >
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr>
                <th className="text-left px-6 py-5 font-bebas text-muted text-xs tracking-[0.25em] border-b border-dark-border bg-dark-card w-[40%]">
                  MODEL
                </th>
                {PLANS.map((plan) => (
                  <th
                    key={plan.label}
                    className={`px-6 py-5 text-center font-bebas text-xs tracking-[0.25em] border-b relative ${
                      plan.highlight
                        ? "border-yellow bg-yellow/10 text-yellow"
                        : "border-dark-border bg-dark-card text-muted"
                    }`}
                  >
                    {plan.label}
                    {plan.tag && (
                      <span className="absolute top-2 right-2 font-bebas text-[9px] tracking-wider bg-yellow text-dark px-2 py-0.5 rounded-full leading-none">
                        {plan.tag}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scooters.map((scooter, si) => (
                <tr
                  key={scooter.name}
                  className={`border-b border-dark-border hover:bg-dark-card/60 transition-colors ${
                    si === scooters.length - 1 ? "border-b-0" : ""
                  }`}
                >
                  <td className="px-6 py-6 font-syne font-bold text-offwhite text-sm">
                    {scooter.name}
                  </td>
                  {scooter.prices.map((price, pi) => (
                    <td
                      key={pi}
                      className={`px-6 py-6 text-center font-bebas text-2xl ${
                        pi === 1 ? "text-yellow bg-yellow/5" : "text-offwhite"
                      }`}
                    >
                      {price}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Included */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-6 p-6 md:p-8 bg-dark-card border border-dark-border rounded-2xl flex flex-col md:flex-row md:items-center gap-6 md:gap-0 md:justify-between"
        >
          <div>
            <p className="font-bebas text-yellow text-xs tracking-[0.3em] mb-4">ALWAYS INCLUDED</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-8">
              {INCLUDED.map((item) => (
                <div key={item} className="flex items-center gap-2.5 text-offwhite/80 text-sm font-dm">
                  <Check size={14} className="text-yellow shrink-0" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Link
            href="#contact"
            className="flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-8 py-4 rounded-full hover:bg-yellow-dark transition-colors whitespace-nowrap md:ml-8 shrink-0"
          >
            Get a Quote
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
