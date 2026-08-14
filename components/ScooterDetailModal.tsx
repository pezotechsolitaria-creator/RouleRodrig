"use client";

import { useState, useEffect } from "react";
import ModalPortal from "@/components/ModalPortal";
import Image from "next/image";
import { motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Star, ArrowRight, BadgeCheck, Ban, CheckCircle, MessageCircle } from "lucide-react";
import type { FleetItem } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { loc } from "@/lib/localize";
import { useCurrency } from "@/context/CurrencyContext";

interface Spec {
  icon: React.ElementType;
  label: string;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= Math.round(value) ? "text-yellow fill-yellow" : "text-muted/30"}
        />
      ))}
    </span>
  );
}

export default function ScooterDetailModal({
  scooter,
  specs,
  included,
  rating,
  whatsapp,
  onClose,
}: {
  scooter: FleetItem;
  specs: Spec[];
  included?: string[];
  rating?: { avg: number; count: number };
  whatsapp?: string;
  onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const { convert } = useCurrency();
  const photos = scooter.images && scooter.images.length > 0 ? scooter.images : scooter.image ? [scooter.image] : [];
  const [idx, setIdx] = useState(0);
  const out = scooter.available === false || scooter.soldOutToday === true;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function book() {
    if (out) return;
    window.dispatchEvent(new CustomEvent("rr:prefill-booking", { detail: { scooter: scooter.id } }));
    onClose();
    setTimeout(() => { window.location.hash = "#booking"; }, 60);
  }

  const src = photos[idx];
  const isUpload = !!src && (src.startsWith("/uploads/") || src.startsWith("http"));

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-dark-card border border-dark-border rounded-2xl relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Gallery */}
        <div className="relative h-64 sm:h-80 bg-dark overflow-hidden rounded-t-2xl">
          {src ? (
            <Image
              src={src}
              alt={`${scooter.name} — photo ${idx + 1}`}
              fill
              className={`object-cover ${out ? "brightness-50" : ""}`}
              sizes="(max-width: 768px) 100vw, 700px"
              unoptimized={isUpload}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted/30">No photo</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-transparent to-transparent" />

          {/* Badges */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="font-bebas text-xs tracking-[0.2em] bg-yellow text-dark px-3 py-1.5 rounded-full">{scooter.badge}</span>
            {out ? (
              <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-red-500/90 text-white px-3 py-1.5 rounded-full"><Ban size={10} /> {t.fleet.unavailable}</span>
            ) : (
              <span className="flex items-center gap-1.5 font-bebas text-[10px] tracking-[0.15em] bg-green-500/90 text-white px-3 py-1.5 rounded-full"><BadgeCheck size={10} /> {t.fleet.available}</span>
            )}
          </div>

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
          <p className="font-bebas text-muted text-xs tracking-[0.2em] uppercase mb-1">{loc(language, scooter.tagline, scooter.taglineFr, scooter.taglineCr)}</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h3 className="font-syne font-extrabold text-offwhite uppercase leading-none" style={{ fontSize: "clamp(30px, 6vw, 44px)" }}>{scooter.name}</h3>
            <div className="text-right">
              <span className="font-syne font-extrabold text-yellow text-2xl">{convert(scooter.price)}</span>
              <span className="font-dm text-muted text-sm ml-1">{scooter.unit}</span>
            </div>
          </div>

          {rating && rating.count > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <Stars value={rating.avg} />
              <span className="font-dm text-offwhite text-sm font-medium">{rating.avg.toFixed(1)}</span>
              <span className="font-dm text-muted text-xs">({rating.count} review{rating.count !== 1 ? "s" : ""})</span>
            </div>
          )}

          <p className="text-muted/85 font-dm text-sm leading-relaxed mt-4">{loc(language, scooter.description, scooter.descriptionFr, scooter.descriptionCr)}</p>

          {/* Spec grid */}
          {specs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {specs.map((spec) => {
                const Icon = spec.icon;
                return (
                  <div key={spec.label} className="bg-dark border border-dark-border rounded-xl p-3 flex flex-col items-center text-center gap-1.5">
                    <Icon size={18} className="text-yellow" />
                    <span className="font-dm text-offwhite/80 text-[11px] leading-tight">{spec.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* What's included */}
          {(included ?? []).length > 0 && (
            <div className="mt-6">
              <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-3">{t.booking.includedTitle}</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(included ?? []).map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs font-dm text-offwhite/70">
                    <CheckCircle size={13} className="text-yellow shrink-0" /> {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-7 flex-wrap">
            <button
              onClick={book}
              disabled={out}
              className={`flex-1 min-w-[180px] flex items-center justify-center gap-2 font-syne font-bold text-base py-3.5 rounded-xl transition-colors ${
                out ? "bg-dark-border text-muted cursor-not-allowed" : "bg-yellow text-dark hover:bg-yellow-dark"
              }`}
            >
              {out ? t.fleet.unavailableBtn : <>{t.fleet.bookNow} <ArrowRight size={16} /></>}
            </button>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi Roule Rodrigues! I have a question about the ${scooter.name}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500/15 text-green-400 hover:bg-green-500/25 font-syne font-bold text-sm py-3.5 px-5 rounded-xl transition-colors"
              >
                <MessageCircle size={16} /> Ask a question
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </div>
    </ModalPortal>
  );
}
