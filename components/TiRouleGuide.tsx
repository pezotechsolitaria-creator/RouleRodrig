"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Compass, UtensilsCrossed, MapPin, Bike, Car, Route as RouteIcon } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/lib/i18n";

/**
 * Ti Roulé — the Roule Rodrigues mascot as a floating island guide.
 * Shows the owner's uploaded character (Admin → Branding → Mascot); tapping him
 * opens a warm greeting panel that routes visitors into the site's real tools
 * (trip planner, food concierge, island guide, vehicles, taxi). No chatbot —
 * he's the friendly face on top of features that already work.
 * Renders nothing until a mascot image is uploaded.
 */

const COPY: Record<Language, {
  name: string;
  greeting: string;
  intro: string;
  close: string;
  items: { plan: string; eat: string; guide: string; ride: string; taxi: string; routes: string };
}> = {
  en: {
    name: "Ti Roulé",
    greeting: "Koman ou lé?",
    intro: "I'm Ti Roulé, your Rodrigues guide. What can I help you find?",
    close: "Close guide",
    items: {
      plan: "Plan my trip",
      eat: "Find me a place to eat",
      guide: "Explore the island guide",
      ride: "Rent a scooter or car",
      taxi: "Find a taxi",
      routes: "Rides & hiking trails",
    },
  },
  fr: {
    name: "Ti Roulé",
    greeting: "Koman ou lé ?",
    intro: "Moi c'est Ti Roulé, votre guide de Rodrigues. Que cherchez-vous ?",
    close: "Fermer le guide",
    items: {
      plan: "Planifier mon séjour",
      eat: "Trouver où manger",
      guide: "Explorer le guide de l'île",
      ride: "Louer un scooter ou une voiture",
      taxi: "Trouver un taxi",
      routes: "Balades & randonnées",
    },
  },
  cr: {
    name: "Ti Roulé",
    greeting: "Koman ou lé?",
    intro: "Mo Ti Roulé, ou gid Rodrigues. Ki ou pe rode?",
    close: "Ferm gid la",
    items: {
      plan: "Plann mo vwayaz",
      eat: "Trouv kot manze",
      guide: "Explor gid lil",
      ride: "Loue enn skooter ou loto",
      taxi: "Trouv enn taxi",
      routes: "Balad & rando",
    },
  },
};

export default function TiRouleGuide({ image }: { image?: string }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!image) return null;

  const c = COPY[language] ?? COPY.en;
  const items = [
    { href: "/#trip-planner", label: c.items.plan, Icon: Compass },
    { href: "/food", label: c.items.eat, Icon: UtensilsCrossed },
    { href: "/#map", label: c.items.guide, Icon: MapPin },
    { href: "/#explore", label: c.items.ride, Icon: Bike },
    { href: "/#routes", label: c.items.routes, Icon: RouteIcon },
    { href: "/taxi", label: c.items.taxi, Icon: Car },
  ];

  return (
    <>
      {/* Floating mascot button — bottom-left (WhatsApp FAB owns bottom-right) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${c.name} — ${c.intro}`}
        className={`fixed bottom-4 left-4 z-[85] transition-opacity duration-300 ${open ? "opacity-0 pointer-events-none" : "opacity-100"}`}
      >
        <span className="relative block rr-mascot-bob">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            className="h-20 w-20 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
            loading="lazy"
          />
          <span className="absolute -top-1 left-14 whitespace-nowrap rounded-full rounded-bl-sm bg-white px-2.5 py-1 font-dm text-[11px] font-medium text-dark shadow-lg">
            {c.greeting}
          </span>
        </span>
      </button>

      {/* Guide panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-[2px]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              role="dialog"
              aria-label={c.name}
              className="fixed bottom-4 left-4 right-4 sm:right-auto sm:w-[360px] z-[87] rounded-3xl border border-white/10 bg-dark-card shadow-[0_24px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden"
            >
              <div className="flex items-start gap-3.5 p-5 pb-4 bg-gradient-to-b from-yellow/[0.07] to-transparent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" className="h-16 w-16 object-contain shrink-0" />
                <div className="min-w-0 pt-0.5">
                  <p className="font-syne font-extrabold text-offwhite text-lg leading-tight">{c.greeting}</p>
                  <p className="font-dm text-muted text-xs mt-1 leading-relaxed">{c.intro}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={c.close}
                  className="ml-auto shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted hover:text-offwhite hover:bg-white/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-3 pb-3 space-y-1">
                {items.map(({ href, label, Icon }) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3 font-dm text-sm text-offwhite/90 hover:bg-white/5 hover:text-offwhite transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow">
                      <Icon size={17} strokeWidth={1.75} />
                    </span>
                    {label}
                  </a>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
