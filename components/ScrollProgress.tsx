"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * A thin yellow progress line at the very top of the page that fills as the
 * visitor scrolls the long homepage — a subtle, premium orientation cue.
 * Purely decorative, no interaction, no added clutter.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-yellow via-yellow to-orange-400"
      aria-hidden="true"
    />
  );
}
