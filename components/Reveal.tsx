"use client";

import { motion } from "framer-motion";

/**
 * Consistent scroll-choreographed reveal (Apple-style): a soft fade + rise as
 * the block enters the viewport, once. Wrap homepage sections for a cohesive
 * "story unfolds as you scroll" feel. Uses transform/opacity only (GPU-cheap).
 */
export default function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-90px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
