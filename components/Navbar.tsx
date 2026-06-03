"use client";

import { useState, useEffect } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import type { BrandingContent } from "@/lib/defaults";

const NAV_LINKS = [
  { label: "Scooters", href: "#fleet" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar({ branding }: { branding?: BrandingContent }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const logoEl = branding?.logo ? (
    <Image
      src={branding.logo}
      alt="Roule Rodrigues"
      width={140}
      height={40}
      className="h-9 w-auto object-contain"
      unoptimized={branding.logo.startsWith("/uploads/") || branding.logo.startsWith("http")}
    />
  ) : (
    <span className="flex items-center gap-2.5">
      <span className="font-syne font-extrabold text-xl text-offwhite uppercase tracking-tight leading-none">
        ROULE
      </span>
      <span className="w-px h-4 bg-dark-border group-hover:bg-yellow/50 transition-colors" />
      <span className="font-bebas text-sm tracking-[0.25em] text-yellow leading-none">
        RODRIGUES
      </span>
      <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
    </span>
  );

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-dark/90 backdrop-blur-xl border-b border-dark-border"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center group" aria-label="Roule Rodrigues home">
            {logoEl}
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-muted hover:text-offwhite transition-colors text-sm font-dm font-medium tracking-wide"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="#contact"
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark transition-all duration-200 hover:scale-105"
            >
              Book Now <ArrowRight size={14} />
            </Link>
          </div>

          <button
            className="md:hidden text-offwhite p-1 hover:text-yellow transition-colors"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={24} />
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-dark z-[60] flex flex-col items-center justify-center"
          >
            <button
              className="absolute top-5 right-6 text-offwhite hover:text-yellow transition-colors"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={28} />
            </button>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-col items-center gap-8"
            >
              {NAV_LINKS.map((link, i) => (
                <motion.div
                  key={link.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="font-syne font-extrabold text-5xl text-offwhite hover:text-yellow transition-colors uppercase"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mt-4"
              >
                <Link
                  href="#contact"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 bg-yellow text-dark font-syne font-bold text-xl px-10 py-5 rounded-full"
                >
                  Book Now <ArrowRight size={20} />
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
