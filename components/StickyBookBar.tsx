"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ArrowRight } from "lucide-react";
import { useFavorites } from "@/context/FavoritesContext";
import { useLanguage } from "@/context/LanguageContext";

const COPY = {
  en: { book: "Book a scooter" },
  fr: { book: "Réserver" },
  cr: { book: "Rezerv" },
} as const;

function waLink(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || /x/i.test(raw)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent("Hi! I'd like to rent a scooter on Rodrigues.")}`;
}

/**
 * Mobile-only sticky action bar. Appears after the hero and consolidates the
 * three key actions (Saved · Book · WhatsApp) into one clean bar — while it's
 * visible the floating corner buttons are hidden (see globals.css) so the
 * screen never feels cluttered. Hidden when the booking form is in view.
 */
export default function StickyBookBar({ whatsapp = "" }: { whatsapp?: string }) {
  const { count, hydrated } = useFavorites();
  const { language } = useLanguage();
  const c = COPY[language as keyof typeof COPY] ?? COPY.en;
  const [visible, setVisible] = useState(false);
  const wa = waLink(whatsapp);

  useEffect(() => {
    const onScroll = () => {
      const pastHero = window.scrollY > window.innerHeight * 0.85;
      // Don't duplicate the CTA while the booking form is on screen
      const booking = document.getElementById("booking");
      const inBooking = booking
        ? (() => { const r = booking.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; })()
        : false;
      setVisible(pastHero && !inBooking);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Toggle a body flag so the floating corner buttons hide on mobile (globals.css)
  useEffect(() => {
    document.body.classList.toggle("rr-bookbar-on", visible);
    return () => document.body.classList.remove("rr-bookbar-on");
  }, [visible]);

  return (
    <div
      className={`md:hidden fixed inset-x-0 bottom-0 z-[95] transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <div className="mx-3 mb-3 flex items-center gap-2 rounded-2xl bg-dark-card/95 backdrop-blur-md border border-white/15 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] p-2">
        {hydrated && count > 0 && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("rr:open-saved"))}
            aria-label={`Saved (${count})`}
            className="relative shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-dark border border-white/10"
          >
            <Heart size={18} className="fill-red-500 text-red-500" />
            <span className="absolute -top-1.5 -right-1.5 bg-yellow text-dark text-[10px] font-syne font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{count}</span>
          </button>
        )}
        <Link
          href="#booking"
          className="flex-1 flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-sm py-3 rounded-xl active:scale-[0.98] transition-transform"
        >
          {c.book} <ArrowRight size={16} />
        </Link>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-[#25D366]"
          >
            <svg viewBox="0 0 32 32" width="20" height="20" fill="#fff" aria-hidden="true">
              <path d="M16.003 3C9.38 3 4 8.38 4 15.003c0 2.117.553 4.184 1.604 6.01L4 29l8.166-1.57a11.94 11.94 0 0 0 3.837.63h.003C22.623 28.06 28 22.68 28 16.057 28 9.433 22.626 3 16.003 3z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
