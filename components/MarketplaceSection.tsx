"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Phone, Tag, Star, Loader2, Truck, ShoppingBag, UtensilsCrossed, MessageCircle, Navigation, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { MarketplaceListing } from "@/lib/supabase/types";
import { useLanguage } from "@/context/LanguageContext";

const CATEGORY_CONFIG: Record<
  string,
  { label: string; emoji: string; color: string }
> = {
  restaurant:    { label: "Restaurant",   emoji: "🍽️", color: "bg-green-500/10 text-green-400 border-green-500/30" },
  tour:          { label: "Tour",         emoji: "🧭", color: "bg-blue-500/10   text-blue-400  border-blue-500/30" },
  activity:      { label: "Activity",     emoji: "🤿", color: "bg-purple-500/10 text-purple-400 border-purple-500/30" },
  accommodation: { label: "Accommodation",emoji: "🏡", color: "bg-amber-400/10  text-amber-400 border-amber-400/30" },
  shopping:      { label: "Shopping",     emoji: "🛍️", color: "bg-pink-500/10   text-pink-400  border-pink-500/30" },
};

function ListingCarousel({ listing }: { listing: MarketplaceListing }) {
  // Merge images[] (new) and image_url (legacy) into one photo array.
  const all: string[] = [];
  if (listing.images && listing.images.length > 0) {
    all.push(...listing.images);
  } else if (listing.image_url) {
    all.push(listing.image_url);
  }

  const [idx, setIdx] = useState(0);
  if (all.length === 0) return null;

  const prev = (e: React.MouseEvent) => {
    e.preventDefault();
    setIdx((i) => (i - 1 + all.length) % all.length);
  };
  const next = (e: React.MouseEvent) => {
    e.preventDefault();
    setIdx((i) => (i + 1) % all.length);
  };

  return (
    <div className="-mx-6 -mt-6 mb-4 h-44 overflow-hidden rounded-t-2xl relative group/photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={all[idx]}
        alt=""
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        loading="lazy"
      />
      {all.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity hover:bg-black/80"
            aria-label="Previous"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity hover:bg-black/80"
            aria-label="Next"
          >
            <ChevronRight size={14} />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {all.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); setIdx(i); }}
                className={`h-1 rounded-full transition-all ${i === idx ? "bg-yellow w-3" : "bg-white/50 w-1"}`}
                aria-label={`Photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketplaceSection() {
  const { t } = useLanguage();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/marketplace")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setListings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && listings.length === 0) return null;

  const categories = ["all", ...Array.from(new Set(listings.map((l) => l.category)))];
  const filtered = filter === "all" ? listings : listings.filter((l) => l.category === filter);

  return (
    <section id="marketplace" className="bg-dark py-24 md:py-36" aria-label="Local deals marketplace">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <p className="font-bebas text-yellow text-xs tracking-[0.35em] mb-2">{t.marketplace.eyebrow}</p>
          <h2
            className="font-syne font-extrabold text-offwhite uppercase leading-none"
            style={{ fontSize: "clamp(32px, 7vw, 72px)" }}
          >
            {t.marketplace.title}
          </h2>
          <p className="text-muted font-dm text-sm md:text-base mt-4 max-w-lg">
            {t.marketplace.subtitle}
          </p>
        </motion.div>

        {loading ? (
          <div className="flex items-center gap-3 text-muted font-dm text-sm py-12">
            <Loader2 size={18} className="animate-spin text-yellow" /> Loading offers…
          </div>
        ) : (
          <>
            {categories.length > 2 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {categories.map((cat) => {
                  const cfg = cat === "all" ? null : CATEGORY_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilter(cat)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-dm border transition-colors ${
                        filter === cat
                          ? "bg-yellow text-dark border-yellow font-bold"
                          : "border-dark-border text-muted hover:border-yellow/40 hover:text-offwhite"
                      }`}
                    >
                      {cfg ? <span>{cfg.emoji}</span> : null}
                      {cat === "all" ? "All" : cfg?.label ?? cat}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((listing, i) => {
                const cfg = CATEGORY_CONFIG[listing.category] ?? {
                  label: listing.category,
                  emoji: "🏪",
                  color: "bg-muted/10 text-muted border-muted/20",
                };
                return (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.6, delay: i * 0.07 }}
                    className="bg-dark-card border border-dark-border rounded-2xl p-6 flex flex-col hover:border-yellow/40 transition-colors group"
                  >
                    {/* Photo carousel (handles multi + legacy single) */}
                    <ListingCarousel listing={listing} />

                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex items-center gap-1.5 font-bebas text-[9px] tracking-[0.2em] border px-2.5 py-1 rounded-full ${cfg.color}`}>
                            <span>{cfg.emoji}</span>
                            {cfg.label.toUpperCase()}
                          </span>
                          {listing.featured && (
                            <span className="flex items-center gap-1 font-bebas text-[9px] tracking-[0.15em] bg-yellow/10 text-yellow border border-yellow/30 px-2.5 py-1 rounded-full">
                              <Star size={8} className="fill-yellow" /> FEATURED
                            </span>
                          )}
                        </div>
                        <h3 className="font-syne font-bold text-offwhite text-base">
                          {listing.business_name}
                        </h3>
                      </div>
                    </div>

                    <p className="text-muted font-dm text-sm leading-relaxed flex-1 mb-4">
                      {listing.description}
                    </p>

                    {(listing.delivery || listing.pickup || listing.dine_in) && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {listing.delivery && (
                          <span className="flex items-center gap-1.5 text-[11px] font-dm text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full">
                            <Truck size={11} /> Delivery
                          </span>
                        )}
                        {listing.pickup && (
                          <span className="flex items-center gap-1.5 text-[11px] font-dm text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded-full">
                            <ShoppingBag size={11} /> Pickup
                          </span>
                        )}
                        {listing.dine_in && (
                          <span className="flex items-center gap-1.5 text-[11px] font-dm text-amber-400 bg-amber-400/10 border border-amber-400/25 px-2.5 py-1 rounded-full">
                            <UtensilsCrossed size={11} /> Dine-in
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 bg-yellow/5 border border-yellow/20 rounded-xl px-4 py-3 mb-5">
                      <Tag size={13} className="text-yellow shrink-0 mt-0.5" />
                      <p className="text-yellow font-dm text-sm font-medium leading-snug">
                        {listing.offer}
                      </p>
                    </div>

                    {listing.hours && (
                      <p className="flex items-center gap-1.5 text-xs font-dm text-muted/70 mb-3">
                        <Clock size={11} className="text-yellow/70" /> {listing.hours}
                      </p>
                    )}

                    <div className="flex items-center gap-2 flex-wrap mt-auto">
                      {listing.whatsapp && (
                        <a
                          href={`https://wa.me/${listing.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${listing.business_name}, I found you on Roule Rodrigues 🛵`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-syne font-bold px-3.5 py-2 rounded-full transition-colors"
                        >
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                      )}
                      {listing.maps_url && (
                        <a
                          href={listing.maps_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 bg-yellow/10 text-yellow hover:bg-yellow/20 text-xs font-syne font-bold px-3.5 py-2 rounded-full transition-colors"
                        >
                          <Navigation size={12} /> Directions
                        </a>
                      )}
                      {!listing.whatsapp && listing.contact && (
                        <a
                          href={listing.contact.startsWith("+") || listing.contact.startsWith("0")
                            ? `tel:${listing.contact}`
                            : `https://wa.me/${listing.contact.replace(/\D/g, "")}`}
                          className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors"
                        >
                          <Phone size={11} /> {listing.contact}
                        </a>
                      )}
                      {listing.website && (
                        <a
                          href={listing.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-yellow transition-colors ml-auto"
                        >
                          Visit <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <p className="text-muted/40 font-dm text-xs mt-8 text-center">
              Partner deals are exclusive to Roule Rodrigues customers. Mention your rental when you visit.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
