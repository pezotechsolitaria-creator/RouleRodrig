"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, BedDouble, UtensilsCrossed, Compass, CalendarCheck, MessageCircle, ArrowUpRight, MapPin, CheckCircle } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

const CAT: Record<RecommendedPlace["category"], { icon: React.ElementType; color: string }> = {
  hotel: { icon: BedDouble, color: "bg-amber-400/10 text-amber-400 border-amber-400/30" },
  restaurant: { icon: UtensilsCrossed, color: "bg-green-500/10 text-green-400 border-green-500/30" },
  activity: { icon: Compass, color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
};

export default function PlaceDetailModal({
  place,
  whatsapp,
  onBook,
  onClose,
}: {
  place: RecommendedPlace;
  whatsapp?: string;
  onBook: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ts = t.stayEatDo;
  const catLabel = { hotel: ts.catHotel, restaurant: ts.catRestaurant, activity: ts.catActivity }[place.category];
  const cfg = CAT[place.category];
  const photos = place.images && place.images.length > 0 ? place.images : place.image ? [place.image] : [];
  const [idx, setIdx] = useState(0);
  const highlights = (place.highlights ?? []).filter(Boolean);
  const isExternal = place.link?.startsWith("http");
  const hasWa = !!(place.whatsapp && place.whatsapp.replace(/\D/g, "").length >= 6);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const waHref = hasWa
    ? `https://wa.me/${(place.whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${place.name}! I found you via Roule Rodrigues — I'd like to enquire.`)}`
    : whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Roule Rodrigues! I'd like to know more about ${place.name}.`)}`
    : "";

  const src = photos[idx];
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-dark-card border border-dark-border rounded-2xl relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Close">
          <X size={18} />
        </button>

        {/* Gallery */}
        <div className="relative h-56 sm:h-72 bg-gradient-to-br from-yellow/10 via-dark-card to-dark overflow-hidden rounded-t-2xl">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={`${place.name} — photo ${idx + 1}`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><Icon size={44} className="text-yellow/30" /></div>
          )}
          <span className={`absolute top-4 left-4 flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.2em] border px-2.5 py-1 rounded-full backdrop-blur-sm ${cfg.color}`}>
            <Icon size={11} /> {catLabel}
          </span>
          {photos.length > 1 && (
            <>
              <button onClick={() => setIdx((i) => (i - 1 + photos.length) % photos.length)} className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Previous photo"><ChevronLeft size={18} /></button>
              <button onClick={() => setIdx((i) => (i + 1) % photos.length)} className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Next photo"><ChevronRight size={18} /></button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                {photos.map((_, i) => (
                  <button key={i} onClick={() => setIdx(i)} className={`h-1.5 rounded-full transition-all ${i === idx ? "bg-yellow w-4" : "bg-white/50 w-1.5"}`} aria-label={`Photo ${i + 1}`} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-6 sm:p-8">
          <h3 className="font-syne font-extrabold text-offwhite text-2xl sm:text-3xl leading-tight">{place.name}</h3>
          {place.priceNote && <p className="text-yellow/90 font-dm text-sm mt-1">{place.priceNote}</p>}

          <p className="text-muted/85 font-dm text-sm leading-relaxed mt-4">{place.description}</p>

          {highlights.length > 0 && (
            <div className="mt-6">
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-3">HIGHLIGHTS</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {highlights.map((h) => (
                  <li key={h} className="flex items-center gap-2 text-xs font-dm text-offwhite/70">
                    <CheckCircle size={13} className="text-yellow shrink-0" /> {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-7 flex-wrap">
            {place.bookable && (
              <button
                onClick={() => { onBook(); onClose(); }}
                className="flex-1 min-w-[160px] flex items-center justify-center gap-2 bg-yellow text-dark font-syne font-bold text-base py-3.5 rounded-xl hover:bg-yellow-dark transition-colors"
              >
                <CalendarCheck size={16} /> Book now
              </button>
            )}
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-green-500/15 text-green-400 hover:bg-green-500/25 font-syne font-bold text-sm py-3.5 px-5 rounded-xl transition-colors">
                <MessageCircle size={16} /> {ts.bookEnquire}
              </a>
            )}
            {place.link && (
              <a href={place.link} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} className="flex items-center justify-center gap-2 border border-dark-border text-offwhite/80 hover:border-yellow/50 hover:text-yellow font-syne font-bold text-sm py-3.5 px-5 rounded-xl transition-colors">
                {place.linkText || (isExternal ? ts.visit : ts.viewMap)}
                {isExternal ? <ArrowUpRight size={15} /> : <MapPin size={15} />}
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
