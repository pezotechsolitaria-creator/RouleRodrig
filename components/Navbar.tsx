"use client";

import { useState, useEffect } from "react";
import { Menu, X, ArrowRight, Heart } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import type { BrandingContent } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { useCurrency } from "@/context/CurrencyContext";
import { useFavorites } from "@/context/FavoritesContext";
import InstallAppButton from "@/components/InstallAppButton";
import { CURRENCIES, CURRENCY_SYMBOL } from "@/lib/currency";
import { LANGUAGE_FLAGS, LANGUAGE_NATIVE, type Language } from "@/lib/i18n";

const LANG_CYCLE: Language[] = ["en", "fr", "cr"];

export default function Navbar({
  branding,
  announcementActive,
  showStayEatDo,
  showRoutes,
  showEvents,
}: {
  branding?: BrandingContent;
  announcementActive?: boolean;
  showStayEatDo?: boolean;
  showRoutes?: boolean;
  showEvents?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const { t, language, setLanguage } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const { count: savedCount } = useFavorites();

  const openSaved = () => window.dispatchEvent(new CustomEvent("rr:open-saved"));

  // Robust in-page navigation. Hash links (/#explore, /#map…) previously did
  // nothing from the burger — only /taxi (a real route) worked — because the
  // open menu locks `body { overflow:hidden }`, and that lock is still active
  // when the browser tries to jump to the hash, so the scroll is swallowed.
  // We close the menu, release the lock, then scroll to the target ourselves.
  // Off-page hashes (target not on this page) fall back to the normal <Link>.
  // The nav items are plain <a> tags, so the browser's native fragment
  // navigation does the scroll (reliable again now that scroll-behavior:smooth
  // is gone and the section scroll-margin clears the fixed navbar). All we do on
  // click is close the mobile menu and release its scroll-lock — deliberately
  // NO preventDefault, so we never block the native scroll.
  function handleNavClick() {
    setMenuOpen(false);
    document.body.style.overflowY = "";
  }

  function cycleLanguage() {
    const idx = LANG_CYCLE.indexOf(language);
    setLanguage(LANG_CYCLE[(idx + 1) % LANG_CYCLE.length]);
  }

  function cycleCurrency() {
    const idx = CURRENCIES.indexOf(currency);
    setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
  }

  // Stay·Eat·Do and Events now live inside the "What are you looking for?" hub.
  // The island guide, scenic routes and FAQ moved off the homepage to their own
  // pages (the homepage is now a lean action dashboard), so the nav points there
  // directly: Explore → Island guide → Routes → Taxi → FAQ → Contact.
  const navLinks = [
    { label: t.explore.nav, href: "/#explore" },
    { label: t.nav.map,      href: "/guide/rodrigues" },
    ...(showRoutes ? [{ label: t.nav.routes, href: "/guide/routes" }] : []),
    { label: t.nav.taxi,     href: "/taxi" },
    { label: "FAQ",          href: "/faq" },
    { label: t.nav.contact,  href: "/#contact" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scrollspy: highlight the nav link of the section currently in view.
  useEffect(() => {
    const ids = ["explore", "contact"];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
        else if (window.scrollY < 300) setActiveSection("");
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflowY = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflowY = ""; };
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
        className={`fixed left-0 right-0 z-50 transition-all duration-500 ${
          announcementActive ? "top-11" : "top-0"
        } ${
          scrolled
            ? "bg-dark/90 backdrop-blur-xl border-b border-dark-border"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center group" aria-label="Roule Rodrigues home">
            {logoEl}
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = activeSection !== "" && link.href.replace("/#", "#") === `#${activeSection}`;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={handleNavClick}
                  className={`relative pb-1 transition-colors text-sm font-dm font-medium tracking-wide ${
                    isActive ? "text-offwhite" : "text-muted hover:text-offwhite"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-active-underline"
                      className="absolute left-0 right-0 -bottom-0.5 h-[2px] rounded-full bg-yellow"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                </a>
              );
            })}

            {/* Language cycle button */}
            <button
              onClick={cycleLanguage}
              className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-offwhite border border-dark-border hover:border-yellow/50 px-3 py-2 rounded-full transition-all duration-200"
              aria-label={`Switch to ${LANGUAGE_NATIVE[LANG_CYCLE[(LANG_CYCLE.indexOf(language) + 1) % LANG_CYCLE.length]]}`}
              title={`Switch to ${LANGUAGE_NATIVE[LANG_CYCLE[(LANG_CYCLE.indexOf(language) + 1) % LANG_CYCLE.length]]}`}
            >
              <span>{LANGUAGE_FLAGS[language]}</span>
              <span className="uppercase tracking-wide">{language}</span>
            </button>

            {/* Currency cycle button */}
            <button
              onClick={cycleCurrency}
              className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-offwhite border border-dark-border hover:border-yellow/50 px-3 py-2 rounded-full transition-all duration-200"
              aria-label="Change currency"
              title="Change currency"
            >
              <span className="font-bold text-yellow">{CURRENCY_SYMBOL[currency]}</span>
              <span className="uppercase tracking-wide">{currency}</span>
            </button>

            {/* Install app (persistent — native prompt or instructions) */}
            <InstallAppButton variant="chip" />

            {/* Saved / wishlist */}
            <button
              onClick={openSaved}
              aria-label={`Saved (${savedCount})`}
              title="Your saved list"
              className="relative flex items-center justify-center w-10 h-10 rounded-full border border-dark-border hover:border-yellow/50 text-muted hover:text-offwhite transition-all duration-200"
            >
              <Heart size={17} className={savedCount > 0 ? "fill-red-500 text-red-500" : ""} />
              {savedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-yellow text-dark text-[10px] font-syne font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {savedCount}
                </span>
              )}
            </button>

            <a
              href="/#explore"
              onClick={handleNavClick}
              className="flex items-center gap-2 bg-yellow text-dark font-syne font-bold text-sm px-5 py-2.5 rounded-full hover:bg-yellow-dark transition-all duration-200 hover:scale-105"
            >
              {t.nav.bookNow} <ArrowRight size={14} />
            </a>
          </div>

          {/* Mobile: saved heart + menu */}
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={openSaved}
              aria-label={`Saved (${savedCount})`}
              className="relative text-offwhite p-2 hover:text-yellow transition-colors"
            >
              <Heart size={22} className={savedCount > 0 ? "fill-red-500 text-red-500" : ""} />
              {savedCount > 0 && (
                <span className="absolute top-0 right-0 bg-yellow text-dark text-[10px] font-syne font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {savedCount}
                </span>
              )}
            </button>
            <button
              className="text-offwhite p-1 hover:text-yellow transition-colors"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-dark z-[60] flex flex-col items-center justify-center overflow-hidden"
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
              className="flex flex-col items-center gap-6 w-full px-6"
            >
              {navLinks.map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                >
                  <a
                    href={link.href}
                    onClick={handleNavClick}
                    className="font-syne font-extrabold text-4xl text-offwhite hover:text-yellow transition-colors uppercase block w-full text-center"
                  >
                    {link.label}
                  </a>
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mt-4 flex flex-col items-center gap-4"
              >
                <a
                  href="/#explore"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 bg-yellow text-dark font-syne font-bold text-xl px-10 py-5 rounded-full"
                >
                  {t.nav.bookNow} <ArrowRight size={20} />
                </a>

                {/* Install app — always available on phones */}
                <div onClick={() => setMenuOpen(false)}>
                  <InstallAppButton variant="menu" />
                </div>

                {/* Language + currency switchers (mobile) */}
                <div className="flex items-center gap-6">
                  <button
                    onClick={cycleLanguage}
                    className="flex items-center gap-2 text-muted hover:text-yellow font-dm text-sm transition-colors"
                  >
                    <span>{LANGUAGE_FLAGS[language]}</span>
                    <span>{LANGUAGE_NATIVE[language]}</span>
                  </button>
                  <span className="w-px h-4 bg-dark-border" />
                  <button
                    onClick={cycleCurrency}
                    className="flex items-center gap-2 text-muted hover:text-yellow font-dm text-sm transition-colors"
                    aria-label="Change currency"
                  >
                    <span className="font-bold text-yellow">{CURRENCY_SYMBOL[currency]}</span>
                    <span>{currency}</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
