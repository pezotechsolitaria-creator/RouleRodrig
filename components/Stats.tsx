"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";

function AnimatedCounter({
  target,
  suffix = "",
}: {
  target: number;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (!inView) return;
    const duration = 1800;
    const frameRate = 1000 / 60;
    const totalFrames = Math.round(duration / frameRate);
    let frame = 0;
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (frame === totalFrames) clearInterval(timer);
    }, frameRate);
    return () => clearInterval(timer);
  }, [inView, target]);

  return (
    <span ref={ref}>
      {value}
      {suffix}
    </span>
  );
}

import { DEFAULT_CONTENT, type StatItem } from "@/lib/defaults";

export default function Stats({ stats }: { stats?: StatItem[] }) {
  const items = stats ?? DEFAULT_CONTENT.stats;

  return (
    <section className="bg-dark py-20 md:py-28" aria-label="Key statistics">
      <div className="max-w-7xl mx-auto px-6">
        {/* Top rule */}
        <div className="w-full h-px bg-yellow/20 mb-16" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-dark-border">
          {items.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, delay: i * 0.12 }}
              className="text-center px-6 py-8 md:py-0"
            >
              <p
                className="font-bebas text-yellow leading-none"
                style={{ fontSize: "clamp(72px, 11vw, 120px)" }}
                aria-label={`${stat.value}${stat.suffix} ${stat.label}`}
              >
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </p>
              <p className="font-bebas text-muted tracking-[0.25em] text-xs mt-3 uppercase">
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Bottom rule */}
        <div className="w-full h-px bg-yellow/20 mt-16" />
      </div>
    </section>
  );
}
