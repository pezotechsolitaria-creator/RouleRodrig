"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function BookingCTA() {
  return (
    <section
      className="relative bg-dark-card border-y border-dark-border py-28 md:py-40 overflow-hidden"
      aria-label="Book now call to action"
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(#F5C842 1px, transparent 1px), linear-gradient(to right, #F5C842 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Glow orb */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(245,200,66,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-4">GET STARTED</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none mb-6"
            style={{ fontSize: "clamp(60px, 12vw, 130px)" }}
          >
            READY TO RIDE?
          </h2>
          <p className="text-muted font-dm text-base md:text-lg mb-12 max-w-sm mx-auto leading-relaxed">
            Book your scooter online in 60 seconds. No deposit required. Free cancellation.
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
            <Link
              href="#contact"
              className="inline-flex items-center gap-3 bg-yellow text-dark font-syne font-bold text-base md:text-lg px-10 py-5 rounded-full hover:bg-yellow-dark transition-colors"
              aria-label="Book your scooter now"
            >
              Book Now <ArrowRight size={20} />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
