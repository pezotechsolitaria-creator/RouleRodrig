"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { track } from "@vercel/analytics";
import { BedDouble, UtensilsCrossed, Compass, ArrowUpRight, MapPin, MessageCircle, Star, CalendarCheck, Maximize2 } from "lucide-react";
import type { RecommendedContent, RecommendedPlace } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import PlaceBookingModal from "@/components/PlaceBookingModal";
import PlaceDetailModal from "@/components/PlaceDetailModal";
import SaveButton from "@/components/SaveButton";

const CATEGORY: Record<
  RecommendedPlace["category"],
  { icon: React.ElementType; color: string }
> = {
  hotel:      { icon: BedDouble,        color: "bg-amber-400/10 text-amber-400 border-amber-400/30" },
  restaurant: { icon: UtensilsCrossed,  color: "bg-green-500/10 text-green-400 border-green-500/30" },
  activity:   { icon: Compass,          color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
};

// Source tag included in every outbound link/message so leads are attributable.
const SOURCE = "roulerodrigues";

export default function RecommendedPlaces({ content, whatsapp }: { content?: RecommendedContent; whatsapp?: string }) {
  const { t, language } = useLanguage();
  const ts = t.stayEatDo;
  const [filter, setFilter] = useState<string>("all");
  const [bookingPlace, setBookingPlace] = useState<RecommendedPlace | null>(null);
  const [detailPlace, setDetailPlace] = useState<RecommendedPlace | null>(null);

  const PLURAL: Record<RecommendedPlace["category"], string> = {
    hotel: ts.stay, restaurant: ts.eat, activity: ts.do,
  };
  const CATLABEL: Record<RecommendedPlace["category"], string> = {
    hotel: ts.catHotel, restaurant: ts.catRestaurant, activity: ts.catActivity,
  };

  if (!content || !content.enabled) return null;

  const items = (content.items ?? []).filter((p) => p.name);
  if (items.length === 0) return null;

  // Sponsored (featured) places surface first.
  const sorted = [...items].sort((a, b) => Number(b.featured ?? false) - Number(a.featured ?? false));
  const cats = Array.from(new Set(sorted.map((p) => p.category)));
  const showTabs = cats.length > 1;
  const shown = filter === "all" ? sorted : sorted.filter((p) => p.category === filter);

  function waLink(p: RecommendedPlace): string {
    const ref = `${SOURCE}-${p.id}`;
    const msg =
      `Hi ${p.name}! 👋\n\n` +
      `I found you via Roule Rodrigues (${CATLABEL[p.category]}).\n` +
      `I'd like to book / enquire.\n\n` +
      `Ref: ${ref}`;
    return `https://wa.me/${(p.whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
  }

  function logLead(p: RecommendedPlace, type: "whatsapp" | "link") {
    try {
      track("stay_eat_do_lead", { business: p.name, category: p.category, type, ref: `${SOURCE}-${p.id}` });
    } catch {
      /* analytics is best-effort */
    }
    // Durable record for the admin Leads dashboard (keepalive survives navigation)
    try {
      fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "stay_eat_do", target_name: p.name, category: p.category, type, ref: `${SOURCE}-${p.id}` }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* best-effort */
    }
  }

  return (
    <section id="recommended" className="bg-dark py-24 md:py-32 scroll-mt-24" aria-label="Recommended places">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{ts.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-[0.95]"
            style={{ fontSize: "clamp(32px, 7vw, 72px)" }}
          >
            {content.title}
          </h2>
          {content.subtitle && (
            <p className="text-muted font-dm text-sm md:text-base mt-3 max-w-lg">{content.subtitle}</p>
          )}
        </motion.div>

        {/* Category filter */}
        {showTabs && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                filter === "all"
                  ? "bg-yellow text-dark border-yellow font-bold"
                  : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
              }`}
            >
              {ts.all}
            </button>
            {cats.map((c) => {
              const cfg = CATEGORY[c];
              return (
                <button
                  key={c}
                  onClick={() => setFilter(c)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                    filter === c
                      ? "bg-yellow text-dark border-yellow font-bold"
                      : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
                  }`}
                >
                  <cfg.icon size={13} /> {PLURAL[c]}
                </button>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map((p, i) => {
            const cfg = CATEGORY[p.category];
            const isExternal = p.link?.startsWith("http");
            const hasWa = !!(p.whatsapp && p.whatsapp.replace(/\D/g, "").length >= 6);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
                className={`bg-dark-card rounded-2xl overflow-hidden flex flex-col transition-colors group ${
                  p.featured
                    ? "border-2 border-yellow/50 hover:border-yellow shadow-[0_0_24px_rgba(245,200,66,0.08)]"
                    : "border border-dark-border hover:border-yellow/40"
                }`}
              >
                {/* Image — opens the detail view */}
                <div
                  onClick={() => setDetailPlace(p)}
                  className="relative h-44 bg-gradient-to-br from-yellow/10 via-dark-card to-dark overflow-hidden cursor-pointer"
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <cfg.icon size={36} className="text-yellow/30" />
                    </div>
                  )}
                  <span className={`absolute top-3 left-3 flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-full backdrop-blur-sm ${cfg.color}`}>
                    <cfg.icon size={10} /> {p.isTour ? "Tour" : CATLABEL[p.category]}
                  </span>
                  {p.featured && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow text-dark px-2.5 py-1 rounded-full">
                      <Star size={8} className="fill-dark" /> {ts.sponsored}
                    </span>
                  )}
                  <div className="absolute bottom-3 right-3 z-10">
                    <SaveButton
                      item={{ id: p.id, type: "place", name: p.name, image: p.image, href: `/browse/${p.isTour ? "tours" : p.category === "hotel" ? "stays" : p.category === "activity" ? "activities" : "restaurants"}`, meta: p.isTour ? "Tour" : CATLABEL[p.category] }}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white hover:bg-black/65 transition-colors"
                      size={15}
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-syne font-bold text-offwhite text-base mb-1.5">{p.name}</h3>
                  <p className="text-muted/85 font-dm text-sm leading-relaxed flex-1">{loc(language, p.description, p.descriptionFr, p.descriptionCr)}</p>

                  <div className="flex items-center gap-2 flex-wrap mt-4">
                    <button
                      onClick={() => setDetailPlace(p)}
                      className="flex items-center gap-1.5 border border-dark-border text-offwhite/80 hover:border-yellow/50 hover:text-yellow text-xs font-syne font-bold px-3.5 py-2 rounded-full transition-colors"
                    >
                      <Maximize2 size={12} /> Details
                    </button>
                    {p.bookable && (
                      <button
                        onClick={() => setBookingPlace(p)}
                        className="flex items-center gap-1.5 bg-yellow text-dark hover:bg-yellow-dark text-xs font-syne font-bold px-3.5 py-2 rounded-full transition-colors"
                      >
                        <CalendarCheck size={13} /> Book now
                      </button>
                    )}
                    {hasWa && (
                      <a
                        href={waLink(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => logLead(p, "whatsapp")}
                        className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-syne font-bold px-3.5 py-2 rounded-full transition-colors"
                      >
                        <MessageCircle size={13} /> {ts.bookEnquire}
                      </a>
                    )}
                    {p.link && (
                      <a
                        href={p.link}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noopener noreferrer" : undefined}
                        onClick={() => logLead(p, "link")}
                        className="inline-flex items-center gap-1.5 text-yellow hover:text-yellow-dark text-xs font-syne font-bold transition-colors"
                      >
                        {p.linkText || (isExternal ? ts.visit : ts.viewMap)}
                        {isExternal ? <ArrowUpRight size={13} /> : <MapPin size={13} />}
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="text-muted/40 font-dm text-[11px] mt-8 text-center max-w-2xl mx-auto leading-relaxed">
          {ts.disclaimer}
        </p>
      </div>
      {detailPlace && (
        <PlaceDetailModal
          place={detailPlace}
          whatsapp={whatsapp}
          onBook={() => setBookingPlace(detailPlace)}
          onClose={() => setDetailPlace(null)}
        />
      )}
      {bookingPlace && (
        <PlaceBookingModal
          place={bookingPlace}
          whatsapp={whatsapp}
          onClose={() => setBookingPlace(null)}
        />
      )}
    </section>
  );
}
