"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

/**
 * Floating "back to top" button — iPhone/iPad only. Android has an easy way
 * back up (gesture/nav bar); iOS doesn't, so this is where it earns its place.
 * Sits above the WhatsApp button on the right, clear of the Ti Roulé launcher
 * (bottom-left).
 */
export default function ScrollToTop() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsIOS(/iP(hone|od|ad)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)));
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!isIOS) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed z-[70] bottom-[140px] right-5 md:bottom-24 w-12 h-12 rounded-full bg-dark-card/95 backdrop-blur border border-white/15 text-offwhite flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:border-yellow/60 hover:text-yellow transition-all duration-300 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <ChevronUp size={22} />
    </button>
  );
}
