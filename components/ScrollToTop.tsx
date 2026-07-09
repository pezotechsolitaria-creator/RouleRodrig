"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating "back to top" button. Appears once the visitor has scrolled down a
 * screen or so — especially useful on iPhone, where there's no easy way back to
 * the top of a long page. Sits bottom-left so it never clashes with the
 * WhatsApp button (bottom-right).
 */
export default function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed z-50 bottom-6 left-6 w-12 h-12 rounded-full bg-dark-card/90 backdrop-blur border border-dark-border text-offwhite flex items-center justify-center shadow-lg hover:border-yellow/50 hover:text-yellow transition-all duration-300 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <ArrowUp size={20} />
    </button>
  );
}
