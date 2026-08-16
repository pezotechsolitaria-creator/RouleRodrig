"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveal-on-scroll, in about thirty lines and no animation library.
 *
 * WHY NOT framer-motion, which this project already ships: a curated page is a
 * long column of large photographs, and `whileInView` mounts a motion component
 * — a subscription and a per-frame JS loop — behind every card. On the phone
 * that is the primary device here, that showed up as exactly the kind of scroll
 * jank the owner has reported before. This is one IntersectionObserver per
 * element, disconnected the moment it fires, driving two compositor-only
 * properties from CSS (see .rr-cur-reveal in globals.css).
 *
 * The observer only ever ADDS the class. Nothing re-hides on scroll-up: a
 * section that flickers back out as you scroll past it is the single most
 * common way this effect is made annoying.
 */
export default function Reveal({
  delay = 0,
  className = "",
  children,
}: {
  /** Stagger, in ms. Keep small — 60–120ms per sibling reads as one gesture. */
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No observer (very old browser) → show it. The fallback is always
    // "visible", never "animated forever invisible".
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      // A little before the element is fully on screen, so the movement has
      // finished by the time the reader's eye arrives rather than starting then.
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`rr-cur-reveal ${className}`}
      style={{ "--rr-d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
