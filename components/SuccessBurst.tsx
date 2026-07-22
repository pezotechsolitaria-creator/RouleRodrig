"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

// A premium, self-contained success animation: a spring-in ring, a drawing
// checkmark, and a short burst of golden island rays — with a soft haptic on
// supported devices. Respects prefers-reduced-motion (static check, no burst).
// Used to lead the booking confirmation before the payment step is revealed.
export default function SuccessBurst({ size = 76 }: { size?: number }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    try {
      navigator.vibrate?.([10, 40, 16]);
    } catch {
      /* haptics unsupported — fine */
    }
  }, []);

  const rays = Array.from({ length: 9 });

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }} aria-hidden="true">
      {!reduce &&
        rays.map((_, i) => {
          const angle = (i / rays.length) * Math.PI * 2;
          const dist = size * 0.85;
          return (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -ml-[3px] -mt-[3px] rounded-full bg-yellow"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.5 }}
              animate={{
                opacity: [0, 1, 0],
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                scale: [0.5, 1, 0.3],
              }}
              transition={{ duration: 0.75, delay: 0.15, ease: "easeOut" }}
            />
          );
        })}

      <motion.div
        className="absolute inset-0 rounded-full border border-green-500/40 bg-green-500/15"
        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
        animate={reduce ? undefined : { scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
      />

      <svg viewBox="0 0 52 52" className="absolute inset-0 h-full w-full">
        <motion.path
          d="M15 27 l7.5 7.5 L38 18"
          fill="none"
          stroke="#34d399"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={reduce ? undefined : { pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.22, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
