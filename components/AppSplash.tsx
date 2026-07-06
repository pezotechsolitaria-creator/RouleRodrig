"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SESSION_KEY = "rr-splash-shown";

/**
 * Branded animated intro for the installed app (PWA). Plays once per session,
 * only in standalone display mode — it takes over right after the OS splash:
 * logo pops in with a glow, the wordmark slides up, a route line draws across,
 * then everything lifts away to reveal the site. Skipped entirely for users
 * who prefer reduced motion.
 */
export default function AppSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        // iOS Safari exposes navigator.standalone
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!standalone || reduced || sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
      setShow(true);
      const t = setTimeout(() => setShow(false), 2100);
      return () => clearTimeout(t);
    } catch {
      /* never block the app on the splash */
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0a0a0a]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.06 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        >
          {/* Soft brand glow behind the logo */}
          <motion.div
            className="absolute w-72 h-72 rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(245,200,66,0.28), transparent 65%)" }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 0.75], scale: [0.6, 1.15, 1] }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          />

          {/* App icon — continuity with the OS splash icon */}
          <motion.img
            src="/icon-192.png"
            alt=""
            width={96}
            height={96}
            className="relative rounded-3xl shadow-[0_20px_60px_rgba(245,200,66,0.25)]"
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: [0.7, 1.06, 1], y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Wordmark */}
          <div className="relative mt-6 overflow-hidden">
            <motion.p
              initial={{ y: 34, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.65, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="font-syne font-extrabold text-offwhite text-2xl uppercase tracking-tight"
            >
              Roule <span className="text-yellow">Rodrigues</span>
            </motion.p>
          </div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="relative font-bebas text-muted text-[11px] tracking-[0.4em] mt-2"
          >
            EXPLORE THE ISLAND
          </motion.p>

          {/* Route line drawing across, like the hero's navigation lines */}
          <svg className="relative mt-7 w-52 h-6" viewBox="0 0 208 24" fill="none" aria-hidden="true">
            <motion.path
              d="M4 18 C 48 6, 80 22, 116 12 S 178 4, 204 10"
              stroke="#F5C842"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="6 8"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.9, delay: 0.55, ease: "easeInOut" }}
            />
            <motion.circle
              cx="204" cy="10" r="3.5" fill="#F5C842"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.4 }}
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
